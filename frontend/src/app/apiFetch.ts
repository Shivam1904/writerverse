/**
 * `fetch()` for backend calls that axios can't do: streams (chat, live
 * updates) that read the response body as it arrives.
 *
 * axios gets the API base URL and the login token for free (see
 * stores/authStore.ts). A bare `fetch()` gets neither, so this adds both:
 * the URL comes from `apiUrl()` and the token from the auth store.
 *
 * `path` is relative to the API root, like axios: `/consistency/projects/7/chat/`.
 */
import { apiUrl } from '../config/api';
import { useAuthStore } from '../stores/authStore';

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const access = useAuthStore.getState().tokens?.access;
  if (access && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${access}`);
  }
  return fetch(apiUrl(path), { ...init, headers });
}
