import { useProposalStore, makeProposalHandlers } from '../proposal';
import { callOp } from '../../gateway';
import { fetchPendingProposals } from './streamClient';

/**
 * Load the project's pending Proposal rows (GET /pending-proposals/) into
 * `useProposalStore`, so the bell lists them.
 *
 * - On project mount (`replace: true`): wipe the store first, so a project
 *   switch never shows the old project's cards.
 * - After every Night Eyes turn (`replace: false`): merge in any row the store
 *   doesn't have yet. A chat turn can create a proposal without a `proposal`
 *   SSE event reaching the client (e.g. the turn errored after the write), so
 *   without this the new card stays invisible until a reload.
 *
 * Each entry's onAccept/onCancel calls the accept/reject op directly, so chat
 * doesn't need to be open for accept to work.
 */
export async function syncPendingProposals(
  projectId: string,
  { replace = false, isStale }: { replace?: boolean; isStale?: () => boolean } = {},
): Promise<void> {
  const rows = await fetchPendingProposals(projectId);
  if (isStale?.()) return; // e.g. the project changed while the fetch ran
  const store = useProposalStore.getState();
  if (replace) store.clear();
  const known = new Set(useProposalStore.getState().pending.map((p) => String(p.proposalId)));
  for (const row of rows) {
    const proposalId = row.proposal_id;
    if (known.has(String(proposalId))) continue;
    const page = row.page || 'default';
    // The row's real creation time, so the bell can tell weeks-old ones apart.
    const createdAt = Date.parse(row.created_at);
    store.push({
      proposalId,
      capability: row.capability,
      result: row.proposal?.preview || row.args || {},
      createdAt: Number.isNaN(createdAt) ? undefined : createdAt,
      ...makeProposalHandlers(proposalId, (cap, extra) =>
        callOp(projectId, cap, { proposal_id: String(proposalId), ...extra }, page)),
    });
  }
}
