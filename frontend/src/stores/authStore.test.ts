import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from './authStore';
import { isProseParkedForRedirect } from '../app/pages/write/unsavedStash';
import { useWriteStore } from '../app/pages/write/writeStore';

const doc = (t: string) =>
  ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] }) as any;

// Every request (including /auth/refresh/) answers 401: the refresh token is dead.
const always401 = async (config: InternalAxiosRequestConfig) => {
  throw new AxiosError('401', 'ERR_BAD_REQUEST', config, null, {
    status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config,
  });
};

describe('dead refresh token', () => {
  const realAdapter = axios.defaults.adapter;
  const realLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    axios.defaults.adapter = always401;
    Object.defineProperty(window, 'location', { value: { href: '/project/1/chapters' }, writable: true });
  });
  afterEach(() => {
    axios.defaults.adapter = realAdapter;
    Object.defineProperty(window, 'location', { value: realLocation, writable: true });
  });

  it('stashes unsaved prose before redirecting to /login', async () => {
    useAuthStore.setState({ tokens: { access: 'a', refresh: 'r' }, isAuthenticated: true });
    useWriteStore.setState({ contentById: { ['sc_7a7a7a7a' as any]: doc('unsaved words') }, dirtySceneIds: new Set(['sc_7a7a7a7a' as any]) });

    await expect(axios.get('/anything/')).rejects.toBeTruthy();

    expect(window.location.href).toBe('/login');
    expect(JSON.parse(localStorage.getItem('wv:unsaved-prose')!)).toEqual({ sc_7a7a7a7a: doc('unsaved words') });
    expect(isProseParkedForRedirect()).toBe(true);
  });
});

describe('logout with a token the server already ended', () => {
  const realAdapter = axios.defaults.adapter;
  const realLocation = window.location;
  let seenAuth: Record<string, unknown> = {};

  beforeEach(() => {
    localStorage.clear();
    seenAuth = {};
    // Like the real server after a password reset: JWTAuthentication refuses a
    // request carrying the dead access token (401) before any view runs — even
    // AllowAny logout. Without the token, logout answers 205.
    axios.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const auth = config.headers?.get?.('Authorization') ?? config.headers?.Authorization;
      seenAuth[String(config.url)] = auth;
      if (auth) return always401(config);
      return { status: 205, statusText: 'Reset Content', data: {}, headers: {}, config };
    };
    axios.defaults.headers.common['Authorization'] = 'Bearer dead-access';
    Object.defineProperty(window, 'location', { value: { href: '/reset-password' }, writable: true });
  });
  afterEach(() => {
    axios.defaults.adapter = realAdapter;
    delete axios.defaults.headers.common['Authorization'];
    Object.defineProperty(window, 'location', { value: realLocation, writable: true });
  });

  it('sends logout without the access token, so it succeeds and does not bounce to /login (SA-39)', async () => {
    useAuthStore.setState({ tokens: { access: 'dead-access', refresh: 'dead-refresh' }, isAuthenticated: true });

    await useAuthStore.getState().logout();

    expect(seenAuth['/auth/logout/']).toBeFalsy();
    expect(seenAuth['/auth/refresh/']).toBeUndefined(); // no refresh attempt at all
    expect(window.location.href).toBe('/reset-password');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('register and the terms checkbox (SA-50)', () => {
  const realAdapter = axios.defaults.adapter;
  const input = {
    email: 'new@example.com', password: 'pw', passwordConfirm: 'pw',
    firstName: 'N', lastName: 'W', acceptedTerms: true,
  };

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, tokens: null, isAuthenticated: false, error: null });
  });
  afterEach(() => {
    axios.defaults.adapter = realAdapter;
  });

  it('sends accepted_terms with the sign-up', async () => {
    let sent: Record<string, unknown> = {};
    axios.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      sent = JSON.parse(String(config.data));
      return {
        status: 201, statusText: 'Created', headers: {}, config,
        data: { access: 'a', refresh: 'r', user: { id: 1, email: input.email } },
      };
    };

    await useAuthStore.getState().register(input);

    expect(sent.accepted_terms).toBe(true);
    expect(sent.password_confirm).toBe('pw');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("shows the server's message when it rejects the sign-up for missing terms", async () => {
    const message = 'You must accept the Terms and Conditions to create an account.';
    axios.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('400', 'ERR_BAD_REQUEST', config, null, {
        status: 400, statusText: 'Bad Request', data: { accepted_terms: [message] }, headers: {}, config,
      });
    };

    await expect(useAuthStore.getState().register({ ...input, acceptedTerms: false })).rejects.toBeTruthy();

    expect(useAuthStore.getState().error).toBe(message);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

// wrt-112: a brand-new account is flagged for a one-time welcome;
// a normal login is not.
describe('justSignedUp', () => {
  const realAdapter = axios.defaults.adapter;
  const ok = (data: unknown) => async (config: InternalAxiosRequestConfig) =>
    ({ status: 200, statusText: 'OK', data, headers: {}, config });
  const signedIn = { access: 'a', refresh: 'r', user: { id: 1, email: 'new@x.io' } };

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ justSignedUp: false, isAuthenticated: false, tokens: null, user: null });
  });
  afterEach(() => { axios.defaults.adapter = realAdapter; });

  it('is set by sign-up and cleared on demand', async () => {
    axios.defaults.adapter = ok(signedIn);
    await useAuthStore.getState().register({
      email: 'new@x.io', password: 'pw', passwordConfirm: 'pw', firstName: 'N', lastName: '', acceptedTerms: true,
    } as any);
    expect(useAuthStore.getState().justSignedUp).toBe(true);
    useAuthStore.getState().clearJustSignedUp();
    expect(useAuthStore.getState().justSignedUp).toBe(false);
  });

  it('is set by email verification', async () => {
    axios.defaults.adapter = ok(signedIn);
    await useAuthStore.getState().verifyEmail('tok');
    expect(useAuthStore.getState().justSignedUp).toBe(true);
  });

  it('is not set by a normal login', async () => {
    axios.defaults.adapter = ok(signedIn);
    await useAuthStore.getState().login('old@x.io', 'pw');
    expect(useAuthStore.getState().justSignedUp).toBe(false);
  });
});
