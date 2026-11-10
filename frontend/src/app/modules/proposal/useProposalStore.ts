import { create } from 'zustand';

/**
 * Global pending-proposal panel. Keyed by `proposalId` (was `capability`
 * before 2026-05-28) so multiple proposals can coexist. Every surface that
 * shows a pending proposal (the bell, page cards) reads this one list.
 * Rehydrated from `GET /pending-proposals/` on project mount so proposals
 * survive page refresh.
 *
 * `proposalId` is `number | string`: real backend ids are integers from
 * the `Proposal` table; a local-only flow may pass a synthetic string id.
 */
/** One field the author changed after the AI suggested it (SA-209): the accept
 *  was refused with 409 `proposal_stale` and nothing was written. */
export interface ProposalConflict {
  field: string;
  /** The value when the AI made the suggestion. */
  was: unknown;
  /** The author's value now. */
  current: unknown;
  /** The AI's value. */
  proposed: unknown;
}

export interface PendingProposal {
  proposalId: number | string;
  capability: string;
  result: any;
  onAccept: () => void;
  onCancel: () => void;
  /** Set when the last accept/reject call failed; the card shows it + Retry. */
  error?: 'accept' | 'reject';
  /** Set when accept was refused because the author changed the target since
   *  the AI suggested it. The card shows theirs vs the AI's + Use AI's / Keep mine. */
  conflicts?: ProposalConflict[];
  /** "Use AI's": accept anyway, overwriting the author's newer value. */
  onForceAccept?: () => void;
  /** When this proposal entered the store (ms epoch). Used by the Night Eyes
   *  bottom bar to decide whether a proposal is still "fresh" (arrived after the
   *  user's last chat message → preview it inline) vs. minimized to a count.
   *  Stamped on `push` when the caller doesn't provide it. */
  createdAt?: number;
}

interface ProposalStore {
  pending: PendingProposal[];
  push: (p: PendingProposal) => void;
  remove: (proposalId: number | string) => void;
  setError: (proposalId: number | string, error: PendingProposal['error']) => void;
  setConflicts: (proposalId: number | string, conflicts: PendingProposal['conflicts']) => void;
  clear: () => void;
}

/** Ids arrive as numbers (rehydration, SSE) or strings (op args), so match by value. */
const sameId = (a: number | string, b: number | string) => String(a) === String(b);

export const useProposalStore = create<ProposalStore>((set) => ({
  pending: [],
  push: (p) =>
    set((s) => {
      // Preserve the ORIGINAL arrival time across re-pushes (rehydration / a
      // re-seeded SSE entry) so "freshness" doesn't reset when callbacks refresh.
      const prior = s.pending.find((x) => sameId(x.proposalId, p.proposalId));
      const stamped: PendingProposal = {
        ...p,
        createdAt: p.createdAt ?? prior?.createdAt ?? Date.now(),
      };
      return {
        // Dedup by proposalId — if a proposal with this id is already
        // pending, replace its entry (preferring the freshest callbacks).
        pending: [
          ...s.pending.filter((x) => !sameId(x.proposalId, p.proposalId)),
          stamped,
        ],
      };
    }),
  remove: (proposalId) =>
    set((s) => ({
      pending: s.pending.filter((x) => !sameId(x.proposalId, proposalId)),
    })),
  setError: (proposalId, error) =>
    set((s) => ({
      pending: s.pending.map((x) => (sameId(x.proposalId, proposalId) ? { ...x, error } : x)),
    })),
  setConflicts: (proposalId, conflicts) =>
    set((s) => ({
      pending: s.pending.map((x) => (sameId(x.proposalId, proposalId) ? { ...x, conflicts } : x)),
    })),
  clear: () => set({ pending: [] }),
}));
