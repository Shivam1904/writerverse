import { useProposalStore } from './useProposalStore';
import type { ProposalConflict } from './useProposalStore';

type Cap = 'accept_proposal' | 'reject_proposal';

/** The 409 the backend returns when the author changed the target after the AI
 *  suggested it (SA-209). Returns its conflicts, or null for any other error. */
export function isStaleConflict(err: any): ProposalConflict[] | null {
  const res = err?.response;
  if (res?.status !== 409 || res?.data?.code !== 'proposal_stale') return null;
  return Array.isArray(res.data.conflicts) ? res.data.conflicts : [];
}

/** 409 `proposal_not_pending`: someone already accepted / dismissed it. */
export function isProposalClosed(err: any): boolean {
  const res = err?.response;
  return res?.status === 409 && res?.data?.code === 'proposal_not_pending';
}

/**
 * onAccept / onCancel / onForceAccept for a server-backed proposal. Success
 * removes the card; failure keeps it and flags `error` so the card shows a
 * message + Retry (calling the same handler again retries). A stale accept
 * (the author edited the target since) keeps the card and sets `conflicts`, so
 * it can show theirs vs the AI's with "Use AI's" (onForceAccept) / "Keep mine"
 * (onCancel). An already-closed proposal just drops its card. `run` does the
 * actual call; `extra` carries `{force: true}` for Use AI's.
 *
 * Surfaces that accept without a card handler (green inline beats, the chat
 * retry banner) still keep the store in sync: `callOp` drops the card on any
 * successful accept/reject (SA-219).
 */
export function makeProposalHandlers(
  proposalId: number | string,
  run: (capability: Cap, extra?: Record<string, unknown>) => Promise<unknown>,
) {
  const store = () => useProposalStore.getState();
  const go = (capability: Cap, failed: 'accept' | 'reject', extra?: Record<string, unknown>) => {
    store().setError(proposalId, undefined);
    run(capability, extra).then(
      () => store().remove(proposalId),
      (err) => {
        const conflicts = capability === 'accept_proposal' ? isStaleConflict(err) : null;
        if (conflicts) store().setConflicts(proposalId, conflicts);
        else if (isProposalClosed(err)) store().remove(proposalId);
        else store().setError(proposalId, failed);
      },
    );
  };
  return {
    onAccept: () => go('accept_proposal', 'accept'),
    onCancel: () => go('reject_proposal', 'reject'),
    onForceAccept: () => go('accept_proposal', 'accept', { force: true }),
  };
}
