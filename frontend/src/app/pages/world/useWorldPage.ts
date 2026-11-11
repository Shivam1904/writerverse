import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addWorldItem,
  updateWorldItem,
  deleteWorldItem,
  undeleteWorldItem,
  addWorldBlock,
  updateWorldBlock,
  updateProjectMeta,
  promoteWorldEntity,
  updateProposedWorldEntity,
  worldMetaFrom,
  patchWorldItem,
  removeWorldItem,
} from './data';
import type { WorldData, WorldEntries, WorldItemPatch, WorldSection } from './data';
import type { FieldProposal } from '../characters/components/FieldEdit';
import { useWorldPending } from './pendingSections';
import { useMetaFields } from './useMetaFields';
import { useWorldIdeas, useWorldCandidates, sectionKind, IDEA_PHANTOM_SECTIONS } from './worldIdeas';
import type { SectionHeadingPatch } from './components/WorldMargin';
import { usePendingByCapability } from '../../modules/proposal';
import { deletedWithUndo } from '../../modules/receipt/receiptStore';
import { queries, qk } from '../../queries';
import { loadStatus } from '../../lib/loadStatus';
import { normalizeGlyphKey } from '../../components/StoryIconsRegistry';

/**
 * useWorldPage — all of the World page's data plumbing in one place: loading,
 * CRUD handlers, "ideas from braindumps", candidate entities, AI draft
 * proposals, pending suggestions, and the synthesized (phantom) sections. The
 * component consumes the returned values and is left to do nothing but lay out
 * MarginBlocks.
 *
 * How the data stays fresh (SA-82): the page reads two SHARED TanStack caches —
 * `queries.world` (the entries, grouped into sections) and `queries.projectMeta`
 * (the story details). The world rail and the sidebar counts read the same two,
 * so opening the page costs no extra request when they're warm. A write never
 * reloads by hand: its response names the domains it changed (`X-Invalidates`),
 * and queryInvalidator refetches just those caches, once. A story-detail edit
 * refetches only the project meta; a world-entry edit refetches only the world.
 * Edits and deletes show at once (optimistic cache edits) while that runs.
 */
/** A change to the story details (title, synopsis, genres…). */
export type MetaPatch = {
  synopsis?: string; title?: string; themes?: string[]; tones?: string[];
  genres?: string[]; logline?: string;
  perspective?: string; tense?: string; audience?: string;
};

const STALE_MS = 60_000;

export function useWorldPage(projectId: string | undefined) {
  const queryClient = useQueryClient();

  const worldQ = useQuery({ ...queries.world(projectId), enabled: !!projectId, staleTime: STALE_MS });
  const metaQ = useQuery({ ...queries.projectMeta(projectId), enabled: !!projectId, staleTime: STALE_MS });
  const world: WorldData = useMemo(
    () => ({ ...worldMetaFrom(metaQ.data), sections: worldQ.data?.sections ?? [] }),
    [worldQ.data, metaQ.data],
  );
  // Loading must be distinguishable from empty: rendering the empty-state
  // placeholders before the data arrives reads as "your data is gone"
  // (UX_FINDINGS 2026-07-02 F1.3). And a failed first load shows "Couldn't
  // load", never the empty world (SA-132). A failed background refetch keeps
  // what's shown (loadStatus stays 'ready' once data has arrived).
  const worldStatus = loadStatus(worldQ);
  const metaStatus = loadStatus(metaQ);
  const loaded = worldStatus === 'ready' && metaStatus === 'ready';
  const loadFailed = !loaded && (worldStatus === 'error' || metaStatus === 'error');
  // The "Couldn't load" screen's Retry.
  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.world(projectId) });
    void queryClient.invalidateQueries({ queryKey: qk.projectMeta(projectId) });
  }, [queryClient, projectId]);

  /** Show an entry edit on the page now; the write's refetch confirms it. */
  const editEntries = useCallback(async (edit: (e: WorldEntries) => WorldEntries) => {
    // A refetch already in flight would land the OLD rows over this edit.
    await queryClient.cancelQueries({ queryKey: qk.world(projectId) });
    queryClient.setQueryData<WorldEntries>(qk.world(projectId), (old) => (old ? edit(old) : old));
  }, [queryClient, projectId]);

  /** A failed write: drop the optimistic view, re-read the truth, re-throw. */
  const revert = useCallback((err: unknown): never => {
    void queryClient.invalidateQueries({ queryKey: qk.world(projectId) });
    throw err;
  }, [queryClient, projectId]);

  const { data: castData } = useQuery({
    ...queries.characters(projectId),
    enabled: !!projectId,
    staleTime: STALE_MS,
  });
  const castCharacters: any[] = (castData as any)?.characters ?? [];

  // Every write below goes through the gateway, whose response carries the
  // domains it changed (`worldbuilding`, `items`, `project_meta`), and
  // queryInvalidator refetches the matching cache. So no handler reloads by
  // hand: that used to re-read the whole world two or three times per click.
  // Writes from elsewhere (Night Eyes, another tab) arrive the same way.

  const onAdd = useCallback(
    async (title: string, tags: string[], content?: string) => {
      await addWorldItem(projectId, { title, content, tags });
    },
    [projectId],
  );

  const onUpdate = useCallback(
    async (id: string, patch: WorldItemPatch) => {
      await editEntries((e) => patchWorldItem(e, id, patch));
      await updateWorldItem(projectId, id, patch).catch(revert);
    },
    [projectId, editEntries, revert],
  );

  const onDelete = useCallback(
    async (id: string) => {
      await editEntries((e) => removeWorldItem(e, id));
      await deleteWorldItem(projectId, id).catch(revert);
      // 10-second "Deleted — Undo": the delete is soft, so Undo restores the
      // entry server-side; its refetch puts it back in its old place.
      deletedWithUndo(async () => {
        try {
          await undeleteWorldItem(projectId, id);
        } catch (err) {
           
          console.error('undo delete world entry failed:', err);
        }
      });
    },
    [projectId, editEntries, revert],
  );

  // ── Add-section panel (inline "+ new section") ──
  const [addingSection, setAddingSection] = useState(false);
  const onAddSection = useCallback(
    async (name: string, glyph: string, color: string) => {
      await addWorldBlock(projectId, { name, glyph, color });
      setAddingSection(false);
    },
    [projectId],
  );

  // Author edits a section heading (rename / hint / glyph / color) — a direct
  // WRITE; its refetch shows the new heading.
  const onUpdateSectionHeading = useCallback(
    async (name: string, patch: SectionHeadingPatch) => {
      await updateWorldBlock(projectId, { name, ...patch });
    },
    [projectId],
  );

  // ── "From your ideas" — braindump phrases bucketed by entity kind, one strip
  // per section behind a single global toggle (the character-studio idiom). ──
  const worldIdeas = useWorldIdeas(projectId);
  const [showIdeas, setShowIdeas] = useState(false);

  // Candidate entities ("make real"): braindump-tagged entities of a section's
  // kind that aren't real Worldbuilding rows yet. `realNames` is every live world
  // item name (stable across renders so the candidate memo doesn't thrash).
  const realNames = useMemo(
    () => world.sections.flatMap((s) =>
      (s.items || []).map((it: any) => String(it?.name || it?.title || it?.text || '').trim()),
    ).filter(Boolean),
    [world.sections],
  );
  const candidatesByKind = useWorldCandidates(projectId, realNames);

  // Pending AI description drafts (queued by "make real"), keyed by the entity
  // row they target so each renders in-context on its section.
  const draftProposals = usePendingByCapability('draft_world_entity');
  const draftsByWid = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of draftProposals) {
      const wid = p.result?.worldbuilding_id;
      if (wid == null) continue;
      m[String(wid)] = {
        proposalId: p.proposalId,
        content: p.result?.content || '',
        onAccept: p.onAccept,
        onReject: p.onCancel,
      };
    }
    return m;
  }, [draftProposals]);

  // A FieldProposal for one entity's description, or undefined — the green
  // edit/accept/reject overlay the item's description field renders when a draft
  // is pending. Edit blur-saves into the proposal; ✓ saves-then-accepts; ✗ drops.
  const proposalForItem = useCallback((itemId: any): FieldProposal | undefined => {
    const d = draftsByWid[String(itemId)];
    if (!d) return undefined;
    return {
      value: d.content,
      onEdit: async (next: string) => { await updateProposedWorldEntity(projectId, d.proposalId, next); },
      onAccept: async (final: string) => {
        await updateProposedWorldEntity(projectId, d.proposalId, final);
        d.onAccept();
      },
      onReject: () => d.onReject(),
    };
  }, [draftsByWid, projectId]);

  // The canonical tag an item filed into this section carries. Keyed off the
  // section's ENTITY kind (not its layout `kind`). The places block is `places`
  // everywhere — the same name the backend's known block uses — so an item filed
  // under it tags `places` and surfaces in that one block (no duplicate).
  const sectionTag = useCallback((section: WorldSection): string => {
    const k = normalizeGlyphKey(section.name || section.id);
    if (k === 'rule') return 'rule';
    if (k === 'location') return 'places';
    if (k === 'item') return 'thing';
    return section.name || section.id;
  }, []);

  // "Make real": promote a candidate entity → a real entry in this section NOW,
  // which also queues an AI description draft (a proposal on the new row).
  const onMakeReal = useCallback(async (section: WorldSection, name: string) => {
    await promoteWorldEntity(projectId, name, sectionTag(section), sectionKind(section.name || section.id));
  }, [projectId, sectionTag]);

  // Show story details on the page right away, before any refetch. Used for the
  // author's own edits and for an AI suggestion the author just accepted. The
  // patch uses the project meta's own field names, so it merges straight into
  // the shared meta cache (the topbar title updates too).
  const showMeta = useCallback((patch: MetaPatch) => {
    queryClient.setQueryData(qk.projectMeta(projectId), (old: any) => (old ? { ...old, ...patch } : old));
  }, [queryClient, projectId]);

  // The AI's pending story-detail suggestions, per field. An accepted one shows
  // as the author's at once (showMeta), with no reload.
  const meta = useMetaFields(projectId, showMeta);

  const onSaveMeta = useCallback(
    async (patch: MetaPatch) => {
      // Optimistically reflect the author's own edit so their words never *look*
      // lost while the save round-trips. project-meta is a PROPOSE-route op, so a
      // refetch would otherwise snap the field straight back to empty and feel
      // like data loss.
      showMeta(patch);
      try {
        // Ran directly → its response refetches the project meta (canonical
        // truth). Proposed → nothing refetches, so the optimistic view stays;
        // the change is now a pending proposal that the toast/surfaces already
        // let the author accept (one source of truth across surfaces).
        await updateProjectMeta(projectId, patch);
      } catch (err) {
         
        console.error('save meta failed:', err);
        // Revert to server truth on failure.
        void queryClient.invalidateQueries({ queryKey: qk.projectMeta(projectId) });
      }
    },
    [projectId, queryClient, showMeta],
  );

  // Pending "add to world" proposals (add_worldbuilding + extracted item/rule),
  // bucketed by the section they file into so each renders IN CONTEXT inside that
  // section. Accepting one refetches the world through its own response.
  const { bySection } = useWorldPending();

  // Synthesize an empty section for any pending bucket whose section isn't on the
  // page yet (e.g. the first extraction into a project with no rules/items) so the
  // suggestion still lands in its real home rather than vanishing.
  const realKeys = new Set(world.sections.map((sec) => sec.id));
  const phantomSections: WorldSection[] = [];
  for (const [key, items] of bySection) {
    if (realKeys.has(key) || items.length === 0) continue;
    const d = items[0];
    phantomSections.push({
      id: key,
      name: key,
      title: d.sectionTitle,
      hint: d.sectionHint,
      kind: d.kind,
      addLabel: d.sectionAddLabel,
      glyph: d.glyph,
      color: d.color,
      items: [],
    });
  }
  // Idea-only sections: a known entity kind that has braindump phrases but no
  // section on the page yet still surfaces (empty), so its ideas have a home —
  // even before the author adds the first item. Deduped by kind against what's
  // already shown (real + pending).
  const presentKinds = new Set(
    [...world.sections, ...phantomSections].map((s) => sectionKind(s.name || s.id)),
  );
  const ideaPhantoms: WorldSection[] = [];
  for (const [kind, d] of Object.entries(IDEA_PHANTOM_SECTIONS)) {
    if (presentKinds.has(kind) || !(worldIdeas[kind]?.length)) continue;
    presentKinds.add(kind);
    ideaPhantoms.push({
      id: d.id, name: d.id, title: d.title, hint: d.hint,
      kind: 'bullets', addLabel: 'item', glyph: d.glyph, color: d.color, items: [],
    });
  }
  const sections = [...world.sections, ...phantomSections, ...ideaPhantoms];

  const hasAnyIdeas = Object.values(worldIdeas).some((arr) => (arr?.length ?? 0) > 0);

  return {
    // data
    world,
    loaded,
    loadFailed,
    reload,
    sections,
    castCount: castCharacters.length,
    hasAnyIdeas,
    bySection,
    candidatesByKind,
    proposalForItem,
    // ui state
    showIdeas,
    setShowIdeas,
    addingSection,
    setAddingSection,
    // handlers
    onAdd,
    onUpdate,
    onDelete,
    onSaveMeta,
    meta,
    onUpdateSectionHeading,
    onAddSection,
    onMakeReal,
  };
}
