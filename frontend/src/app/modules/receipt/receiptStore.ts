import { create } from 'zustand';

/**
 * Work receipts ("Receipt" in docs/product/glossary.md):
 *
 *   ✦ <what happened> → <where it landed>     (always linked)
 *
 * Emitted whenever the AI (or an accepted proposal) changes story data, so no
 * AI write is silent. One store, one renderer (<ReceiptToasts>, mounted once in
 * the shell); emitters call `receipt()` and move on.
 */

export interface Receipt {
  id: number;
  /** What happened — short verb phrase ("Enriched dead grandma"). */
  what: string;
  /** Where it landed — surface label ("Characters"). Doubles as the link text. */
  where?: string;
  /** In-app path for the link (e.g. `/project/8/world`). */
  href?: string;
  /** Shows an "Undo" button; clicking it runs this and closes the toast. */
  undo?: () => void;
}

interface ReceiptStore {
  receipts: Receipt[];
  push: (r: Omit<Receipt, 'id'>, ttlMs?: number) => void;
  remove: (id: number) => void;
}

let _seq = 1;
const TTL_MS = 6000;
/** How long a "Deleted — Undo" toast stays (decided 2026-09-30: no trash bin, a 10s Undo). */
export const UNDO_TTL_MS = 10000;

export const useReceiptStore = create<ReceiptStore>((set) => ({
  receipts: [],
  push: (r, ttlMs = TTL_MS) => {
    const id = _seq++;
    set((s) => ({ receipts: [...s.receipts, { ...r, id }] }));
    setTimeout(() => {
      useReceiptStore.getState().remove(id);
    }, ttlMs);
  },
  remove: (id) => set((s) => ({ receipts: s.receipts.filter((x) => x.id !== id) })),
}));

/** Fire-and-forget emitter. */
export function receipt(what: string, where?: string, href?: string) {
  useReceiptStore.getState().push({ what, where, href });
}

/**
 * The shared "Deleted — Undo" toast: stays 10 seconds; Undo runs `onUndo`,
 * which should bring the deleted thing back. Fire it after any delete.
 */
export function deletedWithUndo(onUndo: () => void, what = 'Deleted') {
  useReceiptStore.getState().push({ what, undo: onUndo }, UNDO_TTL_MS);
}

/**
 * Problem toasts — the red twin of a receipt: "a write failed". Fired by the
 * gateway on any failed non-read call, so no failed write is silent either.
 * They stay until the author dismisses them. While one is showing, the same
 * message again (e.g. an autosave retrying) doesn't stack a second toast.
 */
export interface Problem {
  id: number;
  what: string;
}

interface ProblemStore {
  problems: Problem[];
  push: (what: string) => void;
  remove: (id: number) => void;
}

export const useProblemStore = create<ProblemStore>((set) => ({
  problems: [],
  push: (what) => set((s) => (
    s.problems.some((x) => x.what === what)
      ? s
      : { problems: [...s.problems, { what, id: _seq++ }] }
  )),
  remove: (id) => set((s) => ({ problems: s.problems.filter((x) => x.id !== id) })),
}));

/** Fire-and-forget emitter for a failed write. */
export function problem(what: string) {
  useProblemStore.getState().push(what);
}
