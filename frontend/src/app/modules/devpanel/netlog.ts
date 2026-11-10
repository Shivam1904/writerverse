/**
 * netlog.ts — dev-only ring buffer of capability/network calls.
 *
 * Every call in app funnels through `gateway.ts` (callResource/callOp), so
 * instrumenting that ONE chokepoint captures the whole network surface. The
 * gateway calls `netStart` / `netFinish` here, both guarded by `import.meta.env.DEV`
 * at the call site so they never run in a production build.
 *
 * Nothing in the app reads it today (the old floating DevPanel that showed it was
 * removed). Keeps only the last MAX events — it's a live tail for debugging, not an audit log.
 */
import { create } from 'zustand';

export type NetStatus = 'pending' | 'ran' | 'proposed' | 'error';

export interface NetEvent {
  id: number;
  /** Display name: the capability (for `op/<cap>/`) or `METHOD path` otherwise. */
  label: string;
  method: string;
  path: string;
  status: NetStatus;
  ms?: number;
  /** Domains from the `X-Invalidates` response header — the "what just published". */
  invalidates?: string[];
  proposalId?: string;
  httpStatus?: number;
  startedAt: number;
}

const MAX = 50;
let _seq = 0;

interface NetLogState {
  events: NetEvent[];
  clear: () => void;
  _start: (e: NetEvent) => void;
  _finish: (id: number, patch: Partial<NetEvent>) => void;
}

export const useNetLog = create<NetLogState>((set) => ({
  events: [],
  clear: () => set({ events: [] }),
  _start: (e) => set((s) => ({ events: [e, ...s.events].slice(0, MAX) })),
  _finish: (id, patch) =>
    set((s) => ({
      events: s.events.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)),
    })),
}));

/** Derive a readable label from a facade path. `op/get_characters/` → `get_characters`. */
function labelFor(method: string, path: string): string {
  const m = String(path).match(/^op\/(.+?)\/?$/);
  if (m) return m[1];
  return `${method.toUpperCase()} ${path}`;
}

/** Record a call starting. Returns an id to pass to `netFinish`. */
export function netStart(method: string, path: string): number {
  const id = ++_seq;
  useNetLog.getState()._start({
    id,
    label: labelFor(method, path),
    method: method.toUpperCase(),
    path,
    status: 'pending',
    startedAt: Date.now(),
  });
  return id;
}

/** Record a call finishing (success, proposed, or error). */
export function netFinish(id: number, patch: Partial<NetEvent>): void {
  useNetLog.getState()._finish(id, patch);
}
