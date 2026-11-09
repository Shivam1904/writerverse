// SA-263 / SA-253: the gauge board and the outline are each fetched ONCE per
// page, however many parts of the page read them.
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callOp } = vi.hoisted(() => ({ callOp: vi.fn() }));
vi.mock('./gateway', () => ({ callOp }));

import { queries } from './queries';
import { useWelcomeBack } from './pages/gauges/outlineSnapshot';

const RAW_BOARD = {
  charts: [{ id: 'c1', binding_id: 'b1', type: 'arc', scope: { type: 'story' } }],
  scenes: [{ id: 's1', label: 'Opening', extra: 'only in the raw shape' }],
};
const OUTLINE = { acts: [{ id: 'ac1', chapters: [{ id: 'ch1', scenes: [{ id: 'sc1', text: 'Opening', words: 3, beats: [] }] }] }] };

const calls = (op: string) => callOp.mock.calls.filter((c) => c[1] === op).length;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  callOp.mockReset();
  callOp.mockImplementation(async (_pid: unknown, op: string) => {
    if (op === 'get_gauge_board') return RAW_BOARD;
    if (op === 'get_grand_outline') return { grand_outline: OUTLINE };
    return {};
  });
  localStorage.clear();
});

describe('one fetch per shared read', () => {
  it('raw and normalized board readers share one get_gauge_board call', async () => {
    const { result } = renderHook(() => ({
      raw: useQuery({ ...queries.gaugesBoard('p1'), enabled: true }),
      view: useQuery({ ...queries.gaugesBoardView('p1'), enabled: true }),
      rawAgain: useQuery({ ...queries.gaugesBoard('p1'), enabled: true }),
    }), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.view.data).toBeTruthy());
    expect(calls('get_gauge_board')).toBe(1);
    expect(result.current.raw.data?.scenes[0]).toHaveProperty('extra');
    // the view is normalized: scenes slimmed to { id, label }
    expect(result.current.view.data?.scenes[0]).toEqual({ id: 's1', label: 'Opening' });
  });

  it('the welcome-back banner reuses the shared outline instead of fetching its own', async () => {
    const { result } = renderHook(() => ({
      outline: useQuery({ ...queries.outline('p1'), enabled: true }),
      welcome: useWelcomeBack('p1'),
    }), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.outline.data).toBeTruthy());
    expect(calls('get_grand_outline')).toBe(1);
    // first visit: nothing to compare yet, and the snapshot is saved for next time
    expect(result.current.welcome).toEqual({ welcomeCopy: null, isFirstVisit: true });
    expect(localStorage.length).toBe(1);
  });
});

describe('welcome-back banner', () => {
  // One visit = a page reload (the snapshot module keeps the previous snapshot
  // in memory for the session, so reload it) reading the server's outline now.
  async function visit(outline: unknown) {
    callOp.mockImplementation(async (_pid: unknown, op: string) =>
      op === 'get_grand_outline' ? { grand_outline: structuredClone(outline) } : {});
    vi.resetModules();
    const { useWelcomeBack: freshHook } = await import('./pages/gauges/outlineSnapshot');
    const { result } = renderHook(() => freshHook('p1'), { wrapper: wrapper() });
    await waitFor(() => expect(callOp).toHaveBeenCalled());
    await waitFor(() => expect(localStorage.length).toBe(1));
    return result;
  }
  const withScene = (scene: object) => ({ acts: [{ id: 'ac1', chapters: [{ id: 'ch1', scenes: [scene] }] }] });
  const BEAT = { id: 'bt1', kind: 'text', text: 'She runs.' };

  it('reports an edit made since the last visit', async () => {
    await visit(withScene({ id: 'sc1', text: 'Opening', words: 3, beats: [BEAT] }));
    const back = await visit(withScene({ id: 'sc1', text: 'Opening', words: 3, beats: [{ ...BEAT, text: 'She hides.' }] }));
    await waitFor(() => expect(back.current.isFirstVisit).toBe(false));
    expect(back.current.welcomeCopy?.editedCount).toBe(1);
  });

  it('does not count a pending AI proposal as an edit', async () => {
    await visit(withScene({ id: 'sc1', text: 'Opening', words: 3, beats: [BEAT] }));
    const ghost = { id: null, insert: true, kind: 'text', actual_value: '', proposal: 7, proposed_value: 'AI idea' };
    const back = await visit(withScene({ id: 'sc1', text: 'Opening', words: 3, beats: [BEAT, ghost] }));
    await waitFor(() => expect(back.current.isFirstVisit).toBe(false));
    expect(back.current.welcomeCopy?.editedCount).toBe(0);
  });
});
