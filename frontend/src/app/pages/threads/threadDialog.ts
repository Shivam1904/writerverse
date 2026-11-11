import { create } from 'zustand';

/**
 * threadDialog — a tiny cross-instance signal so the suggestions rail (the
 * "start your threads" initialize hint) can ask the ThreadsPage to open its
 * New-thread modal. The rail and the page are separate subtrees with no prop
 * path between them; this bridges the two, mirroring `beatFocus`.
 *
 * The card calls `requestNew()`; ThreadsPage opens the modal and `clear()`s.
 * `request` is a monotonic stamp (not a bool) so a second click re-fires even
 * if the consumer hasn't cleared yet. Loose-typed on purpose (app convention).
 */
export interface ThreadDialogState {
  request: number | null;
  requestNew: () => void;
  clear: () => void;
}

export const useThreadDialog = create<ThreadDialogState>((set) => ({
  request: null,
  requestNew: () => set({ request: Date.now() }),
  clear: () => set({ request: null }),
}));
