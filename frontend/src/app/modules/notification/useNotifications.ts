import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { archiveNotification, loadNotifications } from './api';
import type { AppNotification } from './types';
import { problem } from '../receipt/receiptStore';

type Bundle = { active: AppNotification[]; archived: AppNotification[] };
const EMPTY: Bundle = { active: [], archived: [] };
const notifKey = (pid: any) => ['notifications', String(pid ?? '')] as const;

/**
 * One hook feeds both surfaces — the rail (active) and the bell (archived).
 * Polled on the usual TanStack cadence (no push). Archiving optimistically
 * moves a card from active → archived so both surfaces update in lockstep.
 */
export function useNotifications() {
  const { projectId } = useParams();
  const qc = useQueryClient();

  const { data = EMPTY } = useQuery({
    queryKey: notifKey(projectId),
    queryFn: () => loadNotifications(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const archiveMut = useMutation({
    mutationFn: (id: number) => archiveNotification(projectId, id),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: notifKey(projectId) });
      const prev = qc.getQueryData<Bundle>(notifKey(projectId));
      if (prev) {
        const moved = prev.active.find((n) => n.id === id);
        qc.setQueryData<Bundle>(notifKey(projectId), {
          active: prev.active.filter((n) => n.id !== id),
          archived: moved
            ? [{ ...moved, status: 'archived' }, ...prev.archived]
            : prev.archived,
        });
      }
      return { prev };
    },
    // Put the card back and say so (plain REST, so the gateway's toast doesn't fire).
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(notifKey(projectId), ctx.prev);
      problem("Couldn't archive the notification. Please try again.");
    },
  });

  return {
    projectId,
    active: data.active,
    archived: data.archived,
    archive: (id: number) => archiveMut.mutate(id),
  };
}
