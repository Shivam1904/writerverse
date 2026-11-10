/**
 * Pure outline-tree layer — no React, no network.
 *
 * The grand outline arrives from the backend as a NAMED-ARRAY tree
 * (`acts[].chapters[].scenes[].beats[]`). This module normalizes that into a
 * GENERIC, depth-agnostic node tree so any consumer (the grand-outline page,
 * the chapter rail) can render arbitrary hierarchies:
 *   - act → chapter → scene → beat
 *   - heading → chapter → scene → beat
 *   - book → act → chapter → scene → beat
 * The only place that knows the named-array shape is `normalize()`. When the
 * backend grows new levels (book/heading/part) — by named array OR by a generic
 * `{ type, children }` shape — the renderers need no change.
 *
 * Mutation helpers (insert/patch/move/remove) still operate on the RAW
 * named-array grand outline (the wire/state format), preserving the proven
 * optimistic logic lifted from OutlinePage.
 */

export type OutlineLevel =
  | 'book' | 'act' | 'heading' | 'part' | 'section'
  | 'chapter' | 'scene' | 'beat' | string;

export interface OutlineNode {
  id: string;
  level: OutlineLevel;
  label: string;
  /** beats only: 'text' | 'placeholder' */
  kind?: string;
  children: OutlineNode[];
  /** original backend node — carries words, thread, from_rough, etc. */
  raw: any;
}

/* ── normalization (named-array → generic) ── */

// Child array key for each container level, named-array shape.
const CHILD_KEY: Record<string, string> = {
  book: 'acts',
  act: 'chapters',
  heading: 'chapters',
  part: 'chapters',
  section: 'chapters',
  chapter: 'scenes',
  scene: 'beats',
};

// The level a child sits at, inferred from its parent (named-array ladder).
const NEXT_LEVEL: Record<string, OutlineLevel> = {
  book: 'act',
  act: 'chapter',
  heading: 'chapter',
  part: 'chapter',
  section: 'chapter',
  chapter: 'scene',
  scene: 'beat',
};

// Top-level array on the grand outline → the level it implies. First match wins.
const TOP_KEYS: [string, OutlineLevel][] = [
  ['books', 'book'],
  ['acts', 'act'],
  ['headings', 'heading'],
  ['parts', 'part'],
  ['sections', 'section'],
  ['chapters', 'chapter'],
  ['scenes', 'scene'],
];

function childRawList(raw: any, level: string): any[] {
  const key = CHILD_KEY[level];
  if (key && Array.isArray(raw?.[key])) return raw[key];
  if (Array.isArray(raw?.children)) return raw.children; // future generic shape
  return [];
}

function levelOf(child: any, parentLevel: string): OutlineLevel {
  // explicit type/level wins (future generic shape), else infer from the ladder
  return child?.type ?? child?.level ?? NEXT_LEVEL[parentLevel] ?? 'beat';
}

function toNode(raw: any, level: string): OutlineNode {
  return {
    id: String(raw?.id ?? ''),
    level,
    label: raw?.text ?? raw?.title ?? raw?.label ?? '',
    kind: raw?.kind,
    raw,
    children: childRawList(raw, level).map((c) => toNode(c, levelOf(c, level))),
  };
}

export function normalize(grandOutline: any): OutlineNode[] {
  if (!grandOutline) return [];
  for (const [key, level] of TOP_KEYS) {
    if (Array.isArray(grandOutline[key])) {
      return grandOutline[key].map((raw: any) => toNode(raw, level));
    }
  }
  if (Array.isArray(grandOutline.children)) {
    return grandOutline.children.map((c: any) => toNode(c, levelOf(c, 'book')));
  }
  return [];
}

/* ── role mapping (lets the UI style by ROLE, not exact level name) ── */

export type LevelRole = 'section' | 'chapter' | 'scene' | 'beat' | 'generic';

export function levelRole(level: OutlineLevel): LevelRole {
  if (['book', 'act', 'heading', 'part', 'section'].includes(level)) return 'section';
  if (level === 'chapter') return 'chapter';
  if (level === 'scene') return 'scene';
  if (level === 'beat') return 'beat';
  return 'generic';
}

/* ── derivations ── */

/** Flat list of the outline's chapters in document order, pruned to the thread
 *  filter (a chapter survives if it owns a beat from a selected thread — the same
 *  survival rule the outline page's `pruneOutline` uses). The outline page's
 *  margin overlay docks one entry per VISIBLE chapter from this. */
export function outlineChapters(
  grandOutline: any,
  filter?: Set<string>,
): { id: string; n: number; text: string; actId: string }[] {
  const filtering = !!filter && filter.size > 0;
  const out: { id: string; n: number; text: string; actId: string }[] = [];
  for (const act of grandOutline?.acts ?? []) {
    (act.chapters ?? []).forEach((ch: any) => {
      if (filtering) {
        const hit = (ch.scenes ?? []).some((sc: any) =>
          (sc.beats ?? []).some((b: any) => b.from_rough && filter!.has(String(b.from_rough))));
        if (!hit) return;
      }
      // One numbering for the whole book, counting the chapters shown, the same
      // as the chapter chips in FlatOutline (a per-act count put "Ch 1" next to ch4).
      out.push({ id: ch.id, n: ch.n ?? out.length + 1, text: ch.text ?? '', actId: act.id });
    });
  }
  return out;
}

export function isEmptyScene(n: OutlineNode): boolean {
  if (n.level !== 'scene') return false;
  const hasText = n.children.some((b) => b.kind === 'text');
  return !hasText && (n.raw?.words ?? 0) === 0;
}

export interface Rollup { scenes: number; words: number; empty: number; beats: number }

export function rollup(node: OutlineNode): Rollup {
  let scenes = 0, words = 0, empty = 0, beats = 0;
  const walk = (n: OutlineNode) => {
    if (n.level === 'scene') {
      scenes++;
      words += n.raw?.words ?? 0;
      if (isEmptyScene(n)) empty++;
    }
    if (n.level === 'beat') beats++;
    n.children.forEach(walk);
  };
  walk(node);
  return { scenes, words, empty, beats };
}

/** Path of nodes from a root down to `id` (inclusive), or null. */
export function findPath(nodes: OutlineNode[], id: string): OutlineNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return [n];
    const sub = findPath(n.children, id);
    if (sub) return [n, ...sub];
  }
  return null;
}

/* ── raw mutation helpers (named-array shape) ──
 * Lifted verbatim from OutlinePage so the optimistic update logic is shared by
 * every consumer. They assume the act→chapter→scene→beat ladder (today's wire
 * shape); extend alongside the backend when new levels gain CRUD. */

function insertAt(arr: any[], item: any, atIndex?: number) {
  if (atIndex != null && atIndex >= 0 && atIndex <= arr.length) arr.splice(atIndex, 0, item);
  else arr.push(item);
}

export function insertItem(go: any, itemType: string, parentId: string | undefined, item: any, atIndex?: number) {
  if (itemType === 'act') { insertAt(go.acts ??= [], item, atIndex); return; }
  for (const act of go.acts || []) {
    if (itemType === 'chapter' && act.id === parentId) { insertAt(act.chapters ??= [], item, atIndex); return; }
    for (const ch of act.chapters || []) {
      if (itemType === 'scene' && ch.id === parentId) { insertAt(ch.scenes ??= [], item, atIndex); return; }
      for (const sc of ch.scenes || []) {
        if (itemType === 'beat' && sc.id === parentId) { insertAt(sc.beats ??= [], item, atIndex); return; }
      }
    }
  }
}

export function patchItem(go: any, _itemType: string, itemId: string, fields: any) {
  const walk = (list: any[]): boolean => {
    for (const x of list) {
      if (x.id === itemId) { Object.assign(x, fields); return true; }
      if (walk(x.chapters || [])) return true;
      if (walk(x.scenes || [])) return true;
      if (walk(x.beats || [])) return true;
    }
    return false;
  };
  walk(go.acts || []);
}

export function moveItem(go: any, itemType: string, itemId: string, direction: -1 | 1): number | null {
  const findSiblings = (): any[] | null => {
    if (itemType === 'act') return go.acts;
    for (const act of go.acts || []) {
      for (const ch of act.chapters || []) {
        for (const sc of ch.scenes || []) {
          if (itemType === 'beat' && (sc.beats || []).some((b: any) => b.id === itemId)) return sc.beats;
        }
        if (itemType === 'scene' && (ch.scenes || []).some((s: any) => s.id === itemId)) return ch.scenes;
      }
      if (itemType === 'chapter' && (act.chapters || []).some((c: any) => c.id === itemId)) return act.chapters;
    }
    return null;
  };

  const siblings = findSiblings();
  if (!siblings) return null;
  const idx = siblings.findIndex((x: any) => x.id === itemId);
  if (idx < 0) return null;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= siblings.length) return null;
  const [item] = siblings.splice(idx, 1);
  siblings.splice(newIdx, 0, item);
  return newIdx;
}

/**
 * Move an item to an ABSOLUTE index among its siblings (drag-to-reorder), vs.
 * `moveItem`'s single ±1 step. Returns the clamped destination index, or null if
 * the item isn't found / didn't move. `toIndex` is interpreted against the list
 * BEFORE removal (i.e. "drop before the current item at toIndex"); we adjust for
 * the removed slot so a downward move lands where the cursor was.
 */
export function moveItemTo(go: any, itemType: string, itemId: string, toIndex: number): number | null {
  const findSiblings = (): any[] | null => {
    if (itemType === 'act') return go.acts;
    for (const act of go.acts || []) {
      for (const ch of act.chapters || []) {
        for (const sc of ch.scenes || []) {
          if (itemType === 'beat' && (sc.beats || []).some((b: any) => b.id === itemId)) return sc.beats;
        }
        if (itemType === 'scene' && (ch.scenes || []).some((s: any) => s.id === itemId)) return ch.scenes;
      }
      if (itemType === 'chapter' && (act.chapters || []).some((c: any) => c.id === itemId)) return act.chapters;
    }
    return null;
  };

  const siblings = findSiblings();
  if (!siblings) return null;
  const idx = siblings.findIndex((x: any) => x.id === itemId);
  if (idx < 0) return null;
  let dest = toIndex < 0 || toIndex > siblings.length ? siblings.length : toIndex;
  if (dest > idx) dest -= 1; // account for the slot we're about to vacate
  if (dest === idx) return null;
  const [item] = siblings.splice(idx, 1);
  siblings.splice(dest, 0, item);
  return dest;
}

/** What deleting one outline item would take with it. */
export interface SubtreeContents {
  chapters: number;
  scenes: number;
  beats: number;
  /** Words of written prose across the subtree's scenes. */
  words: number;
}

/**
 * Count what sits inside the item at (itemType, itemId): its child chapters,
 * scenes and beats, and the words of prose in its scenes. A scene's `words` is
 * the word count of its TipTap content (the backend sets it on every
 * save_scene_content). Returns null when the item isn't found.
 */
export function subtreeContents(go: any, itemType: string, itemId: string): SubtreeContents | null {
  const totals: SubtreeContents = { chapters: 0, scenes: 0, beats: 0, words: 0 };
  const insideScene = (sc: any) => {
    totals.beats += (sc.beats || []).length;
    totals.words += sc.words ?? 0;
  };
  const insideChapter = (ch: any) => {
    for (const sc of ch.scenes || []) { totals.scenes += 1; insideScene(sc); }
  };
  const insideAct = (act: any) => {
    for (const ch of act.chapters || []) { totals.chapters += 1; insideChapter(ch); }
  };
  for (const act of go?.acts || []) {
    if (itemType === 'act' && act.id === itemId) { insideAct(act); return totals; }
    for (const ch of act.chapters || []) {
      if (itemType === 'chapter' && ch.id === itemId) { insideChapter(ch); return totals; }
      for (const sc of ch.scenes || []) {
        if (itemType === 'scene' && sc.id === itemId) { insideScene(sc); return totals; }
      }
    }
  }
  return null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The confirmation text for deleting an act/chapter/scene, or null when the
 * item is empty and can go without asking. Outlining happens before prose
 * exists, so structure alone (chapters, scenes, beats) is worth a prompt —
 * not just written words.
 */
export function deleteConfirmMessage(itemType: string, contents: SubtreeContents | null): string | null {
  if (!contents) return null;
  const parts = [
    contents.chapters && plural(contents.chapters, 'chapter'),
    contents.scenes && plural(contents.scenes, 'scene'),
    contents.beats && plural(contents.beats, 'beat'),
    contents.words && `${plural(contents.words, 'word')} of prose`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `Delete this ${itemType}? It contains ${parts.join(', ')}. This can't be undone.`;
}

export function removeItem(go: any, itemType: string, itemId: string) {
  if (itemType === 'act') { go.acts = (go.acts || []).filter((a: any) => a.id !== itemId); return; }
  for (const act of go.acts || []) {
    if (itemType === 'chapter') act.chapters = (act.chapters || []).filter((c: any) => c.id !== itemId);
    for (const ch of act.chapters || []) {
      if (itemType === 'scene') ch.scenes = (ch.scenes || []).filter((s: any) => s.id !== itemId);
      for (const sc of ch.scenes || []) {
        if (itemType === 'beat') sc.beats = (sc.beats || []).filter((b: any) => b.id !== itemId);
      }
    }
  }
}
