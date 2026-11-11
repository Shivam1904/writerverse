import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptMetaField, loadProjectMetaFull, rejectMetaField, updateProposedMetaField } from './data';
import type { FieldProposal } from '../../ui';
import { useProposalStore } from '../../modules/proposal';
import { isStaleConflict } from '../../modules/proposal/proposalHandlers';

/**
 * useMetaFields — the AI's pending suggestions for the World page's story
 * details, one field at a time.
 *
 * Where suggestions come from: an AI `update_project_meta` run (the author asks
 * Night Eyes via the story section's Suggest button, or a braindump extract
 * finds a different title/synopsis). Either way the backend stores a
 * `meta_edit` proposal, and `get_project_meta_full` returns every field as
 * `{actual_value, proposal?, proposed_value?}`. Nothing here runs the AI.
 *
 *   • proposalFor(field) — a kit `FieldProposal` (green field + ✓ / ✗) for a
 *     field with a pending suggestion, or undefined. Lists (genres…) and coded
 *     choices (perspective…) are shown as text and turned back on accept.
 *   • staleField / acceptAiAnyway / keepMine — SA-209: if the author changed the
 *     field after the AI suggested it, accept is refused (409) and nothing is
 *     written. The page then asks: use the AI's value anyway, or keep theirs.
 *
 * `onApplied(patch)` fires after a field is accepted, so the page can show the
 * new value as the author's straight away.
 */

export type MetaField =
  | 'title' | 'synopsis' | 'logline' | 'genres' | 'themes' | 'tones'
  | 'perspective' | 'tense' | 'audience';

const LIST_FIELDS = new Set<MetaField>(['genres', 'themes', 'tones']);

/** Readable labels for the coded narration choices (stored as codes). */
export const NARRATION_LABELS: Partial<Record<MetaField, Record<string, string>>> = {
  perspective: {
    first: 'First person', second: 'Second person', 'third-limited': 'Third · limited',
    'third-omniscient': 'Third · omniscient', multiple: 'Multiple',
  },
  tense: { past: 'Past', present: 'Present', mixed: 'Mixed' },
  audience: {
    children: 'Children', 'middle-grade': 'Middle grade', 'young-adult': 'Young adult',
    adult: 'Adult', general: 'General',
  },
};

/** A stored value → the text shown in the field. */
export function metaToText(field: MetaField, value: any): string {
  if (LIST_FIELDS.has(field)) return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  const labels = NARRATION_LABELS[field];
  if (labels) return labels[value] ?? String(value ?? '');
  return String(value ?? '');
}

/** The text in the field → the value to store. A coded choice the author typed
 *  over falls back to the AI's code if it isn't a known label or code. */
export function metaFromText(field: MetaField, text: string, proposed: any): any {
  if (LIST_FIELDS.has(field)) return text.split(',').map((s) => s.trim()).filter(Boolean);
  const labels = NARRATION_LABELS[field];
  if (labels) {
    const t = text.trim().toLowerCase();
    const code = Object.keys(labels).find((k) => k === t || labels[k].toLowerCase() === t);
    return code ?? proposed;
  }
  return text;
}

/** How a field is named to the author ("the synopsis", "Accept AI synopsis"). */
export const FIELD_LABELS: Record<MetaField, string> = {
  title: 'title', synopsis: 'synopsis', logline: 'logline', genres: 'genres',
  themes: 'themes', tones: 'tone', perspective: 'perspective', tense: 'tense',
  audience: 'audience',
};

/** True when two values of a field say the same thing: lists compare item by
 *  item (case and spacing ignored), text compares trimmed, and null = "". */
export function sameMetaValue(field: MetaField, a: any, b: any): boolean {
  const norm = (v: any) => (LIST_FIELDS.has(field)
    ? (Array.isArray(v) ? v : (v ? [v] : [])).map((x: any) => String(x).trim().toLowerCase()).filter(Boolean).join('\n')
    : String(v ?? '').trim());
  return norm(a) === norm(b);
}

type Stale = { field: MetaField; pid: any; value: any };

export function useMetaFields(projectId: string | undefined, onApplied?: (patch: Record<string, any>) => void) {
  const queryClient = useQueryClient();
  const metaKey = ['project-meta-full', projectId];
  const [stale, setStale] = useState<Stale | null>(null);

  const { data: full } = useQuery({
    queryKey: metaKey,
    queryFn: () => loadProjectMetaFull(projectId),
    enabled: !!projectId,
    staleTime: 10_000,
  });

  // A new suggestion arrives through the proposal store (a chat turn, a toast
  // accept, a reload), not through this query. Refetch whenever the set of
  // pending meta proposals changes, so the green fields show and clear in step
  // with the bell and the chat card (the useCharacterFields pattern).
  const metaSig = useProposalStore((s) =>
    s.pending
      .filter((p) => p.capability === 'update_project_meta')
      .map((p) => String(p.proposalId))
      .sort()
      .join(','),
  );
  useEffect(() => {
    if (projectId) queryClient.invalidateQueries({ queryKey: ['project-meta-full', projectId] });
  }, [metaSig, projectId, queryClient]);

  // Refetch; once no field still points at `pid`, the proposal is closed
  // server-side, so drop its card from the bell too.
  const refetchAfter = useCallback(async (pid: any) => {
    await queryClient.refetchQueries({ queryKey: ['project-meta-full', projectId] });
    const next: any = queryClient.getQueryData(['project-meta-full', projectId]);
    const stillOpen = next && Object.values(next).some((cell: any) => String(cell?.proposal) === String(pid));
    if (next && !stillOpen) useProposalStore.getState().remove(pid);
  }, [queryClient, projectId]);

  const accept = useCallback(async (field: MetaField, pid: any, value: any, force = false) => {
    try {
      await acceptMetaField(projectId, pid, field, value, force);
      setStale(null);
      onApplied?.({ [field]: value });
    } catch (err) {
      if (isStaleConflict(err)) setStale({ field, pid, value });
      // Any other failure: the gateway already shows a red message; the green
      // suggestion stays so the author can try again.
    } finally {
      await refetchAfter(pid);
    }
  }, [projectId, onApplied, refetchAfter]);

  const reject = useCallback(async (field: MetaField, pid: any) => {
    try {
      await rejectMetaField(projectId, pid, field);
      setStale(null);
    } catch {
      // The gateway shows the failure; the suggestion stays.
    } finally {
      await refetchAfter(pid);
    }
  }, [projectId, refetchAfter]);

  const proposalFor = useCallback((field: MetaField): FieldProposal | undefined => {
    const cell = full?.[field];
    if (!cell || cell.proposed_value === undefined || cell.proposal == null) return undefined;
    const pid = cell.proposal;
    const proposed = cell.proposed_value;
    // The AI sometimes "suggests" what is already there (e.g. "" for an empty
    // perspective). That's not a suggestion: don't show it.
    if (sameMetaValue(field, proposed, cell.actual_value)) return undefined;
    return {
      name: FIELD_LABELS[field],
      value: metaToText(field, proposed),
      // Editing the green text saves the edit INTO the suggestion (still pending).
      onEdit: async (text: string) => {
        try { await updateProposedMetaField(projectId, pid, field, metaFromText(field, text, proposed)); }
        catch { /* the gateway shows the failure */ }
        finally { await refetchAfter(pid); }
      },
      onAccept: (text: string) => { void accept(field, pid, metaFromText(field, text, proposed)); },
      onReject: () => { void reject(field, pid); },
    };
  }, [full, projectId, accept, reject, refetchAfter]);

  return {
    proposalFor,
    /** The field whose accept was refused because the author changed it since. */
    staleField: stale?.field ?? null,
    acceptAiAnyway: () => { if (stale) void accept(stale.field, stale.pid, stale.value, true); },
    keepMine: () => { if (stale) void reject(stale.field, stale.pid); },
  };
}

export type MetaFields = ReturnType<typeof useMetaFields>;
