import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { qk } from '../../queries';
import { useOutlineModel } from './useOutlineModel';
import { useReceiptStore } from '../receipt/receiptStore';

const shown = () => useReceiptStore.getState().receipts.map((r) => r.what);
const UNDONE = "Couldn't save that change — undone";

const tree = () => ({
  base_template: 'three_act',
  acts: [{ id: 'ac1', text: 'Act', chapters: [{ id: 'ch1', text: 'Ch', scenes: [
    { id: 'sc1', text: 'Scene', beats: [
      { id: 'bt1', text: 'First', kind: 'text' },
      { id: 'bt2', text: 'Second', kind: 'text' },
    ] },
  ] }] }],
});

// The first outline load answers; later refetches hang (server unreachable), so
// what's on screen after a failure is only what the hook itself rolled back.
let loads = 0;
let placeCalls = 0;
let failPlaceFrom = Infinity;
let failReorder = false;
let failOp = '';
const callOp = vi.fn(async (_pid: unknown, op: string) => {
  if (op === 'get_grand_outline') {
    loads += 1;
    return loads === 1 ? { grand_outline: tree() } : new Promise(() => {});
  }
  if (op === 'place_thread_beat') {
    placeCalls += 1;
    if (placeCalls >= failPlaceFrom) throw new Error('place failed');
  }
  if (op === 'reorder_outline_item' && failReorder) throw new Error('reorder failed');
  if (op === failOp) throw new Error(`${op} failed`);
  if (op === 'delete_outline_item') return { deleted_id: 'x', undo_token: 'tok-1' };
  return {};
});
vi.mock('../../gateway', () => ({ callOp: (...a: [unknown, string]) => callOp(...a) }));

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useOutlineModel('p1'), { wrapper });
  await waitFor(() => expect(hook.result.current.grandOutline).toBeTruthy());
  const sceneBeats = () => (client.getQueryData(qk.outline('p1')) as any)
    .acts[0].chapters[0].scenes[0].beats.map((b: any) => b.text);
  return { hook, sceneBeats };
}

describe('useOutlineModel: a failed drag leaves the beats where they were', () => {
  beforeEach(() => {
    loads = 0;
    placeCalls = 0;
    failPlaceFrom = Infinity;
    failReorder = false;
    failOp = '';
    callOp.mockClear();
    useReceiptStore.setState({ receipts: [] });
  });

  it('takes back dropped beats that failed to place, keeping the ones that landed', async () => {
    failPlaceFrom = 2; // the heading lands, its child fails
    const { hook, sceneBeats } = await setup();
    act(() => hook.result.current.ops.dropBeat('sc1', 2, {
      threadId: 't1', itemId: 'i1', text: 'Heading', kind: 'heading',
      children: [{ itemId: 'i2', text: 'Child', kind: 'text' }],
    }));
    expect(sceneBeats()).toEqual(['First', 'Second', 'Heading', 'Child']);
    await waitFor(() => expect(sceneBeats()).toEqual(['First', 'Second', 'Heading']));
    expect(shown()).toEqual([UNDONE]);
  });

  it('removes a dropped beat entirely when its placement fails', async () => {
    failPlaceFrom = 1;
    const { hook, sceneBeats } = await setup();
    act(() => hook.result.current.ops.dropBeat('sc1', 0, {
      threadId: 't1', itemId: 'i1', text: 'Dropped', kind: 'text',
    }));
    await waitFor(() => expect(sceneBeats()).toEqual(['First', 'Second']));
    expect(shown()).toEqual([UNDONE]);
  });

  it('moves a reordered beat back when the reorder fails', async () => {
    failReorder = true;
    const { hook, sceneBeats } = await setup();
    act(() => hook.result.current.ops.reorderTo('beat', 'bt1', 2));
    expect(sceneBeats()).toEqual(['Second', 'First']);
    await waitFor(() => expect(sceneBeats()).toEqual(['First', 'Second']));
    expect(shown()).toEqual([UNDONE]);
  });

  it('takes back an added beat when the add fails', async () => {
    failOp = 'add_outline_item';
    const { hook, sceneBeats } = await setup();
    act(() => { hook.result.current.ops.add('beat', 'sc1', 'New'); });
    expect(sceneBeats()).toEqual(['First', 'Second', 'New']);
    await waitFor(() => expect(sceneBeats()).toEqual(['First', 'Second']));
    expect(shown()).toEqual([UNDONE]);
  });

  it('puts the old text back when an edit fails', async () => {
    failOp = 'update_outline_item';
    const { hook, sceneBeats } = await setup();
    act(() => hook.result.current.ops.update('beat', 'bt1', { text: 'Edited' }));
    expect(sceneBeats()).toEqual(['Edited', 'Second']);
    await waitFor(() => expect(sceneBeats()).toEqual(['First', 'Second']));
  });

  it('brings a deleted beat back when the delete fails', async () => {
    failOp = 'delete_outline_item';
    const { hook, sceneBeats } = await setup();
    act(() => hook.result.current.ops.remove('beat', 'bt2'));
    expect(sceneBeats()).toEqual(['First']);
    await waitFor(() => expect(sceneBeats()).toEqual(['First', 'Second']));
  });
});

describe('useOutlineModel: deleting a beat offers a 10-second Undo', () => {
  beforeEach(() => {
    loads = 0;
    failOp = '';
    callOp.mockClear();
    useReceiptStore.setState({ receipts: [] });
  });

  it('shows "Beat deleted — Undo"; Undo sends the delete\'s token back', async () => {
    const { hook, sceneBeats } = await setup();
    act(() => hook.result.current.ops.remove('beat', 'bt2'));
    expect(sceneBeats()).toEqual(['First']);
    await waitFor(() => expect(shown()).toEqual(['Beat deleted']));
    const toast = useReceiptStore.getState().receipts[0];
    expect(toast.undo).toBeTypeOf('function');
    act(() => toast.undo!());
    await waitFor(() => expect(callOp).toHaveBeenCalledWith(
      'p1', 'restore_deleted_beat', { token: 'tok-1' }));
  });

  it('shows no Undo for a beat that was empty', async () => {
    const { hook } = await setup();
    let emptyId = '';
    act(() => { emptyId = hook.result.current.ops.add('beat', 'sc1', ''); });
    act(() => hook.result.current.ops.remove('beat', emptyId));
    await waitFor(() => expect(callOp).toHaveBeenCalledWith(
      'p1', 'delete_outline_item', expect.anything()));
    await Promise.resolve();
    expect(shown()).toEqual([]);
  });
});

describe('useOutlineModel: deleting an act, chapter or scene asks first', () => {
  beforeEach(() => {
    loads = 0;
    failOp = '';
    callOp.mockClear();
  });

  it('keeps a non-empty act when the author cancels, even with no prose', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { hook } = await setup();
    act(() => hook.result.current.ops.remove('act', 'ac1'));
    expect(confirmSpy).toHaveBeenCalledWith(
      "Delete this act? It contains 1 chapter, 1 scene, 2 beats. This can't be undone.");
    expect(callOp).not.toHaveBeenCalledWith('p1', 'delete_outline_item', expect.anything());
    expect(hook.result.current.grandOutline.acts).toHaveLength(1);
    confirmSpy.mockRestore();
  });

  it('deletes an empty scene without asking', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { hook } = await setup();
    let sceneId = '';
    act(() => { sceneId = hook.result.current.ops.add('scene', 'ch1', ''); });
    // The cache tells the hook a moment later; a real second click comes after that.
    await waitFor(() => expect(hook.result.current.grandOutline.acts[0].chapters[0].scenes)
      .toHaveLength(2));
    act(() => hook.result.current.ops.remove('scene', sceneId));
    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(callOp).toHaveBeenCalledWith(
      'p1', 'delete_outline_item', expect.anything()));
    confirmSpy.mockRestore();
  });
});
