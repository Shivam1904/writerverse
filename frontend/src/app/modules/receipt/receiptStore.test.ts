// SA-302: the shared "Deleted — Undo" toast stays for 10 seconds, then goes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deletedWithUndo, useReceiptStore } from './receiptStore';

describe('deletedWithUndo', () => {
  afterEach(() => {
    vi.useRealTimers();
    useReceiptStore.setState({ receipts: [] });
  });

  it('shows an Undo toast for 10 seconds', () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    deletedWithUndo(onUndo);

    const [toast] = useReceiptStore.getState().receipts;
    expect(toast.what).toBe('Deleted');
    toast.undo!();
    expect(onUndo).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(9_900);
    expect(useReceiptStore.getState().receipts).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(useReceiptStore.getState().receipts).toHaveLength(0);
  });
});
