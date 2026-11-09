// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_RELOAD_KEY, isChunkLoadError, withChunkReload } from './chunkReload';

const staleChunk = () => new TypeError('Failed to fetch dynamically imported module: /assets/WorldPage-abc123.js');

describe('isChunkLoadError', () => {
  it('knows the chunk-load messages of each browser', () => {
    expect(isChunkLoadError(staleChunk())).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
  });

  it('ignores ordinary errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('withChunkReload', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    vi.stubGlobal('location', { ...window.location, reload });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reloads the page once when a chunk is missing, and never settles', async () => {
    const load = withChunkReload(() => Promise.reject(staleChunk()));
    let settled = false;
    load().then(
      () => (settled = true),
      () => (settled = true),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).not.toBeNull();
    expect(settled).toBe(false);
  });

  it('does not reload a second time: the error reaches the error boundary', async () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    const load = withChunkReload(() => Promise.reject(staleChunk()));
    await expect(load()).rejects.toThrow(/dynamically imported module/);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload for errors that are not chunk-load errors', async () => {
    const load = withChunkReload(() => Promise.reject(new Error('boom')));
    await expect(load()).rejects.toThrow('boom');
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears the guard after a successful load', async () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    const mod = { default: 'page' };
    await expect(withChunkReload(() => Promise.resolve(mod))()).resolves.toBe(mod);
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
  });
});
