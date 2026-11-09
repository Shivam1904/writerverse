/**
 * loadStatus — what a page should show for its main query, before it may treat
 * "no data" as "empty project".
 *
 * Without data, a page can be in three different situations, and each needs its
 * own screen:
 *  - 'loading' — nothing has arrived yet. Show a spinner, never the first-run
 *                screen (or a returning author sees "start your book" on every visit).
 *  - 'error'   — the first load failed (backend down, network gone). Show
 *                "Couldn't load" + Retry, never the first-run screen (or an
 *                outage tells the author their work is gone).
 *  - 'ready'   — data arrived. Only now may an empty list mean "empty project".
 *
 * Once data is on screen it stays 'ready', even if a later background refetch
 * fails: a blip must not swap the author's work for an error page.
 *
 * Takes a TanStack `useQuery` result (or anything with the same two fields).
 * Render the not-ready cases with `<LoadState>` from components/LoadError.
 */
export type LoadStatus = 'loading' | 'error' | 'ready';

export function loadStatus(query: { data: unknown; isError: boolean }): LoadStatus {
  if (query.data !== undefined) return 'ready';
  return query.isError ? 'error' : 'loading';
}
