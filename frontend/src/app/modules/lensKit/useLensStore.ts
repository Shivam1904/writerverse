import { create } from 'zustand';

/* useLensStore — ONLY the per-ARN box-open UI state (session, in-memory). Which
 * lenses are attached is NOT tracked here — that lives on the gauge board (a binding
 * = preset + scope, server-side). The shelves read the board (see chartsForNode);
 * attach/detach call bind_gauge/unbind_gauge directly. */

interface LensState {
  open: Record<string, boolean>; // arn → inline box open
  toggleOpen: (arn: string) => void;
  setOpen: (arn: string, v: boolean) => void;
}

export const useLensStore = create<LensState>((set) => ({
  open: {},
  toggleOpen: (arn) => set((s) => ({ open: { ...s.open, [arn]: !s.open[arn] } })),
  setOpen: (arn, v) => set((s) => ({ open: { ...s.open, [arn]: v } })),
}));
