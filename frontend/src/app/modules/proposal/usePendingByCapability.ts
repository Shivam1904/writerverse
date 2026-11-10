import { useMemo } from 'react';
import { useProposalStore, type PendingProposal } from './useProposalStore';

/**
 * Canonical pending-proposal read. Selects the raw, stable `pending` array
 * from the store (its reference only changes on push/remove/clear) and
 * derives the filtered list in a `useMemo`.
 *
 * Do the filtering HERE, never inside the Zustand selector. A selector that
 * returns `s.pending.filter(...)` builds a fresh array on every call, fails
 * the store's default Object.is equality, and throws useSyncExternalStore
 * into an infinite re-render loop. Every page surface (e.g. the threads merge
 * surface) reads through this hook so the pattern is identical.
 */
export function usePendingByCapability(capability: string): PendingProposal[] {
  const pending = useProposalStore((s) => s.pending);
  return useMemo(
    () => pending.filter((p) => p.capability === capability),
    [pending, capability],
  );
}
