import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '../../queries';
import { usePendingByCapability } from '../proposal';

/**
 * useBeatProposalRefetch — keep the green beat overlay live with the proposal store.
 *
 * Night Eyes adds/edits beats via `propose_insert_beat` / `propose_update_beat`
 * (Route.PROPOSE): each writes a beat_insert/beat_edit proposal that get_thread
 * read-merges onto the beat (`beat.proposal`), surfaced through the plotThreads
 * query. But a PROPOSE cap writes no story data, so it emits no staleness
 * invalidation, and ['plot_threads'] isn't refetched on its own —
 * so a freshly-proposed beat only appeared after a manual refresh.
 *
 * Subscribe to the proposal store (the canonical live source every surface shares)
 * and refetch plotThreads whenever a beat proposal appears or clears, so the green
 * overlay shows/hides in lockstep with the toast + chat.
 *
 * Call this from an ALWAYS-MOUNTED level (the page), NOT from a component a
 * collapsible section can unmount — e.g. the studio's Outline section unmounts
 * <ThreadsList> when collapsed, so a beat proposed while it's closed would never
 * refetch if the subscription lived there.
 */
export function useBeatProposalRefetch(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const updates = usePendingByCapability('propose_update_beat');
  const inserts = usePendingByCapability('propose_insert_beat');
  // id-signature, not a raw count: catches a proposal being replaced (one cleared
  // + one added in the same render) where the count would be unchanged.
  const sig = [...updates, ...inserts].map((p) => p.proposalId).sort().join(',');
  useEffect(() => {
    if (!projectId) return;
    queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
  }, [sig, projectId, queryClient]);
}
