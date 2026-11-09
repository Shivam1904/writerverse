/**
 * D31 — Frontend half of the unified staleness system.
 *
 * The backend (actions/awareness/staleness.yml + dispatch.py) tags every
 * successful write with `invalidates: [domain, ...]` listing the staleness
 * domains the write mutated. This module is the app side of that loop:
 *
 *   1. App boot calls `bindQueryClient(qc)` once with the singleton
 *      QueryClient (see `ProjectShell`).
 *   2. The gateway calls `handleDispatchInvalidates(projectId, ['characters'])`
 *      after every dispatch response. The chat's accept/reject SSE path does
 *      the same when the resumed turn finishes.
 *   3. We map each backend domain → the app queryKey *prefix* (scoped
 *      to the project) and call `queryClient.invalidateQueries`. TanStack
 *      auto-refetches every mounted `useQuery` that matches.
 *
 * Adding a new page to TanStack? Add its queryKey under the domain it reads
 * in `DOMAIN_QUERY_KEYS` below — that's the whole wire-up. A backend domain
 * with no row refetches nothing; the ones left out on purpose are listed, with
 * the reason, under the table.
 */
import axios from 'axios';
import type { QueryClient } from '@tanstack/react-query';

/** Backend domain (matches `backend/config/staleness.yml`) → app queryKey
 * prefixes (project id is appended at call time). Add entries here as more
 * pages adopt useQuery — leaving a domain as `[]` is fine; it just means
 * nothing is currently subscribed to that domain. */
// Invariant we're converging on: queryKey name === backend staleness domain
// name, so this table collapses toward the identity function. The only entries
// that should carry MORE than their own key are genuine cross-domain fan-outs
// (a query that reads a second domain's data). See COUNTS_STALENESS_REFACTOR.md.
//
// The live query keys today are ['characters'], ['plot_threads'], and
// ['gauges']. Dead/phantom rows (worldbuilding, grand_outline, synopsis, the
// duplicate braindumps, ['threads'], items, lens_templates, suggestions) were
// removed 2026-05-31 — they had no subscriber, and `synopsis` was a silent miss
// (the real domain is `project_meta`, which now maps correctly).
const DOMAIN_QUERY_KEYS: Record<string, string[][]> = {
  characters:   [['characters']],
  // ThreadsPage's threadMap is built from the grand outline (threads/data.ts
  // reads get_grand_outline), so an outline mutation must also refetch the
  // plot_threads query. NOT reciprocal: the outline page shows no thread data
  // today (OutlineThreadPanel is commented out), so plot_threads → outline is
  // intentionally absent. Add it in the same commit that un-comments that panel.
  // ['chapter_docs', pid, chapterId] is the Write page's one-chapter prose read
  // (get_chapter_docs); prose saves and AI prose edits invalidate `outline`.
  outline:      [['outline'], ['plot_threads'], ['chapter_docs']],
  braindumps:   [['braindumps']],
  // ['ai_usage', pid, …] holds extension reads about AI usage (e.g. a usage
  // meter; see app/extensions.ts). The acting tab's dispatch response adds
  // project_meta after a metered AI call, so those refetch here too.
  project_meta: [['project_meta'], ['ai_usage']],
  // An AI call was recorded (this tab, another tab, or the chat). Not a story
  // domain, so the chat never warns about it.
  ai_usage:     [['project_meta'], ['ai_usage']],
  plot_threads: [['plot_threads']],
  // Domain name (`worldbuilding`) ≠ queryKey (`world`) — a name mismatch, so this
  // is NOT an identity row. The TanStack `['world', pid]` query backs WorldPage,
  // WorldRail, useCounts, and the braindumps entity-tag picker (SA-82: WorldPage
  // no longer keeps its own copy). (Re-added 2026-06-08: there IS a subscriber now; it was the silent-miss the
  // header comment warns about — chat world writes never refetched any surface.)
  worldbuilding: [['world']],
  // Story items (accepted from the AI's first read of the ideas). loadWorld reads
  // get_items into the same `['world', pid]` entry, so the World rail + counts refetch.
  items:        [['world']],
  // The new Gauges route's store. Every gauge_* write tags `invalidates: gauges`.
  // ['gauges', pid, …] holds the board (ONE entry, raw; pages that want the
  // normalized view `select` it — see queries.gaugesBoard), the presets, and the
  // section lenses. The shared lens catalogue is NOT under it (['gauge_catalogue']):
  // it is static config, so a gauges restale never refetches it.
  gauges:       [['gauges']],
};
// Backend domains deliberately NOT in the table (nothing to refetch):
//   • scene_pipelines — the on/off switches. No useQuery reads them; the only
//     writer is the author's own switch (chat can't call set_scene_pipeline),
//     and it updates its local state optimistically (useScenePipelines).
//     Add `scene_pipelines: [['scene_pipelines']]` if they move to TanStack.
//   • lenses — nothing writes this domain any more (gauges replaced it).

let _queryClient: QueryClient | null = null;

/** Called once at app boot (ProjectShell) with the singleton QueryClient. */
export function bindQueryClient(qc: QueryClient) {
  _queryClient = qc;
}

/**
 * Non-TanStack invalidation channel. Some hooks keep their data in local state
 * with an optimistic-edit layer on top (e.g. `useOutlineModel`) rather than a
 * `useQuery`, so the TanStack refetch above can't reach them. Those hooks
 * subscribe here and refetch themselves when their domain is invalidated — which
 * is how, e.g., the chapter rail picks up a `dive-in` that seeded the outline
 * from a sibling component. The callback receives the (string) project id.
 */
type DomainListener = (projectId: string) => void;
const _domainListeners: Record<string, Set<DomainListener>> = {};

export function subscribeInvalidation(domain: string, cb: DomainListener): () => void {
  (_domainListeners[domain] ??= new Set()).add(cb);
  return () => { _domainListeners[domain]?.delete(cb); };
}

/** Fire-and-forget: every dispatch / chat-accept response funnels through
 * here. `invalidates` is the backend's list of mutated domains. */
export function handleDispatchInvalidates(
  projectId: any,
  invalidates: string[] | undefined | null,
) {
  if (!invalidates || !invalidates.length) return;
  const pid = String(projectId ?? '');
  for (const domain of invalidates) {
    if (_queryClient) {
      const prefixes = DOMAIN_QUERY_KEYS[domain] || [];
      for (const prefix of prefixes) {
        // Project-scoped invalidation. TanStack matches on prefix, so any
        // useQuery whose key starts with [...prefix, pid] gets refetched.
        _queryClient.invalidateQueries({ queryKey: [...prefix, pid] });
      }
    }
    // Local-state consumers (non-useQuery) refetch themselves.
    const listeners = _domainListeners[domain];
    if (listeners) for (const cb of listeners) { try { cb(pid); } catch { /* never let one listener break the rest */ } }
  }
}

/** Test/dev helper — peek at the binding without exporting the module-level
 * variable. */
export function isQueryClientBound() {
  return _queryClient !== null;
}

let _interceptorInstalled = false;

/**
 * Tier 2 — install a global axios response interceptor that reads the
 * `X-Invalidates` header (set by the semantic-resource facade) and feeds its
 * domains to `handleDispatchInvalidates`. Lets `data.ts` seams call plain
 * resource URLs and stay blind to invalidation. Idempotent.
 *
 * This is the only request-driven invalidation path now that the legacy
 * `/dispatch/` endpoint (body `invalidates`) is decommissioned; the chat
 * accept SSE and the Tier-1 staleness push also feed `handleDispatchInvalidates`.
 */
export function installInvalidatesInterceptor() {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;
  axios.interceptors.response.use((response) => {
    try {
      const header =
        response.headers?.['x-invalidates'] ?? response.headers?.['X-Invalidates'];
      if (header && _queryClient) {
        const url = String(response.config?.url || '');
        const m = url.match(/projects\/(\d+)\//);
        if (m) {
          const domains = String(header)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          handleDispatchInvalidates(m[1], domains);
        }
      }
    } catch {
      // never let invalidation bookkeeping break a response
    }
    return response;
  });
}
