import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { qk } from '../../queries';
import { useThreadBeats } from './useThreadBeats';
import { useReceiptStore } from '../receipt/receiptStore';

const shown = () => useReceiptStore.getState().receipts.map((r) => r.what);
const UNDONE = "Couldn't save that change — undone";
const TEXT_KEPT = "Couldn't save your beat text — it's kept here and will retry";

// Writes named in `failing` reject (like a 500); everything else succeeds.
let failing = new Set<string>();
// Writes named in `held` wait until the test settles them by hand.
let held = new Set<string>();
const waiting: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
const callOp = vi.fn(async (_pid: unknown, op: string, args?: any) => {
  if (held.has(op)) return new Promise((resolve, reject) => { waiting.push({ resolve, reject }); });
  if (failing.has(op)) throw new Error(`${op} failed`);
  if (op === 'reorder_thread_beats') return { beat_ids: args.beat_ids };
  if (op === 'add_thread_beat') return { beat: { id: 'b-new' } };
  if (op === 'delete_thread_beat') return { deleted: 'x', undo_token: 'tok-t' };
  if (op === 'restore_deleted_beat') {
    return { item_type: 'thread_beat', thread_id: 't1', index: 1,
      beat: { id: 'b2', text: 'Saved two', kind: 'text' } };
  }
  return {};
});
vi.mock('../../gateway', () => ({ callOp: (...a: [unknown, string, any?]) => callOp(...a) }));

const thread = {
  id: 't1',
  beats: [
    { id: 'b1', text: 'Saved one', kind: 'text' },
    { id: 'b2', text: 'Saved two', kind: 'text' },
  ],
};

function setup(t: any = thread) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(qk.plotThreads('p1'), { threads: [t] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useThreadBeats('p1', t), { wrapper });
  const cachedBeats = () => (client.getQueryData(qk.plotThreads('p1')) as any).threads[0].beats;
  return { hook, cachedBeats, client };
}

// let the debounce fire, then let the rejected write settle
async function settle() {
  await act(async () => { vi.advanceTimersByTime(600); });
  await act(async () => { await Promise.resolve(); });
}

describe('useThreadBeats: a failed write is rolled back', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    failing = new Set();
    callOp.mockClear();
    useReceiptStore.setState({ receipts: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('keeps a saved text edit', async () => {
    const { hook, cachedBeats } = setup();
    act(() => hook.result.current.changeText('b1', 'New text'));
    await settle();
    expect(hook.result.current.beats[0].text).toBe('New text');
    expect(cachedBeats()[0].text).toBe('New text');
    expect(shown()).toEqual([]);
  });

  it('keeps typed text on screen but not in the cache when the text write fails, then retries on blur', async () => {
    failing.add('update_thread_beat');
    const { hook, cachedBeats } = setup();
    act(() => hook.result.current.changeText('b1', 'Typed text'));
    await settle();
    expect(hook.result.current.beats[0].text).toBe('Typed text');
    expect(cachedBeats()[0].text).toBe('Saved one');
    expect(shown()).toEqual([TEXT_KEPT]);

    failing.delete('update_thread_beat');
    callOp.mockClear();
    act(() => hook.result.current.flush('b1'));
    await settle();
    expect(callOp).toHaveBeenCalledWith('p1', 'update_thread_beat', expect.objectContaining({ text: 'Typed text' }));
    expect(cachedBeats()[0].text).toBe('Typed text');
  });

  it('retries a failed text write on the next edit', async () => {
    failing.add('update_thread_beat');
    const { hook, cachedBeats } = setup();
    act(() => hook.result.current.changeText('b1', 'Typed'));
    await settle();
    failing.delete('update_thread_beat');
    act(() => hook.result.current.changeText('b1', 'Typed more'));
    await settle();
    expect(hook.result.current.beats[0].text).toBe('Typed more');
    expect(cachedBeats()[0].text).toBe('Typed more');
  });

  it('drops a new beat whose create failed', async () => {
    failing.add('add_thread_beat');
    const { hook, cachedBeats } = setup();
    act(() => hook.result.current.addAfter('b2', 'text'));
    const tmpId = hook.result.current.beats[2].id;
    act(() => hook.result.current.changeText(tmpId, 'Never saved'));
    await settle();
    expect(hook.result.current.beats.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(cachedBeats().map((b: any) => b.id)).toEqual(['b1', 'b2']);
    expect(shown()).toEqual([UNDONE]);
  });

  it('puts a beat back where it was when the delete fails', async () => {
    failing.add('delete_thread_beat');
    const { hook, cachedBeats } = setup();
    act(() => hook.result.current.remove('b1'));
    await settle();
    expect(hook.result.current.beats.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(cachedBeats().map((b: any) => b.id)).toEqual(['b1', 'b2']);
    expect(shown()).toEqual([UNDONE]);
  });

  it('puts the old kind back when the kind change fails', async () => {
    failing.add('update_thread_beat');
    const { hook, cachedBeats } = setup();
    act(() => hook.result.current.cycleKind('b1'));
    await settle();
    expect(hook.result.current.beats[0].kind).toBe('text');
    expect(cachedBeats()[0].kind).toBe('text');
    expect(shown()).toEqual([UNDONE]);
  });

  it('refetches the server text when a proposal text edit fails', async () => {
    failing = new Set(['update_proposed_beat']);
    const { hook, client } = setup({
      id: 't1', beats: [{ id: 'b1', text: 'Saved one', kind: 'text', proposal: { id: 'pr1', text: 'AI text' } }],
    });
    const refetch = vi.spyOn(client, 'invalidateQueries');
    act(() => hook.result.current.changeProposedText(hook.result.current.beats[0], 'Typed'));
    await settle();
    expect(refetch).toHaveBeenCalledWith({ queryKey: qk.plotThreads('p1') });
    expect(shown()).toEqual([UNDONE]);
  });
});

describe('useThreadBeats: deleting a beat offers a 10-second Undo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    failing = new Set();
    callOp.mockClear();
    useReceiptStore.setState({ receipts: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('Undo puts the beat back in its old place', async () => {
    const { hook, cachedBeats } = setup();
    act(() => hook.result.current.remove('b2'));
    expect(hook.result.current.beats.map((b: any) => b.id)).toEqual(['b1']);
    await act(async () => { await Promise.resolve(); });
    expect(shown()).toEqual(['Beat deleted']);
    const toast = useReceiptStore.getState().receipts[0];
    await act(async () => { toast.undo!(); await Promise.resolve(); await Promise.resolve(); });
    expect(callOp).toHaveBeenCalledWith('p1', 'restore_deleted_beat', { token: 'tok-t' });
    expect(hook.result.current.beats.map((b: any) => [b.id, b.text])).toEqual(
      [['b1', 'Saved one'], ['b2', 'Saved two']]);
    expect(cachedBeats().map((b: any) => b.id)).toEqual(['b1', 'b2']);
  });

  it('the toast goes after 10 seconds', async () => {
    const { hook } = setup();
    act(() => hook.result.current.remove('b1'));
    await act(async () => { await Promise.resolve(); });
    expect(shown()).toEqual(['Beat deleted']);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(shown()).toEqual([]);
  });
});

describe('useThreadBeats: dragging a beat saves the new order', () => {
  const ids = (bs: any[]) => bs.map((b: any) => b.id);
  const three = {
    id: 't1',
    beats: [
      { id: 'h1', text: 'Act one', kind: 'heading' },
      { id: 'b1', text: 'Saved one', kind: 'text' },
      { id: 'b2', text: 'Saved two', kind: 'text' },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    failing = new Set();
    held = new Set();
    waiting.length = 0;
    callOp.mockClear();
    useReceiptStore.setState({ receipts: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('sends the whole new order to the server and keeps it', async () => {
    const { hook, cachedBeats } = setup(three);
    act(() => hook.result.current.reorder('b2', 'b1'));
    await settle();
    expect(callOp).toHaveBeenCalledWith('p1', 'reorder_thread_beats',
      { thread_id: 't1', beat_ids: ['h1', 'b2', 'b1'] });
    expect(ids(hook.result.current.beats)).toEqual(['h1', 'b2', 'b1']);
    expect(ids(cachedBeats())).toEqual(['h1', 'b2', 'b1']);
  });

  it('puts the old order back, in the cache too, when the save fails', async () => {
    failing.add('reorder_thread_beats');
    const { hook, cachedBeats } = setup(three);
    act(() => hook.result.current.reorder('b2', 'b1'));
    await settle();
    expect(ids(hook.result.current.beats)).toEqual(['h1', 'b1', 'b2']);
    expect(ids(cachedBeats())).toEqual(['h1', 'b1', 'b2']);
  });

  it('leaves out a beat that is not saved yet, and keeps it where it is', async () => {
    const { hook } = setup(three);
    act(() => hook.result.current.addAfter('b1', 'text'));
    const tmpId = hook.result.current.beats[2].id;
    act(() => hook.result.current.reorder('b2', 'h1'));
    await settle();
    expect(callOp).toHaveBeenCalledWith('p1', 'reorder_thread_beats',
      { thread_id: 't1', beat_ids: ['b2', 'h1', 'b1'] });
    expect(ids(hook.result.current.beats)).toEqual(['b2', 'h1', 'b1', tmpId]);
  });

  it('only the latest drag decides: an older failed save changes nothing', async () => {
    held.add('reorder_thread_beats');
    const { hook } = setup(three);
    act(() => hook.result.current.reorder('b2', 'b1')); // h1 b2 b1
    act(() => hook.result.current.reorder('b2', 'h1')); // b2 h1 b1
    expect(waiting).toHaveLength(2);
    await act(async () => { waiting[0].reject(new Error('500')); await Promise.resolve(); });
    expect(ids(hook.result.current.beats)).toEqual(['b2', 'h1', 'b1']);
    await act(async () => { waiting[1].resolve({ beat_ids: ['b2', 'h1', 'b1'] }); await Promise.resolve(); });
    expect(ids(hook.result.current.beats)).toEqual(['b2', 'h1', 'b1']);
  });
});
