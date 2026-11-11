import { callOp } from '../../gateway';

/**
 * The grand outline WITHOUT each scene's prose (SA-306). For screens that only
 * need the structure, titles, beats and word counts, so they don't download the
 * whole manuscript. No frontend screen reads the full-prose outline: Write and
 * Preview load structure lean too (loadWriteData) and fetch prose one chapter
 * at a time with `get_chapter_docs` (SA-308).
 */
export function getLeanGrandOutline(projectId: string | number) {
  return callOp(projectId, 'get_grand_outline', { include_prose: false });
}

export const EMPTY_OUTLINE = {
  grandOutline: null as any,
  coverage: null as any,
};

function countScenes(acts: any[]): { total: number; empty: number; words: number; beats: number } {
  let total = 0, empty = 0, words = 0, beats = 0;
  for (const act of acts || []) {
    for (const ch of act.chapters || []) {
      for (const sc of ch.scenes || []) {
        total++;
        const scBeats = sc.beats || [];
        beats += scBeats.length;
        const w = sc.words ?? 0;
        words += w;
        const hasContent = scBeats.some((b: any) => b.kind === 'text');
        if (!hasContent && w === 0) empty++;
      }
    }
  }
  return { total, empty, words, beats };
}

export function deriveCoverage(outline: any) {
  if (!outline?.acts) return null;
  const s = countScenes(outline.acts);
  const covered = s.total - s.empty;
  return {
    percent: s.total > 0 ? Math.round((covered / s.total) * 100) : 0,
    covered,
    total: s.total,
    beats: s.beats,
    empty: s.empty,
    merge: 0,
  };
}

// get_grand_outline read-merges pending merge proposals as ghost beats in the
// SAME triad get_thread/get_character_full return ({actual_value, proposal:<id>,
// proposed_value, proposed_kind, insert}). Fold each ghost into the editor beat
// shape the row already consumes — `{id, text, kind, proposal:{id,text,kind},
// insert, from_rough}` — exactly like loadThreads does for get_thread. Committed
// beats (no proposal/insert) pass through untouched. A pure insert has no actual
// value, so `text` carries the PROPOSED text (so the beat reads meaningfully on
// any surface; the green row edits via the proposal).
function foldOutlineProposals(grandOutline: any): any {
  if (!grandOutline?.acts) return grandOutline;
  for (const act of grandOutline.acts) {
    for (const ch of act.chapters ?? []) {
      for (const sc of ch.scenes ?? []) {
        sc.beats = (sc.beats ?? []).map((b: any) => {
          if (b.proposal == null && !b.insert) return b; // committed beat — untouched
          return {
            ...b,
            id: b.id ?? `prop-${b.proposal}`,
            text: b.proposed_value ?? b.actual_value ?? b.text ?? '',
            kind: b.proposed_kind ?? b.kind ?? 'text',
            proposal: { id: b.proposal, text: b.proposed_value ?? '', kind: b.proposed_kind ?? b.kind },
            insert: !!b.insert,
          };
        });
      }
    }
  }
  return grandOutline;
}

export async function loadOutline(projectId: string | undefined) {
  if (!projectId) return EMPTY_OUTLINE;

  // Throws on failure so the page shows "Couldn't load", not an empty outline (SA-132).
  const res = await getLeanGrandOutline(projectId);
  const grandOutline = foldOutlineProposals(res.grand_outline ?? null);
  const coverage = deriveCoverage(grandOutline);
  return { grandOutline, coverage };
}

// ---- merge-into-grand beat proposals (Night Eyes places → author reviews green) ----
// Accept/reject route through the GENERIC proposal caps so every surface (toast/
// chat/outline) dismisses in lockstep; update_proposed saves the edited green value
// back into the proposal (edit-before-accept). Mirrors the thread-beat data fns.
export async function acceptOutlineBeat(projectId: string | undefined, proposalId: any) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'accept_proposal', { proposal_id: String(proposalId) }, 'Outline');
}
export async function rejectOutlineBeat(projectId: string | undefined, proposalId: any) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'reject_proposal', { proposal_id: String(proposalId) }, 'Outline');
}
export async function updateProposedOutlineBeat(
  projectId: string | undefined, proposalId: any, text?: string, kind?: string,
) {
  if (!projectId) throw new Error('no project');
  const args: any = { proposal_id: String(proposalId) };
  if (text !== undefined) args.text = text;
  if (kind !== undefined) args.kind = kind;
  return callOp(projectId, 'update_proposed_outline_beat', args, 'Outline');
}

export async function loadScaffolds(projectId: string | undefined): Promise<any[]> {
  if (!projectId) return [];
  const res = await callOp(projectId, 'get_outline_scaffolds').catch(() => ({}));
  return res.scaffolds ?? [];
}

/**
 * An act spec for init: a plain act-name string (one empty, unnamed chapter) or
 * a `{title, chapters}` dict — a structure scaffold naming both levels.
 */
export type OutlineActSpec = string | { title: string; chapters: string[] };

export async function initGrandOutline(
  projectId: string,
  args: { base_template?: string; acts?: OutlineActSpec[] },
) {
  return callOp(projectId, 'init_grand_outline', args);
}

export async function addOutlineItem(
  projectId: string,
  itemType: string,
  parentId?: string,
  text?: string,
  id?: string,
  atIndex?: number,
) {
  const args: any = { item_type: itemType };
  if (parentId) args.parent_id = parentId;
  if (text != null) args.text = text;
  if (id) args.id = id;
  if (atIndex != null && atIndex >= 0) args.at_index = atIndex;
  return callOp(projectId, 'add_outline_item', args);
}

export async function updateOutlineItem(
  projectId: string,
  itemType: string,
  itemId: string,
  fields: { text?: string; kind?: string; written?: boolean },
) {
  return callOp(projectId, 'update_outline_item', {
    item_type: itemType,
    item_id: itemId,
    ...fields,
  });
}

export async function reorderOutlineItem(
  projectId: string,
  itemType: string,
  itemId: string,
  newIndex: number,
) {
  return callOp(projectId, 'reorder_outline_item', {
    item_type: itemType,
    item_id: itemId,
    new_index: newIndex,
  });
}

export async function deleteOutlineItem(
  projectId: string,
  itemType: string,
  itemId: string,
) {
  return callOp(projectId, 'delete_outline_item', {
    item_type: itemType,
    item_id: itemId,
  });
}

/**
 * Undo a beat delete (outline beat or thread beat). `token` is the delete's
 * `undo_token`. Returns `{beat, index, scene_id | thread_id, already_restored}`.
 */
export async function restoreDeletedBeat(projectId: string, token: string) {
  return callOp(projectId, 'restore_deleted_beat', { token });
}
