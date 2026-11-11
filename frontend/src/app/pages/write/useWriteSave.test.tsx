import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWriteStore } from './writeStore';
import { stashUnsavedProse, resetProseParkedForRedirect } from './unsavedStash';
import { useWriteSave, SAVE_RETRY_DELAYS_MS } from './useWriteSave';

const callOp = vi.fn();
vi.mock('../../gateway', () => ({ callOp: (...a: unknown[]) => callOp(...a) }));

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function fireBeforeUnload() {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e;
}

describe('useWriteSave leave guard', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProseParkedForRedirect();
    callOp.mockReset().mockResolvedValue({});
    useWriteStore.setState({
      data: { chapters: [{ id: 1, scenes: [{ id: 7 }] }], totalWords: 0 } as any,
      contentById: { 7: { type: 'doc', content: [] } },
      dirtySceneIds: new Set(),
      saveStatusById: {},
    });
  });

  it('asks the browser to confirm leaving only while a scene is dirty', () => {
    renderHook(() => useWriteSave('p1'));
    expect(fireBeforeUnload().defaultPrevented).toBe(false);

    act(() => useWriteStore.setState({ dirtySceneIds: new Set([7]) }));
    expect(fireBeforeUnload().defaultPrevented).toBe(true);
  });

  it('does not ask once dirty prose is stashed for the /login redirect', () => {
    renderHook(() => useWriteSave('p1'));
    act(() => useWriteStore.setState({ dirtySceneIds: new Set([7]) }));
    expect(fireBeforeUnload().defaultPrevented).toBe(true);

    stashUnsavedProse({ 7: { type: 'doc', content: [] } }, [7]);
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it('flushes dirty scenes when the page becomes hidden', async () => {
    renderHook(() => useWriteSave('p1'));
    act(() => useWriteStore.setState({ dirtySceneIds: new Set([7]) }));

    await act(async () => setVisibility('visible'));
    expect(callOp).not.toHaveBeenCalled();

    await act(async () => setVisibility('hidden'));
    expect(callOp).toHaveBeenCalledWith(
      'p1',
      'save_scene_content',
      expect.objectContaining({ scene_id: '7' }),
    );
    expect(useWriteStore.getState().dirtySceneIds.size).toBe(0);
  });

  it('saves text typed during an in-flight save and only then marks clean', async () => {
    const releases: Array<() => void> = [];
    callOp.mockReset().mockImplementation(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );
    const docA = { type: 'doc', content: [{ type: 'text', text: 'A' }] };
    const docB = { type: 'doc', content: [{ type: 'text', text: 'A B' }] };
    useWriteStore.setState({
      contentById: { 7: docA },
      dirtySceneIds: new Set([7]),
    });
    const { result } = renderHook(() => useWriteSave('p1'));

    let first!: Promise<void>;
    act(() => {
      first = result.current.saveScene(7);
    });
    expect(callOp).toHaveBeenCalledTimes(1);

    // Author keeps typing while save #1 is in flight, and autosave re-fires.
    act(() => {
      useWriteStore.setState({ contentById: { 7: docB } });
      void result.current.saveScene(7);
    });
    expect(callOp).toHaveBeenCalledTimes(1);

    await act(async () => {
      releases[0]();
      await Promise.resolve();
      await Promise.resolve();
    });
    // Not clean yet: the doc sent (A) is not the doc on screen (B).
    expect(callOp).toHaveBeenCalledTimes(2);
    expect(callOp.mock.calls[1][2].content).toBe(docB);
    expect(useWriteStore.getState().dirtySceneIds.has(7)).toBe(true);

    await act(async () => {
      releases[1]();
      await first;
    });
    expect(useWriteStore.getState().dirtySceneIds.has(7)).toBe(false);
  });

  it('retries a network failure with backoff and succeeds', async () => {
    vi.useFakeTimers();
    try {
      callOp.mockReset()
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValue({});
      useWriteStore.setState({ dirtySceneIds: new Set([7]) });
      const { result } = renderHook(() => useWriteSave('p1'));
      let p!: Promise<void>;
      act(() => {
        p = result.current.saveScene(7);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0] + SAVE_RETRY_DELAYS_MS[1]);
        await p;
      });
      expect(callOp).toHaveBeenCalledTimes(3);
      expect(useWriteStore.getState().saveStatusById[7]).not.toBe('error');
      expect(useWriteStore.getState().dirtySceneIds.has(7)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after bounded retries: status error, still dirty, then recovers', async () => {
    vi.useFakeTimers();
    try {
      callOp.mockReset().mockRejectedValue(new Error('Network Error'));
      useWriteStore.setState({ dirtySceneIds: new Set([7]) });
      const { result } = renderHook(() => useWriteSave('p1'));
      let p!: Promise<void>;
      act(() => {
        p = result.current.saveScene(7);
      });
      await act(async () => {
        await vi.runAllTimersAsync();
        await p;
      });
      expect(callOp).toHaveBeenCalledTimes(SAVE_RETRY_DELAYS_MS.length + 1);
      expect(useWriteStore.getState().saveStatusById[7]).toBe('error');
      expect(useWriteStore.getState().dirtySceneIds.has(7)).toBe(true);

      // A manual retry keeps the error (banner) up until a save lands.
      callOp.mockReset().mockResolvedValue({});
      await act(async () => {
        await result.current.saveScene(7);
      });
      expect(useWriteStore.getState().saveStatusById[7]).toBe('saved');
      expect(useWriteStore.getState().dirtySceneIds.has(7)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry a 4xx answer', async () => {
    callOp.mockReset().mockRejectedValue({ response: { status: 400 } });
    useWriteStore.setState({ dirtySceneIds: new Set([7]) });
    const { result } = renderHook(() => useWriteSave('p1'));
    await act(async () => {
      await result.current.saveScene(7);
    });
    expect(callOp).toHaveBeenCalledTimes(1);
    expect(useWriteStore.getState().saveStatusById[7]).toBe('error');
  });

  it('removes its listeners on unmount', () => {
    const { unmount } = renderHook(() => useWriteSave('p1'));
    unmount();
    act(() => useWriteStore.setState({ dirtySceneIds: new Set([7]) }));
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});
