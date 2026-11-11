import { callOp } from '../../gateway';
import type { EntityKind } from '../../components/EntityMark';
import { threadColor } from '../../theme/aspects';
import { getLeanGrandOutline } from '../outline/data';

export const EMPTY_THREADS = { threads: [] as any[], threadMap: null as any, _rawThreads: [] as any[] };

export interface ThreadScopeType {
  value: string;
  label: string;
  /**
   * The glossy entity mark that leads the scope chip — `person` routes to the
   * name-tinted <Avatar>, the rest to <EntityMark> (see DESIGN_SYSTEM.md Part
   * A). Kinds are told apart by SHAPE, not colour.
   */
  mark: EntityKind;
  /** Everything except the whole-story scope takes a name. */
  needsName: boolean;
}

// Scope types a manually-created storyline can target — the union of the
// product's entity kinds (story / character / item / location / relationship /
// theme / rule / other). `story` is the whole-story scope and needs no name;
// the rest take one. Order = most-common first.
export const THREAD_SCOPE_TYPES: ThreadScopeType[] = [
  { value: 'story', label: 'Story', mark: 'thread', needsName: false },
  { value: 'character', label: 'Character', mark: 'person', needsName: true },
  { value: 'item', label: 'Item', mark: 'item', needsName: true },
  { value: 'location', label: 'Location', mark: 'location', needsName: true },
  { value: 'relationship', label: 'Relationship', mark: 'thread', needsName: true },
  { value: 'theme', label: 'Theme', mark: 'thread', needsName: true },
  { value: 'rule', label: 'Rule', mark: 'rule', needsName: true },
  { value: 'other', label: 'Other', mark: 'thread', needsName: true },
];

export interface ScaffoldBeat {
  /** An essential beat of the shape — rendered as a bold heading row. */
  heading: string;
  /** Imagination-inviting fill-in prompts under that heading (dashed slots). */
  placeholders: string[];
}

export interface ThreadScaffold {
  id: string;
  name: string;
  /** The default offered first. */
  suggested: boolean;
  /** Which thread scopes this shape suits (story / character / relationship). */
  scopeFit: string[];
  /** Plain explanation of what the thread is. */
  about: string;
  /** Brief pre-use guidance: what it's for and how to fill it. */
  using: string;
  beats: ScaffoldBeat[];
}

// The storyline scaffolds (config/thread_scaffolds.yml) — named beat skeletons the
// writer can seed a new thread from. Read live via the op gateway; no static
// fallback, so an unreachable read simply yields an empty picker.
export async function loadThreadScaffolds(projectId: string | undefined): Promise<ThreadScaffold[]> {
  if (!projectId) return [];
  try {
    const res = await callOp(projectId, 'get_thread_scaffolds');
    return (res?.thread_scaffolds ?? []).map((s: any) => ({
      id: s.id,
      name: s.name ?? s.id,
      suggested: !!s.suggested,
      scopeFit: s.scope_fit ?? [],
      about: s.about ?? '',
      using: s.using ?? '',
      beats: (s.beats ?? []).map((b: any) => ({
        heading: b.heading ?? '',
        placeholders: b.placeholders ?? [],
      })),
    }));
  } catch {
    return [];
  }
}

function itemsToBbeats(items: any[]) {
  const beats: any[] = [];
  for (const it of items || []) {
    if (!it) continue;
    // Headings are kept as first-class beats now (kind: 'heading') — rendered
    // bold + outdented and editable in <ThreadCard>, excluded from coverage
    // counts. text → covered (solid dot), placeholder → gap (dashed dot).
    const kind: 'heading' | 'text' | 'placeholder' =
      it.kind === 'heading' ? 'heading' : it.kind === 'text' ? 'text' : 'placeholder';
    const covered = kind === 'text';
    beats.push({
      // A ghost insert proposal has no real id; key it off the proposal so it's
      // stable across renders.
      id: it.insert ? `prop-${it.proposal?.id}` : (it.id ?? `b-${beats.length}`),
      text: (it.text ?? '').replace(/^…\s*/, ''),
      ref: kind === 'heading' ? '' : covered ? '' : 'gap',
      words: null,
      covered,
      kind,
      note: null,
      // Pending AI beat proposal (read-merged by get_thread): `{id, text?, kind?}`
      // for a beat_edit; a ghost insert carries `insert:true` + its own proposal.
      proposal: it.proposal || null,
      insert: !!it.insert,
    });
  }
  return beats;
}

function inferTag(source: string | undefined, templateId: string | undefined): string | null {
  if (source === 'user_wishes') return 'main';
  if (source === 'scaffold') return 'structure';
  if (source === 'generated') return 'generated';
  if (templateId) return templateId.replace(/_/g, ' ');
  if (source === 'ai_thread') return 'subplot';
  return null;
}

function fromBackend(t: any, i: number, charColorByName?: (name: string) => string | undefined) {
  const beats = itemsToBbeats(t?.items);
  // Coverage is over real beats only — headings are structure, not progress.
  const realBeats = beats.filter((b: any) => b.kind !== 'heading');
  const covered = realBeats.filter((b: any) => b.covered).length;
  const gaps = realBeats.filter((b: any) => !b.covered).length;
  return {
    id: t?.id ?? `th-${i}`,
    name: t?.title ?? t?.scope?.name ?? 'Untitled thread',
    // Override wins; a character-scoped thread mirrors its character (live); a
    // story/other thread takes the Plot/Theme story colour. (see theme/aspects.ts)
    color: threadColor(t, charColorByName),
    // For the colour picker: the stored override ('' = auto) and the derived
    // default (what it'd be with no override), so it can show selection + reset.
    colorOverride: (t?.color || '').trim(),
    colorDefault: threadColor({ ...t, color: '' }, charColorByName),
    scope: t?.scope ?? null,
    tag: inferTag(t?.source, t?.template_id),
    tagLabel: gaps > 1 ? `${gaps} gaps` : null,
    beats,
    covered,
    gaps,
    total: realBeats.length,
    editedAgo: null,
    meta: t?.source === 'ai_thread' ? 'AI-drafted' : null,
  };
}

export function buildThreadMap(threads: any[], rawThreads: any[], grandOutline: any) {
  if (!grandOutline || !threads.length) return null;

  // Flatten all chapters across acts with their act index
  const allChapters: { actIdx: number; ch: any; flatIdx: number }[] = [];
  for (const [ai, act] of (grandOutline.acts ?? []).entries()) {
    for (const ch of act.chapters ?? []) {
      allChapters.push({ actIdx: ai, ch, flatIdx: allChapters.length });
    }
  }
  if (!allChapters.length) return null;
  // Map raw thread backend IDs (a beat's from_rough) → frontend thread index.
  const threadIds = threads.map((t: any) => t.id);
  const rawIdIdx: Record<string, number> = {};
  for (let i = 0; i < threads.length; i++) {
    const rawId = rawThreads[i]?.id;
    if (rawId) rawIdIdx[rawId] = i;
  }

  // A dot means one thing: a beat from this thread has actually been merged into
  // this scene (beat.from_rough → thread). No phase heuristics, no nominal-owner
  // guesses — the map shows real placements only, so an empty column just means
  // you haven't dropped anything there yet. present=false (dashed) when the merged
  // beat is still a placeholder; a real beat wins over a placeholder.
  function sceneCells(sc: any): (({ present: boolean } | null)[]) {
    const out: ({ present: boolean } | null)[] = threadIds.map(() => null);
    for (const b of sc?.beats || []) {
      if (!b.from_rough) continue;
      const idx = rawIdIdx[b.from_rough];
      if (idx == null) continue;
      const present = b.kind !== 'placeholder';
      if (out[idx] == null || present) out[idx] = { present };
    }
    return out;
  }

  // Chapter dot = roll-up of its scenes' real merges, so a collapsed chapter still
  // shows where you've actually placed beats. Present if any scene holds a real
  // beat for the thread; dashed if only placeholders were merged.
  function chapterCells(ch: any): (({ present: boolean } | null)[]) {
    const out: ({ present: boolean } | null)[] = threadIds.map(() => null);
    for (const sc of ch.scenes ?? []) {
      const scc = sceneCells(sc);
      for (let i = 0; i < scc.length; i++) {
        const cell = scc[i];
        if (!cell) continue;
        if (out[i] == null || cell.present) out[i] = { present: cell.present };
      }
    }
    return out;
  }

  // Build the act→chapter structure with cells transposed per thread
  const acts = (grandOutline.acts ?? []).map((act: any, ai: number) => {
    const actChapters = allChapters.filter((c) => c.actIdx === ai);
    const chapters = actChapters.map((c) => ({
      label: c.ch.text ?? `Ch ${c.flatIdx + 1}`,
      cells: chapterCells(c.ch),
      scenes: (c.ch.scenes ?? []).map((sc: any) => ({
        id: sc.id,
        label: sc.text ?? sc.id,
        cells: sceneCells(sc),
        beats: (sc.beats ?? []).map((b: any) => ({
          id: b.id,
          text: b.text ?? '',
          kind: b.kind ?? 'text',
          from_rough: b.from_rough ?? undefined,
        })),
      })),
    }));
    return {
      label: act.text ?? `Act ${ai + 1}`,
      chapters,
    };
  });
  return { threads: threadIds, acts };
}

export async function placeThreadBeat(
  projectId: string,
  threadId: string,
  itemId: string,
  sceneId: string,
  beatIndex: number = -1,
) {
  return callOp(projectId, 'place_thread_beat', {
    thread_id: threadId,
    item_id: itemId,
    scene_id: sceneId,
    beat_index: beatIndex,
  });
}


export async function deleteThread(projectId: string | undefined, threadId: string) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'delete_plot_thread', { thread_id: threadId });
}

// Create a new scene at the end of a chapter, pre-seeded with the dropped beats
// (each {text, kind?}). Used by the merge page's "new scene" drop zone.
export async function addSceneWithBeats(
  projectId: string | undefined,
  chapterId: string,
  beats: Array<{ text: string; kind?: string }>,
  title?: string,
) {
  if (!projectId) throw new Error('no project');
  const args: any = { chapter_id: chapterId, beats };
  if (title) args.title = title;
  return callOp(projectId, 'add_scene_with_beats', args);
}

// Patch one beat inside a plot thread — its text and/or kind. Route.WRITE → runs
// directly and returns the updated beat (no proposal). The backend applies only
// the fields sent (omitting `text` preserves it; omitting `kind` preserves it),
// so a kind-only change (the Tab cycle) never touches the text.
export async function updateThreadBeat(
  projectId: string | undefined,
  threadId: string,
  beatId: string,
  text?: string,
  kind?: string,
) {
  if (!projectId) throw new Error('no project');
  const args: any = { thread_id: threadId, beat_id: beatId };
  if (text !== undefined) args.text = text;
  if (kind !== undefined) args.kind = kind;
  return callOp(projectId, 'update_thread_beat', args);
}

// Insert a beat into a plot thread, right after `afterBeatId` when given so the
// server order matches what the user sees. Returns the dispatch result whose
// `beat.id` is the new server-side id. Route.WRITE → runs directly.
export async function addThreadBeat(
  projectId: string | undefined,
  threadId: string,
  text: string,
  afterBeatId?: string | null,
  kind?: string,
) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'add_thread_beat', {
    thread_id: threadId,
    text,
    after_beat_id: afterBeatId ?? undefined,
    kind: kind ?? undefined,
  });
}

// ---- beat proposals (Night Eyes inserts/edits → author reviews green) ----
// Accept applies the proposed beat (edit existing / create insert) + closes it;
// reject drops it; update_proposed edits the pending value (edit-before-accept).
// Accept/reject go through the GENERIC proposal caps so every surface (toast/chat)
// dismisses in lockstep.
export async function acceptBeat(projectId: string | undefined, proposalId: any) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'accept_proposal', { proposal_id: String(proposalId) }, 'Threads');
}
export async function rejectBeat(projectId: string | undefined, proposalId: any) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'reject_proposal', { proposal_id: String(proposalId) }, 'Threads');
}
export async function updateProposedBeat(
  projectId: string | undefined, proposalId: any, text?: string, kind?: string,
) {
  if (!projectId) throw new Error('no project');
  const args: any = { proposal_id: String(proposalId) };
  if (text !== undefined) args.text = text;
  if (kind !== undefined) args.kind = kind;
  return callOp(projectId, 'update_proposed_beat', args, 'Threads');
}

// Delete a persisted beat from a plot thread. Route.WRITE → runs directly.
export async function deleteThreadBeat(
  projectId: string | undefined,
  threadId: string,
  beatId: string,
) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'delete_thread_beat', {
    thread_id: threadId,
    beat_id: beatId,
  });
}

// Save a thread's beat order after a drag. `beatIds` is every saved beat of the
// thread, in the new order. Returns `{beat_ids}`, the order the server saved.
// A 409 means the thread changed elsewhere since it loaded. Route.WRITE.
export async function reorderThreadBeats(
  projectId: string | undefined,
  threadId: string,
  beatIds: string[],
) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'reorder_thread_beats', { thread_id: threadId, beat_ids: beatIds });
}

// Create a storyline from the NewThreadModal draft. The backend cap takes
// `name` (+ scope_type/scope_name) and an optional `beats` list — each beat a
// {text, kind} dict (kind: text/placeholder). The modal calls its field
// `title`; the finalized beats go up in the same create call so the thread is
// born with its shape. Colour is auto-assigned server-side (a distinct colour
// per new thread; first thread of a character mirrors it) — see
// outline.store.pick_thread_color.
export async function createPlotThread(
  projectId: string | undefined,
  draft: {
    title: string;
    scopeType?: string;
    scopeName?: string;
    color?: string;
    beats?: { text: string; kind: string }[];
  },
) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'add_plot_thread', {
    name: draft.title,
    scope_type: draft.scopeType || undefined,
    scope_name: draft.scopeName || undefined,
    color: draft.color || undefined,
    beats: draft.beats && draft.beats.length ? draft.beats : undefined,
  });
}

// Edit a storyline's name and/or scope. Pass only what changed.
export async function updatePlotThread(
  projectId: string | undefined,
  threadId: string,
  patch: { name?: string; scopeType?: string; scopeName?: string; color?: string },
) {
  if (!projectId) throw new Error('no project');
  const args: any = { thread_id: threadId };
  if (patch.name !== undefined) args.name = patch.name;
  if (patch.scopeType !== undefined) args.scope_type = patch.scopeType;
  if (patch.scopeName !== undefined) args.scope_name = patch.scopeName;
  if ((patch as any).color !== undefined) args.color = (patch as any).color;
  return callOp(projectId, 'update_plot_thread', args);
}

export async function loadThreads(projectId: string | undefined) {
  if (!projectId) return EMPTY_THREADS;

  const safe = (p: Promise<any>) => p.catch(() => ({}));
  // The threads (with their beats) throw on failure so the page shows "Couldn't
  // load", not an empty board or threads with no beats (SA-132, SA-77).
  // Outline placement + character colours only decorate it, so those may fail.
  const [threadsRes, outlineRes, charsRes] = await Promise.all([
    callOp(projectId, 'get_threads_with_beats'),
    safe(getLeanGrandOutline(projectId)),
    safe(callOp(projectId, 'get_characters')),
  ]);
  // name → character colour, so a character-scoped thread mirrors its character.
  const charColors = new Map<string, string>();
  for (const c of charsRes.characters ?? []) {
    if (c?.name && c?.color) charColors.set(String(c.name).toLowerCase(), c.color);
  }
  const charColorByName = (name: string) => charColors.get(String(name).toLowerCase());
  // get_threads_with_beats returns every thread in the get_thread shape, in ONE
  // read (SA-88 — this used to be one get_thread call per thread). Fold each into
  // the raw shape fromBackend expects (title/items/source/template_id).
  const rawThreads = (threadsRes.threads ?? []).map((d: any) => ({
    id: d.thread_id,
    title: d.name,
    scope: d.scope,
    color: d.color || '',
    source: d.source,
    template_id: d.template_id,
    // Each beat is the SAME triad get_character_full uses:
    // {actual_value, proposal:<id>, proposed_value, proposed_kind}. Fold it back
    // into the editor's beat shape ({text, proposal:{id,text,kind}}) at this
    // boundary so useThreadBeats / BeatList stay unchanged.
    items: (d.beats ?? []).map((b: any) => ({
      id: b.id,
      text: b.actual_value ?? '',
      kind: b.kind,
      proposal: b.proposal != null
        ? { id: b.proposal, text: b.proposed_value ?? '', kind: b.proposed_kind ?? b.kind }
        : null,
      insert: b.insert,
    })),
  }));
  const threads = rawThreads.map((t: any, i: number) => fromBackend(t, i, charColorByName));
  const threadMap = buildThreadMap(threads, rawThreads, outlineRes.grand_outline);
  return { threads, threadMap, _rawThreads: rawThreads };
}

export async function loadReadiness(projectId: string | undefined) {
  if (!projectId) return { braindumps: 0, characters: 0 };
  const safe = (p: Promise<any>) => p.catch(() => ({}));
  const [braindumpsRes, charsRes] = await Promise.all([
    safe(callOp(projectId, 'get_braindumps')),
    safe(callOp(projectId, 'get_characters')),
  ]);
  return {
    braindumps: (braindumpsRes.braindumps ?? []).length,
    characters: (charsRes.characters ?? []).length,
  };
}

export async function extractUserPlot(projectId: string | undefined) {
  if (!projectId) throw new Error('no project');
  // Route.PROPOSE — returns `{__proposed, proposalId}`. The gateway pushes
  // a row into useProposalStore; plot_threads auto-refetches on accept via
  // staleness invalidation.
  return callOp(projectId, 'run_user_wishes_rough', {}, 'plot-threads');
}

export async function generateThread(
  projectId: string | undefined,
  /** The braindumps the thread centres on (selected + freshly typed). */
  focus: string[],
  /** Every braindump in the project, so the AI keeps the whole story in view. */
  all: string[] = focus,
  /** Optional scope to attach to the generated thread + its proposal — e.g. the
   *  character page's "smart thread" passes { type: 'character', name }. Omitted
   *  → the engine defaults to a whole-story thread. */
  scope?: { type: string; name: string } | null,
) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'generate_thread', {
    braindumps: focus,
    all_braindumps: all,
    scope_type: scope?.type || undefined,
    scope_name: scope?.name || undefined,
  });
}

export async function loadBraindumps(projectId: string | undefined) {
  if (!projectId) return [];
  const safe = (p: Promise<any>) => p.catch(() => ({}));
  const res = await safe(callOp(projectId, 'get_braindumps'));
  return (res.braindumps ?? []).map((bd: any) => ({
    id: bd.id,
    body: (bd.content || bd.title || '').trim(),
  })).filter((bd: any) => bd.body.length > 0);
}
