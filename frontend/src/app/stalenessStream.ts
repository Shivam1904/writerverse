/**
 * Live-update stream: hear about writes made somewhere else (another tab,
 * the chat, a background job) and refresh the parts of the page they changed.
 *
 * The backend (`backend/actions/staleness_stream.py`) reads "what changed
 * when" from the database and sends:
 *   {type:'snapshot',    versions:{domain: version}}            first event
 *   {type:'invalidates', data:[domains], versions:{...}}
 *
 * The server ends each stream after a few minutes (serverless time limit), and
 * networks drop. So this keeps reconnecting until the signal aborts, and sends
 * the last versions it saw as `?since=`. The server then replays any domain
 * that changed while we were away, so nothing is missed.
 */
import { apiFetch } from './apiFetch';

type Versions = Record<string, string>;

/** Wait after a clean end (the server's time limit) before reconnecting. */
const RECONNECT_MS = 500;
/** Backoff after a failed connect / dropped stream: 1s, 2s, 4s … up to 30s. */
const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/** One connection. Returns 'ended' (server closed it cleanly), 'failed', or
 * 'gone' (404: the project is not ours / no longer exists; stop for good). */
async function readOnce(
  projectId: string,
  since: Versions | null,
  onInvalidates: (domains: string[]) => void,
  onVersions: (v: Versions) => void,
  signal?: AbortSignal,
): Promise<'ended' | 'failed' | 'gone'> {
  const qs = since ? `?since=${encodeURIComponent(JSON.stringify(since))}` : '';
  let res: Response;
  try {
    res = await apiFetch(
      `/consistency/projects/${projectId}/staleness/stream/${qs}`,
      { signal },
    );
  } catch {
    return 'failed';
  }
  if (res.status === 404) return 'gone';
  if (!res.ok || !res.body) return 'failed';

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return 'ended';
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue; // ': ' lines are keepalives
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev?.versions && typeof ev.versions === 'object') onVersions(ev.versions);
          if (ev?.type === 'invalidates' && Array.isArray(ev.data)) onInvalidates(ev.data);
        } catch { /* ignored */ }
      }
    }
  } catch {
    return 'failed'; // dropped mid-read (or aborted)
  }
}

/**
 * Subscribe to the project's live-update stream until `signal` aborts.
 * Pipe `onInvalidates` into `handleDispatchInvalidates` so TanStack pages
 * refetch. (The acting tab still gets its own fast-path invalidation from the
 * dispatch response; this is the cross-tab channel.)
 */
export async function subscribeStaleness(
  projectId: string,
  onInvalidates: (domains: string[]) => void,
  signal?: AbortSignal,
): Promise<void> {
  let last: Versions | null = null;
  let backoff = MIN_BACKOFF_MS;
  while (!signal?.aborted) {
    let gotData = false;
    const outcome = await readOnce(
      projectId, last, onInvalidates,
      (v) => { last = v; gotData = true; },
      signal,
    );
    if (signal?.aborted || outcome === 'gone') return;
    if (outcome === 'ended' || gotData) {
      backoff = MIN_BACKOFF_MS;
      await wait(outcome === 'ended' ? RECONNECT_MS : backoff, signal);
    } else {
      await wait(backoff, signal);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}
