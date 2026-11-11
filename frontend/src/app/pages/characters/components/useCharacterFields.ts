import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptCharacterField, loadCharacterFull, rejectCharacterField,
  updateCharacter, updateProposedField,
} from '../data';
import { qk } from '../../../queries';
import { useProposalStore } from '../../../modules/proposal';
import type { FieldProposal } from './FieldEdit';

/**
 * useCharacterFields — the ONE write path + AI-proposal overlay for the studio.
 *
 * Extracted verbatim from StudioHero (2026-06-08) so Identity / Arc / Voice
 * share the same persistence and the green "proposed field" accept/reject flow
 * stays byte-for-byte identical:
 *   • commitField  — persist a patch (Route.WRITE, the D24 "direct" CRUD tier)
 *   • fieldSaved   — read one field's saved value (with the voice/signature aliases)
 *   • fieldPatch   — build the update body for one field
 *   • proposedFor  — the green proposal overlay for any field with a pending value
 *     (onEdit blur-saves into the proposal · onAccept promotes · onReject drops)
 */
export function useCharacterFields(projectId?: string, character?: any) {
  const queryClient = useQueryClient();
  const charId = character?.id;

  /* ---- field value helpers (saved / patch) ----
   * `voice` and `signature` (the line only they could say) are not columns:
   * both live in the `voice_profile` dict, as `tone` and `signature`. */
  const fieldSaved = useCallback((key: string): string => {
    if (key === 'voice') return String(character?.voice_profile?.tone ?? '');
    if (key === 'signature') return String(character?.voice_profile?.signature ?? '');
    return String(character?.[key] ?? '');
  }, [character]);

  const fieldPatch = useCallback((key: string, value: string): any => {
    if (key === 'voice') return { voice_profile: { ...(character?.voice_profile ?? {}), tone: value } };
    if (key === 'signature') return { voice_profile: { ...(character?.voice_profile ?? {}), signature: value } };
    return { [key]: value };
  }, [character]);

  /* ---- the single write path: persist one field, refetch ---- */
  // Resolves `false` when the save failed (FieldEdit then keeps the author's draft
  // open with an error); never rejects, so un-awaited callers stay safe.
  const commitField = useCallback(async (patch: any): Promise<boolean | void> => {
    if (!character || !projectId || Object.keys(patch).length === 0) return;
    try {
      await updateCharacter(projectId, character.id, patch);
      queryClient.invalidateQueries({ queryKey: qk.characters(projectId) });
    } catch (err) {
      console.error('field save failed:', err);
      return false;
    }
  }, [character, projectId, queryClient]);

  /* ---- pending AI proposals (studio-only get_character_full) ----
   * Every field comes back wrapped {actual_value, proposal?, proposed_value?};
   * a field with a proposal renders the green proposed value + accept/reject. */
  const { data: full } = useQuery({
    queryKey: ['character-full', projectId, charId],
    queryFn: () => loadCharacterFull(projectId, charId),
    enabled: !!projectId && !!charId,
    staleTime: 10_000,
  });

  /* ---- live proposal sync ----
   * Night Eyes "edit character" runs `propose_character_edit` (Route.PROPOSE): it
   * writes a character_edit proposal this very query (get_character_full) surfaces
   * as the green per-field overlay. But a PROPOSE cap emits no staleness
   * invalidation — it interrupts before the chat's invalidates sink — and
   * ['character-full'] isn't in the staleness map, so a freshly-proposed edit never
   * refetched this query: the overlay only appeared after a manual refresh.
   * Subscribe to the proposal store (the canonical live source every surface
   * shares) and refetch character-full whenever a character-edit proposal appears
   * or clears, so the inline overlay shows/hides in lockstep with toast + chat. */
  const charEditSig = useProposalStore((s) =>
    s.pending
      .filter((p) => p.capability === 'propose_character_edit')
      .map((p) => p.proposalId)
      .sort()
      .join(','),
  );
  useEffect(() => {
    if (!projectId || !charId) return;
    queryClient.invalidateQueries({ queryKey: ['character-full', projectId, charId] });
  }, [charEditSig, projectId, charId, queryClient]);

  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.characters(projectId) });
    queryClient.invalidateQueries({ queryKey: ['character-full', projectId, charId] });
  }, [queryClient, projectId, charId]);

  /* ---- optimistic accept/reject (instant UI, refetch confirms) ----
   * The green overlay reads from the character-full cache and the resting value
   * reads from the characters cache. Without an optimistic patch, accept/reject
   * only land after the accept→get_character_full round-trip, and accept even
   * flashes the OLD committed value first (the proposal clears before characters
   * refetches). Patch BOTH caches in-memory so the swap is instant + flash-free;
   * refetchAll() then reconciles with the server. (Mirrors the threads-beat fix.) */
  const patchFullCell = useCallback((column: string, mut: (cell: any) => any) => {
    queryClient.setQueryData(['character-full', projectId, charId], (old: any) => {
      if (!old) return old;
      if (column.startsWith('appearance.')) {
        const sub = column.slice('appearance.'.length);
        const ap = old.appearance ?? {};
        return { ...old, appearance: { ...ap, [sub]: mut(ap[sub] ?? {}) } };
      }
      return { ...old, [column]: mut(old[column] ?? {}) };
    });
  }, [queryClient, projectId, charId]);

  // Promote the accepted value into the flat `characters` cache so the resting
  // field shows it the instant the green clears (no flash of the old value).
  const patchSaved = useCallback((column: string, value: string) => {
    if (!charId) return;
    queryClient.setQueryData(qk.characters(projectId), (old: any) => {
      if (!old?.characters) return old;
      return {
        ...old,
        characters: old.characters.map((c: any) => {
          if (c.id !== charId) return c;
          if (column.startsWith('appearance.')) {
            const sub = column.slice('appearance.'.length);
            return { ...c, appearance: { ...(c.appearance ?? {}), [sub]: value } };
          }
          return { ...c, ...fieldPatch(column, value) };
        }),
      };
    });
  }, [queryClient, projectId, charId, fieldPatch]);

  const optimisticAccept = useCallback((column: string, finalValue: string) => {
    patchSaved(column, finalValue);
    patchFullCell(column, (cell) => ({ ...cell, actual_value: finalValue, proposed_value: undefined, proposal: null }));
  }, [patchSaved, patchFullCell]);

  const optimisticReject = useCallback((column: string) => {
    patchFullCell(column, (cell) => ({ ...cell, proposed_value: undefined, proposal: null }));
  }, [patchFullCell]);

  // column -> proposal overlay for any field with a pending proposed value.
  //  • onEdit   = blur-save the edited value INTO the proposal (still pending)
  //  • onAccept = promote the value to the actual Character field, drop from proposal
  //  • onReject = drop the proposed field, write nothing
  const proposedFor = useCallback((column: string): FieldProposal | undefined => {
    const cell = full?.[column];
    if (!cell || cell.proposed_value === undefined || cell.proposal == null) return undefined;
    const pid = cell.proposal;
    return {
      value: String(cell.proposed_value ?? ''),
      onEdit: async (next: string) => {
        try { await updateProposedField(projectId, pid, column, next); }
        finally { refetchAll(); }
      },
      onAccept: async (finalValue: string) => {
        optimisticAccept(column, finalValue);
        try { await acceptCharacterField(projectId, pid, column, finalValue); }
        finally { refetchAll(); }
      },
      onReject: async () => {
        optimisticReject(column);
        try { await rejectCharacterField(projectId, pid, column); }
        finally { refetchAll(); }
      },
    };
  }, [full, projectId, refetchAll, optimisticAccept, optimisticReject]);

  // Proposal overlay for ONE sub-key of the `appearance` dict. `appearance` comes
  // back from get_character_full as a per-sub-key map ({age:{...}, eyes:{...}}),
  // each cell the same {actual_value, proposal?, proposed_value?} shape as a top-
  // level field — so a blank edits / accepts / rejects exactly like any other
  // field, just routed through the dotted path `appearance.<subkey>`.
  const appearanceProposedFor = useCallback((subkey: string): FieldProposal | undefined => {
    const cell = full?.appearance?.[subkey];
    if (!cell || cell.proposed_value === undefined || cell.proposal == null) return undefined;
    const pid = cell.proposal;
    const column = `appearance.${subkey}`;
    return {
      value: String(cell.proposed_value ?? ''),
      onEdit: async (next: string) => {
        try { await updateProposedField(projectId, pid, column, next); }
        finally { refetchAll(); }
      },
      onAccept: async (finalValue: string) => {
        optimisticAccept(column, finalValue);
        try { await acceptCharacterField(projectId, pid, column, finalValue); }
        finally { refetchAll(); }
      },
      onReject: async () => {
        optimisticReject(column);
        try { await rejectCharacterField(projectId, pid, column); }
        finally { refetchAll(); }
      },
    };
  }, [full, projectId, refetchAll, optimisticAccept, optimisticReject]);

  // True if any of the given columns has a pending proposal. `appearance` is the
  // per-sub-key map, so check whether ANY of its sub-cells carries a proposal.
  const hasAnyProposal = useCallback((columns: string[]): boolean => {
    if (!full) return false;
    return columns.some((col) => {
      if (col === 'appearance') {
        const ap = full.appearance;
        if (!ap || typeof ap !== 'object') return false;
        return Object.values(ap).some((cell: any) =>
          cell && cell.proposed_value !== undefined && cell.proposal != null);
      }
      const cell = full[col];
      return cell && cell.proposed_value !== undefined && cell.proposal != null;
    });
  }, [full]);

  return {
    commitField, fieldSaved, fieldPatch,
    proposedFor, appearanceProposedFor, hasAnyProposal, refetchAll,
  };
}
