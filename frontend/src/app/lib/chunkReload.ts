/**
 * Recover from "stale page pieces" after a deploy.
 *
 * Pages are lazy-loaded: each one is a separate build file (a "chunk") with a
 * hashed name, fetched the first time the page opens. A deploy replaces those
 * files. A tab opened BEFORE the deploy still asks for the old names, the
 * server has no such file, and the import fails.
 *
 * The fix: when a page import fails with a chunk-load error, reload the whole
 * page once, which picks up the new build. A sessionStorage flag makes sure we
 * reload at most once, so a real outage shows the error screen instead of
 * looping. The flag is cleared after any page loads fine.
 */

export const CHUNK_RELOAD_KEY = 'wv:chunk-reload';

// What each browser (and Vite's CSS preloader) says when a lazy file is missing.
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite's preload helper
  /Loading (CSS )?chunk .* failed/i,
];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

function readFlag(): boolean {
  try {
    return window.sessionStorage.getItem(CHUNK_RELOAD_KEY) !== null;
  } catch {
    return false;
  }
}

function writeFlag(on: boolean): boolean {
  try {
    if (on) window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    else window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wrap a dynamic import so a chunk-load failure reloads the page once.
 *
 *   lazy(withChunkReload(() => import('./pages/Library')))
 */
export function withChunkReload<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().then(
      (mod) => {
        writeFlag(false);
        return mod;
      },
      (error: unknown) => {
        // Already reloaded once (or storage is blocked, so we can't guard
        // against a loop): let the error boundary show the problem.
        if (!isChunkLoadError(error) || readFlag() || !writeFlag(true)) throw error;
        window.location.reload();
        // Never settle: the page is going away, so don't flash the error screen.
        return new Promise<T>(() => {});
      },
    );
}
