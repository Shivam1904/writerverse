// SA-303: deleting a world entry (the trash icon on a card, list row or rule)
// shows "Deleted — Undo"; Undo brings the entry back.
// SA-82: a write refetches only the cache it changed, once — never the whole
// world (entries + items + rules + headings + story details) two or three times.
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorldPage } from './useWorldPage';
import { useReceiptStore } from '../../modules/receipt/receiptStore';
import { bindQueryClient, handleDispatchInvalidates } from '../../queryInvalidator';

const callOp = vi.fn();
vi.mock('../../gateway', () => ({
  callOp: (...a: unknown[]) => callOp(...a),
  callResource: () => Promise.resolve({}),
}));

const WORLD_READS = ['get_worldbuildings', 'get_items', 'get_rules', 'get_world_blocks'];

/** The test's QueryClient, also bound to queryInvalidator — the way the app
 *  wires it, so a write's `invalidates` list refetches the matching caches. */
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  bindQueryClient(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useWorldPage('1'), { wrapper });
}

const readCount = (op: string) => callOp.mock.calls.filter((c) => c[1] === op).length;
const readCounts = () => Object.fromEntries(
  [...WORLD_READS, 'get_project_meta'].map((op) => [op, readCount(op)]),
);

/** What the gateway does after a write: the response's `X-Invalidates`
 *  domains go to queryInvalidator (the axios interceptor isn't installed here). */
function serverSays(...domains: string[]) {
  act(() => handleDispatchInvalidates('1', domains));
}

beforeEach(() => {
  callOp.mockReset().mockImplementation((_pid: string, op: string) => {
    if (op === 'get_worldbuildings') {
      return Promise.resolve({ worldbuildings: [{ id: 42, title: 'Harbour', content: 'Fog.', tags: ['place'] }] });
    }
    if (op === 'get_project_meta') return Promise.resolve({ title: 'Book', synopsis: 'Old.' });
    if (op === 'update_worldbuilding') return Promise.resolve({ worldbuilding: { id: 42 } });
    return Promise.resolve({});
  });
});
afterEach(() => useReceiptStore.setState({ receipts: [] }));

describe('deleting a world entry shows an Undo toast', () => {
  it('deletes, then Undo restores the entry', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(() => result.current.onDelete('42'));
    expect(callOp).toHaveBeenCalledWith('1', 'delete_worldbuilding', { id: 42 });
    // Gone from the page without waiting for a refetch.
    await waitFor(() => expect(result.current.world.sections.flatMap((s) => s.items)).toEqual([]));

    const [toast] = useReceiptStore.getState().receipts;
    expect(toast.what).toBe('Deleted');
    await act(async () => { toast.undo!(); });
    expect(callOp).toHaveBeenCalledWith('1', 'undelete_worldbuilding', { id: 42 });
  });
});

describe('World reads only what a write changed (SA-82)', () => {
  it('loads entries and story details once each', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(readCounts()).toEqual({
      get_worldbuildings: 1, get_items: 1, get_rules: 1, get_world_blocks: 1, get_project_meta: 1,
    });
    expect(result.current.world.storyTitle).toBe('Book');
    expect(result.current.world.sections[0].items[0].name).toBe('Harbour');
  });

  it('a colour click shows at once and re-reads the world entries once, not the story details', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // Hold the write open: the new colour must show before the server answers.
    let finishWrite!: () => void;
    const read = callOp.getMockImplementation()!;
    callOp.mockClear().mockImplementation((pid: string, op: string, ...rest: unknown[]) =>
      (op === 'update_worldbuilding'
        ? new Promise((ok) => { finishWrite = () => ok({ worldbuilding: { id: 42 } }); })
        : read(pid, op, ...rest)));

    let saved!: Promise<void>;
    act(() => { saved = result.current.onUpdate('42', { color: 'var(--rose)' }); });
    await waitFor(() => expect(result.current.world.sections[0].items[0].color).toBe('var(--rose)'));
    expect(callOp).toHaveBeenCalledWith('1', 'update_worldbuilding', { id: 42, color: 'var(--rose)' });
    await act(async () => { finishWrite(); await saved; });

    serverSays('worldbuilding', 'gauges');
    await waitFor(() => expect(readCount('get_worldbuildings')).toBe(1));
    expect(readCounts()).toEqual({
      get_worldbuildings: 1, get_items: 1, get_rules: 1, get_world_blocks: 1, get_project_meta: 0,
    });
  });

  it('a story-detail edit shows at once and re-reads only the project meta', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    callOp.mockClear();

    await act(() => result.current.onSaveMeta({ synopsis: 'New.' }));
    await waitFor(() => expect(result.current.world.synopsis).toEqual(['New.']));

    serverSays('project_meta');
    await waitFor(() => expect(readCount('get_project_meta')).toBe(1));
    expect(readCounts()).toEqual({
      get_worldbuildings: 0, get_items: 0, get_rules: 0, get_world_blocks: 0, get_project_meta: 1,
    });
  });

  it('a failed edit puts the server truth back', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const read = callOp.getMockImplementation()!;
    callOp.mockImplementation((pid: string, op: string, ...rest: unknown[]) =>
      (op === 'update_worldbuilding' ? Promise.reject(new Error('down')) : read(pid, op, ...rest)));

    await act(async () => {
      await expect(result.current.onUpdate('42', { title: 'Port' })).rejects.toThrow('down');
    });
    await waitFor(() => expect(result.current.world.sections[0].items[0].name).toBe('Harbour'));
  });
});
