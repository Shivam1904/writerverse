// Where the backend API lives. The one place that reads VITE_API_URL.
//
// - Local dev: `/api` (Vite proxies it to Django) or the default below.
// - Production: the full address, e.g. `https://api.studio.writerverse.info/api`.
//
// axios uses it as `baseURL` (see stores/authStore.ts). Bare `fetch()` calls
// (streams, which axios can't read) must build their URL with `apiUrl()`.
// A hard-coded `/api/...` only works locally: in production it hits the
// frontend host and gets index.html back. ESLint blocks `/api/` literals.

export const API_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_API_URL || 'http://localhost:8555/api',
)

/**
 * Join an API base and an API path into one URL.
 *
 * The path is relative to the API root and starts with `/`, the same string
 * you would pass to axios: `/consistency/projects/7/chat/` (no `/api` prefix).
 */
export function joinApiUrl(base: string, path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": ${path}`)
  }
  if (path === '/api' || path.startsWith('/api/')) {
    throw new Error(`API path must not include the /api prefix (the base has it): ${path}`)
  }
  return trimTrailingSlash(base) + path
}

/** Full URL for an API path, e.g. `apiUrl('/consistency/projects/7/chat/')`. */
export function apiUrl(path: string): string {
  return joinApiUrl(API_BASE_URL, path)
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}
