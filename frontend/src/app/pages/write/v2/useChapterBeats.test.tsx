import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { useChapterBeats } from './useChapterBeats';
import { useReceiptStore } from '../../../modules/receipt/receiptStore';

const callOp = vi.fn(async (_pid: unknown, op: string): Promise<any> => {
  if (op === 'update_outline_item') throw new Error('update failed');
  if (op === 'get_threads_with_beats') return new Promise(() => {});
  return {};
});
vi.mock('../../../gateway', () => ({ callOp: (...a: [unknown, string]) => callOp(...a) }));

describe('useChapterBeats: a failed tick is undone', () => {
  it('flips the "written" tick back when the save fails', async () => {
    useReceiptStore.setState({ receipts: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const acts: any[] = [{ id: 'ac1', chapters: [{ id: 'ch1', scenes: [{ id: 'sc1', beats: [{ id: 'bt1', text: 'Beat' }] }] }] }];
    const hook = renderHook(() => useChapterBeats('p1', acts), { wrapper });
    act(() => hook.result.current.cycleBeat('bt1'));
    expect(hook.result.current.beatStates.bt1).toBe('done');
    await waitFor(() => expect(hook.result.current.beatStates.bt1).toBe('todo'));
    expect(useReceiptStore.getState().receipts.map((r) => r.what)).toEqual(["Couldn't save that change — undone"]);
  });
});
