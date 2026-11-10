import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Super-lightweight chat store. One "message" is a turn (user OR assistant).
// Assistant turns carry an ordered `events` log so the UI can render thinking
// steps, tool calls, and proposals inline as they stream in. No shared types
// with the backend — `any` is fine here (CLAUDE.md frontend rule).
//
// Persistence: threadId + messages survive page reload via the zustand
// `persist` middleware (localStorage key `wv:nighteyes:chat`). The backend
// checkpointer is the source of truth (D25); the persisted messages are
// display state only — they bring the visible history back after refresh so
// the chat panel doesn't go blank. `isStreaming` is reset on hydrate and any
// half-streamed assistant message is marked `error` so the UI doesn't sit on
// a "thinking…" placeholder forever.

type Role = 'user' | 'assistant';

interface ChatEventLog {
  kind: 'token' | 'tool_call' | 'tool_result' | 'proposal' | 'note';
  // `tool_call`:   data = { name, args }
  // `tool_result`: data = { name, preview }  — pairs with the most recent
  //                tool_call of the same name (the SSE stream is in-order)
  // `proposal`:    data = { proposal_id, capability, args, proposal, status }
  //                status: 'pending' | 'accepted' | 'rejected'
  // `note`:        data = string (e.g. "[done]", "[error] ...")
  data: any;
  ts: number;
}

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  status: 'complete' | 'streaming' | 'error';
  // Why the turn failed (e.g. the server refused the AI call). Kept apart from `content` so a
  // reply that already streamed text still shows the error under it (SA-296).
  error?: string;
  events: ChatEventLog[];
}

interface ChatStore {
  // The conversation is project-scoped. `threadId`/`messages` are the LIVE
  // conversation for `projectId`; `byProject` is the per-project memory of every
  // other project's last conversation. `ensureProject` swaps between them on a
  // project change, so each project resumes its own chat and one project's chat
  // never surfaces in another.
  projectId: string | null;
  byProject: Record<string, { threadId: string | null; messages: ChatMessage[] }>;
  threadId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  isOpen: boolean;
  // Ephemeral "Ask Night Eyes" attachment — a quote the user selected on the
  // page. Folded into the next sent message; not persisted.
  attachment: string | null;
  // Ephemeral starter prompt — a caller (e.g. a World-page hint) can pre-load
  // the composer and pop the panel open by setting this. NightEyes copies it
  // into the input once, then clears it. Not persisted.
  seed: string | null;
  // Anchor mode (persisted) + unread replies received while the panel is
  // closed (ephemeral, reset on open).
  mode: 'float' | 'dock';
  unread: number;
  // Model tier the author pinned ('auto' = heuristics pick per turn). Persisted.
  tier: 'auto' | 'quick' | 'standard' | 'deep';

  setThreadId: (id: string) => void;
  setAttachment: (text: string | null) => void;
  setSeed: (text: string | null) => void;
  setMode: (mode: 'float' | 'dock') => void;
  toggleDock: () => void;
  setTier: (tier: 'auto' | 'quick' | 'standard' | 'deep') => void;
  ensureProject: (projectId: string) => void;
  newThread: () => void;
  switchThread: (id: string) => void;
  loadThread: (id: string, messages: ChatMessage[]) => void;

  addUser: (content: string) => void;
  startAssistant: () => string;
  appendToken: (id: string, token: string) => void;
  addToolCall: (id: string, name: string, args?: any) => void;
  addToolResult: (id: string, name: string, preview: string) => void;
  addProposal: (id: string, proposal: any) => void;
  resolveProposal: (
    id: string, proposalId: number, status: 'accepted' | 'rejected',
  ) => void;
  addNote: (id: string, note: string) => void;
  complete: (id: string) => void;
  fail: (id: string, err: string) => void;

  toggle: () => void;
  open: () => void;
  close: () => void;
  clear: () => void;
}

const STORAGE_KEY = 'wv:nighteyes:chat';

const now = () => Date.now();

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
  projectId: null,
  byProject: {},
  threadId: null,
  messages: [],
  isStreaming: false,
  isOpen: false,
  attachment: null,
  seed: null,
  mode: 'float',
  unread: 0,
  tier: 'auto',

  setThreadId: (id) => set({ threadId: id }),
  setAttachment: (text) => set({ attachment: text }),
  setSeed: (text) => set({ seed: text }),
  setMode: (mode) => set({ mode }),
  toggleDock: () => set((s) => ({ mode: s.mode === 'dock' ? 'float' : 'dock' })),
  setTier: (tier) => set({ tier }),

  // Bind the live conversation to a project. Same project → no-op (the
  // in-progress chat stays). Different project → stash the outgoing project's
  // chat into `byProject`, then restore the incoming project's saved chat (or a
  // fresh one if it has none). This way each project resumes its own last chat,
  // and another project's chat never surfaces here. Past chats also stay
  // reachable via the history drawer.
  ensureProject: (projectId) =>
    set((s) => {
      if (s.projectId === projectId) return {};
      const byProject = { ...s.byProject };
      if (s.projectId) {
        byProject[s.projectId] = { threadId: s.threadId, messages: s.messages };
      }
      const saved = byProject[projectId];
      return {
        projectId,
        byProject,
        threadId: saved?.threadId ?? null,
        messages: saved?.messages ?? [],
        isStreaming: false,
      };
    }),

  newThread: () => set({ threadId: null, messages: [], isStreaming: false }),

  switchThread: (id) =>
    set({ threadId: id, messages: [], isStreaming: false }),

  // Open a past conversation with its transcript loaded (fetched from the
  // backend checkpointer). Replaces the visible conversation with `messages`
  // and points the live thread at `id` so the next turn continues it.
  loadThread: (id, messages) =>
    set({ threadId: id, messages: messages ?? [], isStreaming: false }),

  addUser: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `u-${now()}`, role: 'user', content,
          status: 'complete', events: [],
        },
      ],
    })),

  startAssistant: () => {
    const id = `a-${now()}`;
    set((s) => ({
      isStreaming: true,
      messages: [
        ...s.messages,
        { id, role: 'assistant', content: '', status: 'streaming', events: [] },
      ],
    }));
    return id;
  },

  appendToken: (id, token) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + token } : m,
      ),
    })),

  addToolCall: (id, name, args) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? {
              ...m,
              events: [
                ...m.events,
                { kind: 'tool_call', data: { name, args: args ?? {} }, ts: now() },
              ],
            }
          : m,
      ),
    })),

  addToolResult: (id, name, preview) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? {
              ...m,
              events: [
                ...m.events,
                { kind: 'tool_result', data: { name, preview }, ts: now() },
              ],
            }
          : m,
      ),
    })),

  addProposal: (id, proposal) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? {
              ...m,
              events: [
                ...m.events,
                {
                  kind: 'proposal',
                  data: { ...proposal, status: 'pending' },
                  ts: now(),
                },
              ],
            }
          : m,
      ),
    })),

  resolveProposal: (id, proposalId, status) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? {
              ...m,
              events: m.events.map((e) =>
                e.kind === 'proposal' && e.data?.proposal_id === proposalId
                  ? { ...e, data: { ...e.data, status } }
                  : e,
              ),
            }
          : m,
      ),
    })),

  addNote: (id, note) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? { ...m, events: [...m.events, { kind: 'note', data: note, ts: now() }] }
          : m,
      ),
    })),

  complete: (id) =>
    set((s) => ({
      isStreaming: false,
      // Count a finished reply as unread only if the panel is closed.
      unread: s.isOpen ? s.unread : s.unread + 1,
      // The `done` that follows an `error` event must not hide the error.
      messages: s.messages.map((m) =>
        m.id === id && m.status !== 'error' ? { ...m, status: 'complete' } : m,
      ),
    })),

  fail: (id, err) =>
    set((s) => ({
      isStreaming: false,
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, status: 'error', error: err } : m,
      ),
    })),

  toggle: () => set((s) => ({ isOpen: !s.isOpen, unread: s.isOpen ? s.unread : 0 })),
  open: () => set({ isOpen: true, unread: 0 }),
  close: () => set({ isOpen: false }),
  clear: () => set({ messages: [], isStreaming: false }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Persist the conversation + anchor-mode preference; let isStreaming /
      // unread reset on reload. `isOpen` is persisted ONLY in dock mode — a
      // docked sidebar is a fixed anchor and should stay open across reloads
      // (collapsing to the orb on every refresh defeats docking). A floating
      // panel still resets closed.
      partialize: (s) => ({
        projectId: s.projectId, byProject: s.byProject,
        threadId: s.threadId, messages: s.messages, mode: s.mode, tier: s.tier,
        ...(s.mode === 'dock' ? { isOpen: s.isOpen } : {}),
      }),
      // On hydrate, the previous turn may have been mid-stream when the
      // page refreshed — convert any leftover `streaming` messages to a
      // visible error so the UI doesn't get stuck on a thinking placeholder.
      // Heal the live conversation AND every project's stashed chat, so a
      // half-streamed bubble doesn't reappear when you switch back to it.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const heal = (msgs: ChatMessage[]): ChatMessage[] =>
          msgs.map((m) =>
            m.status === 'streaming'
              ? { ...m, status: 'error' as const, error: '(interrupted by refresh)' }
              : m,
          );
        state.messages = heal(state.messages);
        const by = state.byProject ?? {};
        for (const pid of Object.keys(by)) {
          by[pid] = { ...by[pid], messages: heal(by[pid].messages) };
        }
        state.byProject = by;
        state.isStreaming = false;
      },
    },
  ),
);
