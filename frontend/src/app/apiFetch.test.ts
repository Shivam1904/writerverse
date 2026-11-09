import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl } from '../config/api';
import { useAuthStore } from '../stores/authStore';
import { apiFetch } from './apiFetch';

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ tokens: null });
});

describe('apiFetch', () => {
  it('calls the API base URL with the login token', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ tokens: { access: 'tok', refresh: 'r' } });

    await apiFetch('/consistency/projects/7/threads/', { headers: { 'Content-Type': 'application/json' } });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(apiUrl('/consistency/projects/7/threads/'));
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('sends no Authorization header when logged out', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/projects/');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });
});
