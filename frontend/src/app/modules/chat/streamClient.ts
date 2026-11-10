import { apiFetch } from '../../apiFetch';
import { handleApiError } from '../../extensions';

export interface ChatEvent {
  // `tool_call`   → { name, args }       — tool invocation about to run
  // `tool_result` → { name, preview }    — truncated result from that tool
  // `proposal`    → { proposal_id, capability, args, proposal }
  // `token`       → string               — assistant text chunk
  // `thread`      → string               — thread_id (first event)
  // `invalidates` → string[]             — D31: staleness domains the just-
  //                                        applied write bumped (accept path
  //                                        only). Frontend pipes these into
  //                                        `handleDispatchInvalidates` so
  //                                        TanStack-subscribed pages refetch.
  // `ping`        → { question, options } — ask_user surface ping; answer via
  //                                         answerPing() to resume the graph
  // `error`       → string               — fatal mid-stream error
  type:
    | 'token'
    | 'tool_call'
    | 'tool_result'
    | 'proposal'
    | 'ping'
    | 'thread'
    | 'invalidates'
    | 'done'
    | 'error';
  data: any;
}

interface StreamArgs {
  /** API path, e.g. `/consistency/projects/7/chat/` (see config/api.ts). */
  path: string;
  body: any;
  onEvent: (e: ChatEvent) => void;
  signal?: AbortSignal;
}

async function streamSSE({ path, body, onEvent, signal }: StreamArgs) {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    let j: any;
    try {
      j = await res.json();
      detail = j.error ?? detail;
    } catch { /* ignored */ }
    // The extension may handle it too (e.g. open its own modal); the turn
    // still ends with the error either way.
    handleApiError(res.status, j);
    onEvent({ type: 'error', data: detail });
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop()!;
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch { /* ignored */ }
      }
    }
  }
}

export interface StreamChatArgs {
  projectId: string;
  message: string;
  threadId: string | null;
  page: string;
  /** Hidden context — structured side-data injected into the prompt (not the
   *  user's message). e.g. `{ live_hints: [...] }`. See backend
   *  actions/chat/context_blocks.py. */
  context?: Record<string, any>;
  /** Model tier the author pinned in the picker ('auto'|'quick'|'standard'|
   *  'deep'). Backend resolves 'auto' via per-turn heuristics. */
  tier?: string;
  onEvent: (e: ChatEvent) => void;
  signal?: AbortSignal;
}

export async function streamChat({
  projectId, message, threadId, page, context, tier, onEvent, signal,
}: StreamChatArgs) {
  await streamSSE({
    path: `/consistency/projects/${projectId}/chat/`,
    body: { message, thread_id: threadId, page, context, tier },
    onEvent,
    signal,
  });
}

// Answer an `ask_user` surface ping — resumes the paused graph with the reply.
export async function answerPing({
  projectId, threadId, answer, page, context, onEvent, signal,
}: {
  projectId: string;
  threadId: string;
  answer: string;
  page: string;
  /** Hidden context — same shape as streamChat's, forwarded to the resumed
   *  turn so frame context_params (e.g. {character_name}) still interpolate. */
  context?: Record<string, any>;
  onEvent: (e: ChatEvent) => void;
  signal?: AbortSignal;
}) {
  await streamSSE({
    path: `/consistency/projects/${projectId}/ping-answer/`,
    body: { thread_id: threadId, answer, page, context },
    onEvent,
    signal,
  });
}



export interface ThreadSummary {
  thread_id: string;
  title: string;
  page: string;
  last_message_at: string;
}

export async function fetchThreads(projectId: string): Promise<ThreadSummary[]> {
  const res = await apiFetch(`/consistency/projects/${projectId}/threads/`);
  if (!res.ok) return [];
  const body = await res.json();
  return body.threads ?? [];
}

/**
 * Full transcript of one past conversation, shaped for the chat store
 * (`{id, role, content, status, events}` turns). Used when the author picks a
 * thread from the history drawer — we reload its messages into the panel
 * instead of opening it blank. Returns [] if the thread has no checkpoint yet
 * or the read fails (the conversation just opens empty and can be continued).
 */
export async function fetchThreadMessages(
  projectId: string,
  threadId: string,
): Promise<any[]> {
  const res = await apiFetch(
    `/consistency/projects/${projectId}/threads/${threadId}/messages/`,
  );
  if (!res.ok) return [];
  const body = await res.json();
  return body.messages ?? [];
}

/**
 * Pending proposal payload returned by GET /pending-proposals/. Mirrors
 * the shape the SSE `proposal` event delivers, so the frontend's
 * rehydration path can seed `useProposalStore` with the same renderer
 * handling it gets for live proposals.
 */
export interface PendingProposalRow {
  proposal_id: number;
  capability: string;
  args: any;
  proposal: any;
  page: string;
  source: 'chat' | 'button' | 'cron';
  created_at: string;
}

export async function fetchPendingProposals(
  projectId: string,
): Promise<PendingProposalRow[]> {
  const res = await apiFetch(
    `/consistency/projects/${projectId}/pending-proposals/`,
  );
  if (!res.ok) return [];
  const body = await res.json();
  return body.proposals ?? [];
}

/**
 * The page frame (GET /frame/?page=). Night Eyes uses `quick_actions` to render
 * the per-page chip starters; the rest of the frame (reads/actions/prompt) is
 * not used by the UI.
 */
export interface FrameInfo {
  page: string;
  quick_actions: string[];
}

export async function fetchFrame(
  projectId: string,
  page: string,
): Promise<FrameInfo | null> {
  const res = await apiFetch(
    `/consistency/projects/${projectId}/frame/?page=${encodeURIComponent(page)}`,
  );
  if (!res.ok) return null;
  try {
    const body = await res.json();
    return { page: body.page ?? page, quick_actions: body.quick_actions ?? [] };
  } catch {
    return null;
  }
}
