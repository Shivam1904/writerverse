import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptOutlineBeat,
  addOutlineItem,
  deleteOutlineItem,
  deriveCoverage,
  initGrandOutline,
  rejectOutlineBeat,
  reorderOutlineItem,
  restoreDeletedBeat,
  updateOutlineItem,
  updateProposedOutlineBeat,
} from '../../pages/outline/data';
import { placeThreadBeat, addSceneWithBeats } from '../../pages/threads/data';
import { useProposalStore } from '../proposal';
import { qk, queries } from '../../queries';
import { buildIndicators } from './indicators';
import { loadStatus } from '../../lib/loadStatus';
import { deletedWithUndo, receipt } from '../receipt/receiptStore';

import {
  insertItem,
  moveItem,
  moveItemTo,
  normalize,
  patchItem,
  removeItem,
  subtreeContents,
  deleteConfirmMessage,
} from './tree';

/**
 * Headless data + operations layer for the grand outline. The SINGLE source the
 * grand-outline page, the chapter rail, and the outline rail all consume.
 *
 * Data lives in ONE TanStack cache line — `['outline', pid]` — so every view
 * (and `useCounts`) shares one fetch (TanStack dedupes) and stays in sync: an
 * optimistic edit or a backend invalidation (`outline` domain → this key, via
 * queryInvalidator) updates all consumers at once. Selection (which chapter /
 * scene is active) is NOT stored here — it lives in the URL and each view reads
 * it directly. This hook owns only the tree + the optimistic ops surface keyed
 * by (level, id).
 */
// Key + fetch come from the central `queries` registry so this hook, useCounts,
// and any other consumer share one cache line + one shape. OUTLINE_KEY aliases
// `qk.outline` to keep the write-site calls below readable.
const OUTLINE_KEY = qk.outline;

const PREFIX: Record<string, string> = { act: 'ac', chapter: 'ch', scene: 'sc', beat: 'bt' };
const localId = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
// Shown when a failed move/placement is rolled back on screen. (Once SA-291's
// gateway problem toast is on main, it covers this and the line can go.)
const UNDONE_MSG = "Couldn't save that change — undone";
const normKind = (k: any): string => (k === 'heading' ? 'heading' : k === 'placeholder' ? 'placeholder' : 'text');

// Mutate every scene's beat list in place via `fn(beats, scene)`. Used by the
// merge-proposal ops to find/replace a ghost beat wherever it sits.
function eachScene(go: any, fn: (beats: any[], scene: any) => void) {
  for (const act of go?.acts ?? []) {
    for (const ch of act.chapters ?? []) {
      for (const sc of ch.scenes ?? []) {
        sc.beats = sc.beats ?? [];
        fn(sc.beats, sc);
      }
    }
  }
}

// Read-only: the beat with this id anywhere in the outline, or null.
function findBeat(go: any, id: string): any {
  for (const act of go?.acts ?? [])
    for (const ch of act.chapters ?? [])
      for (const sc of ch.scenes ?? [])
        for (const b of sc.beats ?? []) if (b?.id === id) return b;
  return null;
}

export interface OutlineOps {
  /** Inserts the item optimistically and persists it; returns the (client-generated) id. */
  add: (level: string, parentId?: string, text?: string, atIndex?: number) => string;
  /**
   * Adds an untitled chapter holding one empty-title scene, appended to `actId`
   * (defaults to the last act). Returns the new chapter's client id.
   */
  addChapter: (actId?: string) => string;
  update: (level: string, id: string, fields: { text?: string; kind?: string; written?: boolean }) => void;
  reorder: (level: string, id: string, direction: -1 | 1) => void;
  /** Move an item to an absolute index among its siblings (drag-to-reorder). */
  reorderTo: (level: string, id: string, toIndex: number) => void;
  remove: (level: string, id: string) => void;
  dropBeat: (sceneId: string, beatIndex: number, data: any) => void;
  /** Drop a thread beat onto a chapter's "new scene" zone: create a fresh scene
   *  seeded with the dropped beat (+ its children) via add_scene_with_beats. */
  dropNewScene: (chapterId: string, data: any) => void;
  /** ✓ accept a green merge-proposal beat: optimistically promote the ghost to a
   *  real beat, then apply via the generic accept (+ reconcile). */
  acceptBeat: (beat: any) => void;
  /** ✗ reject a green merge-proposal beat: optimistically drop the ghost, then
   *  reject the proposal. */
  rejectBeat: (beat: any) => void;
  /** ✓ accept EVERY pending green merge-proposal beat in the outline: one
   *  optimistic commit promotes all ghosts, then the accepts run sequentially
   *  (mutating guard) with a single reconciling reload. */
  acceptAllBeats: () => void;
  /** Edit a green proposed beat's text — optimistic + debounced into the proposal. */
  changeProposedBeat: (beat: any, text: string) => void;
  /** Tab on a green proposed beat — cycle its proposed kind (text→placeholder→
   *  heading) optimistically + into the proposal. */
  cycleProposedKind: (beat: any, dir?: 1 | -1) => void;
  /** acts: plain act-name strings, or `{title, chapters}` structure scaffolds. */
  init: (args: { base_template?: string; acts?: (string | { title: string; chapters: string[] })[] }) => Promise<void>;
}

export function useOutlineModel(projectId?: string) {
  const queryClient = useQueryClient();

  // The tree lives in the shared cache. The `outline` domain maps to this key in
  // queryInvalidator, so a write from anywhere (sibling surface, chat, cron,
  // another tab via the D32 staleness push) refetches us automatically — no
  // manual subscribeInvalidation needed. Selection stays in the URL per view.
  const outlineQuery = useQuery({
    ...queries.outline(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const { data: grandOutline = null, isLoading: loading } = outlineQuery;
  // 'loading' / 'error' / 'ready' — distinct from "no outline yet", so pages
  // don't offer the first-run scaffold picker over a real outline (SA-132, SA-154).
  const status = loadStatus(outlineQuery);

  // Latest outline, readable synchronously inside callbacks (e.g. addChapter
  // resolving the default act) without widening their dependency lists.
  const goRef = useRef<any>(null);
  goRef.current = grandOutline;

  // >0 while a multi-write op (addChapter = chapter then scene) is in flight.
  // Each write self-invalidates `outline`, and the axios interceptor fires that
  // refetch BEFORE our own .then runs — so without this guard the chapter-write
  // refetch would land mid-sequence and momentarily drop the optimistic scene.
  // We cancel those in-flight refetches and do one reconciling reload at the end.
  const mutating = useRef(0);

  // debounce timers for proposed-beat text edits (one per ghost beat id)
  const propTimers = useRef<Record<string, any>>({});

  const reload = useCallback(() => {
    if (!projectId) return Promise.resolve();
    return queryClient.invalidateQueries({ queryKey: OUTLINE_KEY(projectId) });
  }, [projectId, queryClient]);

  // Optimistic mutation against the shared cache: clone → mutate raw tree →
  // write. Nodes/coverage are derived (useMemo) so we never set state inside an
  // updater. While a multi-write op runs, cancel queued refetches so they can't
  // clobber the in-progress optimistic tree (reconciled by `reload` at the end).
  // A write failed to save: put the tree back as it was before the change. If
  // the cache changed since (another edit landed), refetch the server's tree
  // instead.
  const undoMove = useCallback((before: any, moved: any) => {
    receipt(UNDONE_MSG);
    if (queryClient.getQueryData(OUTLINE_KEY(projectId)) === moved) {
      queryClient.setQueryData(OUTLINE_KEY(projectId), before);
    } else reload();
  }, [projectId, queryClient, reload]);

  // Returns an undo to call when the matching server write fails.
  const commit = useCallback((mut: (go: any) => void) => {
    if (mutating.current > 0) queryClient.cancelQueries({ queryKey: OUTLINE_KEY(projectId) });
    const before = queryClient.getQueryData(OUTLINE_KEY(projectId));
    const after = queryClient.setQueryData(OUTLINE_KEY(projectId), (prev: any) => {
      const go = structuredClone(prev) || { base_template: 'three_act', acts: [] };
      mut(go);
      return go;
    });
    return () => undoMove(before, after);
  }, [projectId, queryClient, undoMove]);

  const add: OutlineOps['add'] = useCallback((level, parentId, text, atIndex) => {
    const id = localId(PREFIX[level] || 'x');
    if (!projectId) return id;
    let item: any;
    if (level === 'act') item = { id, text: text || 'New act', chapters: [] };
    else if (level === 'chapter') item = { id, text: text || null, scenes: [] };
    else if (level === 'scene') item = { id, text: text || 'Heading', beats: [], thread: null, words: 0 };
    else item = { id, text: text || '', kind: 'text' };
    const undo = commit((go) => insertItem(go, level, parentId, item, atIndex));
    addOutlineItem(projectId, level, parentId, text, id, atIndex).catch(undo);
    return id;
  }, [projectId, commit]);

  const addChapter: OutlineOps['addChapter'] = useCallback((actId) => {
    const chId = localId('ch');
    if (!projectId) return chId;
    const scId = localId('sc');
    // Untitled chapter (text:null → "untitled" placeholder) carrying one
    // empty-title scene (text:'' → "..." placeholder), matching add() shapes.
    const scene = { id: scId, text: '', beats: [], thread: null, words: 0 };
    const chapter = { id: chId, text: null, scenes: [scene] };

    // The scene's parent is the new chapter, so the chapter row MUST land first
    // — the two add_outline_item calls otherwise race for the per-project
    // session lock and the scene could 404 on a missing parent. Sequence them,
    // holding off self-reloads until both land (see `mutating`), then reconcile.
    mutating.current += 1;
    const settle = () => {
      mutating.current = Math.max(0, mutating.current - 1);
      if (mutating.current === 0) reload();
    };
    const persist = (parentActId: string) =>
      addOutlineItem(projectId, 'chapter', parentActId, undefined, chId)
        .then(() => {
          // The chapter write's auto-invalidation (X-Invalidates → the global
          // interceptor) just queued an outline refetch that would drop the
          // still-unpersisted optimistic scene. Cancel it; `settle` does the one
          // reconciling reload once the scene write lands too.
          queryClient.cancelQueries({ queryKey: OUTLINE_KEY(projectId) });
          return addOutlineItem(projectId, 'scene', chId, undefined, scId);
        });

    const acts = goRef.current?.acts || [];
    const targetActId = actId || (acts.length ? acts[acts.length - 1].id : undefined);
    if (targetActId) {
      commit((go) => insertItem(go, 'chapter', targetActId, chapter));
      persist(targetActId).then(settle, settle);
    } else {
      // No act to hang it under yet — seed one, then the chapter beneath it.
      const acId = localId('ac');
      commit((go) => insertItem(go, 'act', undefined, { id: acId, text: 'New act', chapters: [chapter] }));
      addOutlineItem(projectId, 'act', undefined, undefined, acId)
        .then(() => persist(acId))
        .then(settle, settle);
    }
    return chId;
  }, [projectId, commit, reload, queryClient]);

  const update: OutlineOps['update'] = useCallback((level, id, fields) => {
    if (!projectId) return;
    const undo = commit((go) => patchItem(go, level, id, fields));
    updateOutlineItem(projectId, level, id, fields).catch(undo);
  }, [projectId, commit]);

  const reorder: OutlineOps['reorder'] = useCallback((level, id, direction) => {
    if (!projectId) return;
    const prev = queryClient.getQueryData(OUTLINE_KEY(projectId)) as any;
    if (!prev) return;
    const go = structuredClone(prev);
    const newIdx = moveItem(go, level, id, direction);
    if (newIdx === null) return; // already at the edge — no move
    const moved = queryClient.setQueryData(OUTLINE_KEY(projectId), go);
    reorderOutlineItem(projectId, level, id, newIdx).catch(() => undoMove(prev, moved));
  }, [projectId, queryClient, undoMove]);

  const reorderTo: OutlineOps['reorderTo'] = useCallback((level, id, toIndex) => {
    if (!projectId) return;
    const prev = queryClient.getQueryData(OUTLINE_KEY(projectId)) as any;
    if (!prev) return;
    const go = structuredClone(prev);
    const newIdx = moveItemTo(go, level, id, toIndex);
    if (newIdx === null) return; // no-op (not found or same slot)
    const moved = queryClient.setQueryData(OUTLINE_KEY(projectId), go);
    reorderOutlineItem(projectId, level, id, newIdx).catch(() => undoMove(prev, moved));
  }, [projectId, queryClient, undoMove]);

  // Deleting an act/chapter/scene removes its whole subtree, so anything
  // non-empty asks first and says what goes with it. Beats are never confirmed
  // (a beat worth keeping gets the Undo toast below). The gate lives here so
  // every outline skin inherits it.
  const remove: OutlineOps['remove'] = useCallback((level, id) => {
    if (!projectId) return;
    if (level !== 'beat') {
      const message = deleteConfirmMessage(level, subtreeContents(goRef.current, level, id));
      if (message && !confirm(message)) return;
    }
    // A beat with words or a thread link gets the 10-second Undo (an empty
    // one has nothing to bring back). The delete's `undo_token` is a snapshot
    // of the beat; Undo sends it back and the server puts the beat in place.
    const gone = level === 'beat' ? findBeat(goRef.current, id) : null;
    const worthUndo = !!gone && (!!String(gone.text ?? '').trim() || !!gone.from_item);
    const undo = commit((go) => removeItem(go, level, id));
    deleteOutlineItem(projectId, level, id).then((res: any) => {
      if (!worthUndo || !res?.undo_token) return;
      deletedWithUndo(() => {
        restoreDeletedBeat(projectId, res.undo_token)
          .catch(() => { /* the gateway shows the problem toast */ })
          .finally(() => reload());
      }, 'Beat deleted');
    }, undo);
  }, [projectId, commit, reload]);

  const dropBeat: OutlineOps['dropBeat'] = useCallback((sceneId, beatIndex, data) => {
    if (!projectId || !data?.threadId || !data?.itemId) return;
    // A heading carries its children: place the whole block (heading + the beats
    // until the next heading) as a contiguous group. A normal beat is a one-item
    // block. Each placed beat keeps its kind (a heading STAYS a heading) and its
    // source tags so the spine can colour, number, and group it.
    const items: any[] =
      data.kind === 'heading' && Array.isArray(data.children)
        ? [{ itemId: data.itemId, text: data.text, kind: 'heading' }, ...data.children]
        : [{ itemId: data.itemId, text: data.text, kind: data.kind }];

    // optimistic: insert all beats at the drop point, in order. Tagging with the
    // source thread (from_rough/from_item) lights up the dot/lane/number instantly,
    // before the place_thread_beat reload lands.
    const localIds = items.map(() => localId('bt'));
    commit((go) => {
      let at = beatIndex;
      items.forEach((it, i) => {
        const nb = {
          id: localIds[i],
          text: it.text ?? '',
          kind: it.kind === 'heading' ? 'heading' : (it.kind ?? 'text'),
          from_rough: data.threadId,
          from_item: it.itemId,
        };
        insertItem(go, 'beat', sceneId, nb, at < 0 ? undefined : at);
        if (at >= 0) at += 1;
      });
    });

    // Persist sequentially — each place_thread_beat takes the per-project lock,
    // so we run them in series and hold off self-reloads (mutating guard) until
    // the last lands, then reconcile once. (Mirrors addChapter's sequencing.)
    mutating.current += 1;
    (async () => {
      let at = beatIndex;
      for (let i = 0; i < items.length; i++) {
        try {
          await placeThreadBeat(projectId, data.threadId, items[i].itemId, sceneId, at);
        } catch {
          // Stop here and take back the beats that didn't land (this one and the
          // rest of the block), so the scene shows only what was saved.
          receipt(UNDONE_MSG);
          const unplaced = localIds.slice(i);
          commit((go) => { for (const id of unplaced) removeItem(go, 'beat', id); });
          break;
        }
        queryClient.cancelQueries({ queryKey: OUTLINE_KEY(projectId) });
        if (at >= 0) at += 1;
      }
    })().finally(() => {
      mutating.current = Math.max(0, mutating.current - 1);
      if (mutating.current === 0) reload();
    });
  }, [projectId, commit, reload, queryClient]);

  // Drop onto a chapter's "new scene" zone → create a scene seeded with the
  // dropped beat (+ its children) in one op. Optimistic: the new scene + beats
  // appear instantly (local ids); `reload` reconciles (real ids + auto-title)
  // once add_scene_with_beats lands.
  const dropNewScene: OutlineOps['dropNewScene'] = useCallback((chapterId, data) => {
    if (!projectId || !data?.itemId) return;
    const items: any[] =
      data.kind === 'heading' && Array.isArray(data.children)
        ? [{ text: data.text, kind: 'heading', itemId: data.itemId }, ...data.children]
        : [{ text: data.text, kind: data.kind, itemId: data.itemId }];
    // carry from_item (its number) + from_rough (its thread colour) so the new
    // scene's beats read as placed, like a drop into an existing scene.
    const beats = items
      .map((it) => ({
        text: String(it.text ?? '').trim(),
        kind: it.kind === 'heading' ? 'heading' : (it.kind ?? 'text'),
        from_item: it.itemId,
        from_rough: data.threadId,
      }))
      .filter((b) => b.text);
    if (!beats.length) return;

    // optimistic: drop the whole scene in now so the beats are visible at once.
    commit((go) => insertItem(go, 'scene', chapterId, {
      id: localId('sc'),
      text: '',
      thread: null,
      words: 0,
      beats: beats.map((b) => ({ id: localId('bt'), ...b })),
    }));

    mutating.current += 1;
    addSceneWithBeats(projectId, chapterId, beats)
      .catch(() => { /* swallow — reload reconciles */ })
      .finally(() => {
        mutating.current = Math.max(0, mutating.current - 1);
        if (mutating.current === 0) reload();
      });
  }, [projectId, commit, reload]);

  /* ---- merge-into-grand beat proposals (green ✓/✗ inline in the outline) ----
   * get_grand_outline read-merges pending merge inserts as ghost beats (folded to
   * `{proposal:{id,text,kind}, insert}` in loadOutline). These ops mirror
   * useThreadBeats: optimistic local change first (so the green flips instantly),
   * then the backend call + reload reconcile. The outline cache IS the source, so
   * a plain `commit` is the optimistic step (no separate mirror needed). */
  const acceptBeat: OutlineOps['acceptBeat'] = useCallback((beat) => {
    const pid = beat?.proposal?.id;
    if (!projectId || !pid) return;
    const nt = beat.proposal?.text ?? beat.text ?? '';
    const nk = normKind(beat.proposal?.kind ?? beat.kind);
    // optimistic: replace the ghost with a real (local-id) beat, keeping lineage
    commit((go) => eachScene(go, (beats) => {
      const i = beats.findIndex((b) => b.id === beat.id);
      if (i < 0) return;
      const g = beats[i];
      beats[i] = { id: localId('bt'), text: nt, kind: nk, from_rough: g.from_rough, from_item: g.from_item };
    }));
    (async () => {
      try {
        if (beat.proposal?.text != null) {
          await updateProposedOutlineBeat(projectId, pid, beat.proposal.text, beat.proposal.kind);
        }
        await acceptOutlineBeat(projectId, pid);
      } finally { reload(); }
    })();
  }, [projectId, commit, reload]);

  const rejectBeat: OutlineOps['rejectBeat'] = useCallback((beat) => {
    const pid = beat?.proposal?.id;
    if (!projectId || !pid) return;
    commit((go) => eachScene(go, (beats) => {
      const i = beats.findIndex((b) => b.id === beat.id);
      if (i >= 0) beats.splice(i, 1);
    }));
    // reload either way: on failure it brings the rejected beat back
    rejectOutlineBeat(projectId, pid).catch(() => receipt(UNDONE_MSG)).finally(() => reload());
  }, [projectId, commit, reload]);

  const acceptAllBeats: OutlineOps['acceptAllBeats'] = useCallback(() => {
    if (!projectId) return;
    // gather every pending ghost (proposal id + its latest proposed text/kind, so
    // an un-flushed inline edit still lands). Read-only walk of the live tree.
    const jobs: { pid: string; text?: string; kind?: string }[] = [];
    for (const act of goRef.current?.acts ?? [])
      for (const ch of act.chapters ?? [])
        for (const sc of ch.scenes ?? [])
          for (const b of sc.beats ?? []) {
            const pid = b?.proposal?.id;
            if (pid) jobs.push({ pid: String(pid), text: b.proposal?.text, kind: b.proposal?.kind });
          }
    if (!jobs.length) return;

    // optimistic: replace ALL ghosts with real (local-id) beats in one commit
    commit((go) => eachScene(go, (beats) => {
      for (let i = 0; i < beats.length; i++) {
        const g = beats[i];
        if (!g?.proposal) continue;
        beats[i] = {
          id: localId('bt'),
          text: g.proposal?.text ?? g.text ?? '',
          kind: normKind(g.proposal?.kind ?? g.kind),
          from_rough: g.from_rough,
          from_item: g.from_item,
        };
      }
    }));

    // persist sequentially (each accept takes the per-project lock), holding off
    // self-reloads until the last lands, then reconcile once. Mirrors dropBeat.
    mutating.current += 1;
    (async () => {
      for (const j of jobs) {
        try {
          if (j.text != null) await updateProposedOutlineBeat(projectId, j.pid, j.text, j.kind);
          await acceptOutlineBeat(projectId, j.pid);
        } catch { /* skip a failed item */ }
        queryClient.cancelQueries({ queryKey: OUTLINE_KEY(projectId) });
      }
    })().finally(() => {
      mutating.current = Math.max(0, mutating.current - 1);
      if (mutating.current === 0) reload();
    });
  }, [projectId, commit, reload, queryClient]);

  const changeProposedBeat: OutlineOps['changeProposedBeat'] = useCallback((beat, text) => {
    const pid = beat?.proposal?.id;
    // optimistic: keep the green text + the editor display (text) in sync
    commit((go) => eachScene(go, (beats) => {
      const i = beats.findIndex((b) => b.id === beat.id);
      if (i >= 0) beats[i] = { ...beats[i], text, proposal: { ...beats[i].proposal, text } };
    }));
    if (!pid || !projectId) return;
    clearTimeout(propTimers.current[beat.id]);
    // text-only: don't pass kind here, or this debounced write could revert a
    // kind the author Tab-cycled in the meantime (cycleProposedKind owns kind).
    propTimers.current[beat.id] = setTimeout(
      // debounced: several keystrokes may be riding on this write, so on
      // failure refetch the server's text rather than undo just the last one
      () => updateProposedOutlineBeat(projectId, pid, text).catch(() => { receipt(UNDONE_MSG); reload(); }), 500);
  }, [projectId, commit, reload]);

  const KIND_CYCLE = ['text', 'placeholder', 'heading'];
  const cycleProposedKind: OutlineOps['cycleProposedKind'] = useCallback((beat, dir = 1) => {
    const pid = beat?.proposal?.id;
    const cur = normKind(beat.proposal?.kind ?? beat.kind);
    const nk = KIND_CYCLE[(KIND_CYCLE.indexOf(cur) + dir + KIND_CYCLE.length) % KIND_CYCLE.length];
    // optimistic: the ghost's display kind AND its proposed kind both move
    const undo = commit((go) => eachScene(go, (beats) => {
      const i = beats.findIndex((b) => b.id === beat.id);
      if (i >= 0) beats[i] = { ...beats[i], kind: nk, proposal: { ...beats[i].proposal, kind: nk } };
    }));
    if (pid && projectId) updateProposedOutlineBeat(projectId, pid, undefined, nk).catch(undo);
  }, [projectId, commit]);

  const init: OutlineOps['init'] = useCallback(async (args) => {
    if (!projectId) return;
    await initGrandOutline(projectId, args).catch(() => receipt(UNDONE_MSG));
    await reload();
  }, [projectId, reload]);

  // Merge proposals arrive/clear as generic Proposal rows (PROPOSE caps don't emit
  // staleness, like the character studio). Refetch the outline whenever the set of
  // pending merge proposals changes so the read-merged ghosts appear / reconcile.
  const mergeSig = useProposalStore((s) =>
    s.pending
      .filter((p) => p.capability === 'run_merge_rough_into_grand')
      .map((p) => p.proposalId)
      .sort()
      .join(','),
  );
  useEffect(() => { if (projectId) reload(); }, [mergeSig, projectId, reload]);

  const ops: OutlineOps = useMemo(
    () => ({ add, addChapter, update, reorder, reorderTo, remove, dropBeat, dropNewScene, acceptBeat, rejectBeat, acceptAllBeats, changeProposedBeat, cycleProposedKind, init }),
    [add, addChapter, update, reorder, reorderTo, remove, dropBeat, dropNewScene, acceptBeat, rejectBeat, acceptAllBeats, changeProposedBeat, cycleProposedKind, init],
  );

  const nodes = useMemo(() => normalize(grandOutline), [grandOutline]);
  const coverage = useMemo(() => deriveCoverage(grandOutline), [grandOutline]);
  const indicators = useMemo(() => buildIndicators(nodes), [nodes]);

  return { grandOutline, nodes, coverage, indicators, loading, status, reload, ops };
}
