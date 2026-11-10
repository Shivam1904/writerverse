import { useCallback, useContext, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus, PenLine } from 'lucide-react';
import { BeatField, BeatMarker, Button } from '../../ui';
import { stepOutlineField, useBeatEditSignal } from '../../components/beatFocus';
import {
  OutlineCtx, useBeatEdit, Caret, EditableHeading,
  IND_CHAPTER, IND_SCENE, IND_BEATS,
  type OutlineCtxValue, type ThreadVisual,
} from './OutlineSceneBlock';
import { MarginBlock } from '../margin';
import { ChapterMarginEntry } from './OutlineMargin';
import type { OutlineOps } from './useOutlineModel';
import './outlineSpine.css';
import '../../pages/write/v2/chaptersV2.css';

/**
 * FlatOutline — the grand outline rendered as a single flat list of rows
 * (acts / chapters / scenes / beats) with collapse/expand on every level,
 * including beat-kind=heading groups. Sits inside an <OutlineDnd> ancestor.
 *
 * Navigation: BeatField's boundary-arrow detection calls stepOutlineField, so
 * ArrowDown at the end of any beat hops to the next [data-ol-field] row
 * (title or beat) in DOM order, crossing scene and chapter boundaries.
 *
 * Collapse: each act / chapter / scene / beat-heading carries an id in the
 * `collapsed` Set; its descendants carry that id in `collapsesUnder` and are
 * filtered out of the visible list. Hidden rows aren't in the DOM, so
 * stepOutlineField and dnd-kit naturally skip them.
 *
 * Drag-to-reorder beats: OutlineDnd handles outline-beat drags within a scene
 * (cross-scene is a later pass). Each beat row is both draggable and droppable.
 */

// ── row shapes ─────────────────────────────────────────────────────────────

// `move`: where the row sits among its siblings, for the ↑ ↓ buttons (null while
// a thread filter hides siblings, so a step would jump over hidden rows).
type Move        = { first: boolean; last: boolean } | null;
type ActRow      = { type: 'act';         id: string; text: string; chapterCount: number; move: Move; collapsesUnder: string[] };
type ChapRow     = { type: 'chapter';     id: string; text: string; n: number; actId: string; move: Move; collapsesUnder: string[] };
type SceneRow    = { type: 'scene';       id: string; text: string; n: number; chapId: string; beatCount: number; move: Move; collapsesUnder: string[] };
type BeatRow_    = { type: 'beat';        id: string; text: string; kind: string; sceneId: string; beat: any; collapsesUnder: string[] };
type AddChapRow  = { type: 'add-chapter'; id: string; actId: string; collapsesUnder: string[] };
type AddSceneRow = { type: 'add-scene';   id: string; chapId: string; collapsesUnder: string[] };
type OutlineRow  = ActRow | ChapRow | SceneRow | BeatRow_ | AddChapRow | AddSceneRow;

// ── flatten ────────────────────────────────────────────────────────────────

function flattenOutline(outline: any, movable = true): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const move = (i: number, n: number): Move => (movable ? { first: i === 0, last: i === n - 1 } : null);
  const acts: any[] = outline?.acts ?? [];
  // Chapter numbers are GLOBAL across acts (one numbering for the whole book;
  // the old per-act chip reset made "ch1 · Chapter 5" rows).
  let chNo = 0;
  acts.forEach((act: any, ai: number) => {
    const chapters = act.chapters ?? [];
    rows.push({ type: 'act', id: act.id, text: act.text ?? '', chapterCount: chapters.length, move: move(ai, acts.length), collapsesUnder: [] });
    chapters.forEach((ch: any, ci: number) => {
      chNo += 1;
      rows.push({ type: 'chapter', id: ch.id, text: ch.text ?? '', n: chNo, actId: act.id, move: move(ci, chapters.length), collapsesUnder: [act.id] });
      const scenes: any[] = ch.scenes ?? [];
      scenes.forEach((sc: any, si: number) => {
        const beats: any[] = sc.beats ?? [];
        rows.push({ type: 'scene', id: sc.id, text: sc.text ?? '', n: si + 1, chapId: ch.id, beatCount: beats.length, move: move(si, scenes.length), collapsesUnder: [act.id, ch.id] });
        let curHeadingId: string | null = null;
        for (const b of beats) {
          if (b.kind === 'heading') curHeadingId = b.id;
          const cu = [act.id, ch.id, sc.id];
          if (curHeadingId && b.kind !== 'heading') cu.push(curHeadingId);
          rows.push({ type: 'beat', id: b.id, text: b.text ?? '', kind: b.kind ?? 'text', sceneId: sc.id, beat: b, collapsesUnder: cu });
        }
      });
      rows.push({ type: 'add-scene', id: `add-scene:${ch.id}`, chapId: ch.id, collapsesUnder: [act.id, ch.id] });
    });
    rows.push({ type: 'add-chapter', id: `add-chapter:${act.id}`, actId: act.id, collapsesUnder: [act.id] });
  });
  return rows;
}

function getVisible(rows: OutlineRow[], collapsed: Set<string>): OutlineRow[] {
  if (!collapsed.size) return rows;
  return rows.filter(r => !r.collapsesUnder.some(id => collapsed.has(id)));
}

// Prune the outline to scenes/chapters/acts that hold at least one beat owned by
// a selected thread. Beats are filtered to the selection; a scene with no
// surviving beat (and its now-empty chapter / act) drops out. Returns the tree
// unchanged when no filter is active.
function pruneOutline(outline: any, filter: Set<string>): any {
  if (!outline || !filter.size) return outline;
  const acts = (outline.acts ?? [])
    .map((act: any) => {
      const chapters = (act.chapters ?? [])
        .map((ch: any) => {
          const scenes = (ch.scenes ?? [])
            .map((sc: any) => ({
              ...sc,
              beats: (sc.beats ?? []).filter((b: any) => b.from_rough && filter.has(String(b.from_rough))),
            }))
            .filter((sc: any) => sc.beats.length > 0);
          return { ...ch, scenes };
        })
        .filter((ch: any) => ch.scenes.length > 0);
      return { ...act, chapters };
    })
    .filter((act: any) => act.chapters.length > 0);
  return { ...outline, acts };
}

// ── beat kind cycling ──────────────────────────────────────────────────────

const KIND_CYCLE: Record<string, string> = { text: 'placeholder', placeholder: 'heading', heading: 'text' };
const nextKind = (k: string) => KIND_CYCLE[k] ?? 'text';

// ── thread visuals ─────────────────────────────────────────────────────────
// Build a `from_rough → ThreadVisual` resolver from the project's threads so a
// beat's square marker carries its owning thread's colour (same mapping the
// merge outline uses). Falls back to a no-colour stub when threads are absent.

const noThread: ThreadVisual = { color: undefined, lane: 0, active: false, isNew: false };
const noNumFor = () => null;

function makeThreadFor(threads: ThreadSummary[]): (fromRough?: string) => ThreadVisual {
  const byId = new Map(threads.map((t) => [String(t.id), t.color]));
  return (fromRough?: string) => {
    const color = fromRough ? byId.get(String(fromRough)) : undefined;
    return color ? { color, lane: 0, active: false, isNew: false } : noThread;
  };
}

interface ThreadSummary { id: string; name: string; color: string }

// very subtle scene wash (on hover, or while a beat inside it is focused);
// chapter-focus is a touch stronger so the parent heading reads as "active".
const SCENE_HILITE_BG = 'color-mix(in srgb, var(--ink) 2.5%, transparent)';
const SCENE_FOCUS_BG = 'color-mix(in srgb, var(--ink) 5%, transparent)';

// Hover-gated action buttons: fade in only when their subtree is "hot" (the row,
// or any descendant, is hovered — resolved in the parent via the chap→act map).
// The .osp-* classes already carry an opacity transition, so the fade animates.
//
// Opacity only — the buttons stay clickable while faded (SA-73). Each button
// sits inside the row whose onMouseEnter makes it hot, so a mouse is always
// over a visible button by the time it can click. Turning pointer-events off
// while faded made the row's wrapper <span> take the first click instead (a
// tap on touch, a click-automation hit test), so the × never landed.
const revealStyle = (hot: boolean, shown: number): CSSProperties => ({
  opacity: hot ? shown : 0,
});

// ↑ ↓ — move an act / chapter / scene one step among its siblings (same
// parent only). ops.reorder moves it on screen at once and undoes on a failed save.
function MoveButtons({ level, id, move, hot }: { level: 'act' | 'chapter' | 'scene'; id: string; move: Move; hot?: boolean }) {
  const { ops } = useContext(OutlineCtx);
  if (!ops || !move) return null;
  return (
    <>
      <button type="button" className="osp-add" title={`Move ${level} up`} aria-label={`Move ${level} up`}
        disabled={move.first} style={revealStyle(!!hot, move.first ? 0.25 : 0.7)}
        onClick={() => ops.reorder(level, id, -1)}>↑</button>
      <button type="button" className="osp-add" title={`Move ${level} down`} aria-label={`Move ${level} down`}
        disabled={move.last} style={revealStyle(!!hot, move.last ? 0.25 : 0.7)}
        onClick={() => ops.reorder(level, id, 1)}>↓</button>
    </>
  );
}

// ── act heading row ────────────────────────────────────────────────────────

function ActHeading({ row, open, onToggle, hot, onHover }: { row: ActRow; open: boolean; onToggle: () => void; hot?: boolean; onHover?: () => void }) {
  const { ops } = useContext(OutlineCtx);
  return (
    <div className="cm-act is-current" style={{ marginBottom: 0 }} onMouseEnter={onHover}>
      <div
        className="cm-act-row"
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={-1}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(); } }}
      >
        <Caret open={open} onToggle={onToggle} />
        <EditableHeading
          titleClass="cm-act-title" value={row.text} placeholder="untitled act"
          kind="act" itemId={row.id} chapId={row.id}
          onSave={(t) => ops?.update('act', row.id, { text: t })}
          onEnter={() => ops?.addChapter(row.id)}
        />
        <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <b>{row.chapterCount} ch</b>
          <MoveButtons level="act" id={row.id} move={row.move} hot={hot} />
          {ops && (
            <button type="button" className="osp-add" title="Add chapter" style={revealStyle(!!hot, 0.7)}
              onClick={() => ops.addChapter(row.id)}>+ chapter</button>
          )}
          {ops && (
            <button type="button" className="osp-del osp-del-node" title="Delete act" style={revealStyle(!!hot, 0.6)}
              onClick={() => ops.remove('act', row.id)}>×</button>
          )}
        </span>
      </div>
    </div>
  );
}

// ── chapter heading row ────────────────────────────────────────────────────

function ChapHeading({ row, open, onToggle, focused, onOpenChapter, hot, onHover }: { row: ChapRow; open: boolean; onToggle: () => void; focused?: boolean; onOpenChapter?: (chapId: string) => void; hot?: boolean; onHover?: () => void }) {
  const { ops } = useContext(OutlineCtx);
  return (
    <div className="cm-chapter" onMouseEnter={onHover}>
      <div
        className="cm-osc-head"
        style={{ paddingLeft: IND_CHAPTER, cursor: 'pointer', background: focused ? SCENE_FOCUS_BG : undefined }}
        role="button"
        tabIndex={-1}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(); } }}
      >
        <Caret open={open} onToggle={onToggle} />
        <span className="cm-osc-num">ch{row.n}</span>
        <EditableHeading
          titleClass="cm-chapter-title" value={row.text} placeholder="untitled chapter"
          kind="chapter" itemId={row.id} chapId={row.id}
          titleStyle={focused ? { fontWeight: 800, color: 'var(--ink)' } : undefined}
          onSave={(t) => ops?.update('chapter', row.id, { text: t })}
          onEnter={() => ops?.add('scene', row.id)}
        />
        <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {onOpenChapter && (
            <Button
              variant="ghost"
              size="icon-sm"
              className={`text-muted-foreground transition-opacity ${hot ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              title="Open this chapter in the manuscript"
              aria-label="Open this chapter in the manuscript"
              onClick={() => onOpenChapter(row.id)}
            >
              <PenLine size={13} />
            </Button>
          )}
          <MoveButtons level="chapter" id={row.id} move={row.move} hot={hot} />
          {ops && (
            <button type="button" className="osp-add" title="Add scene" style={revealStyle(!!hot, 0.7)}
              onClick={() => ops.add('scene', row.id)}>+ scene</button>
          )}
          {ops && (
            <button type="button" className="osp-del osp-del-node" title="Delete chapter" style={revealStyle(!!hot, 0.6)}
              onClick={() => ops.remove('chapter', row.id)}>×</button>
          )}
        </span>
      </div>
    </div>
  );
}

// ── scene heading row ──────────────────────────────────────────────────────

function SceneHeading({ row, open, onToggle, hot }: { row: SceneRow; open: boolean; onToggle: () => void; hot?: boolean }) {
  const { ops, edit } = useContext(OutlineCtx);
  return (
    <div className="cm-osc" style={{ marginTop: 2 }}>
      <div
        className="cm-osc-head"
        style={{ paddingLeft: IND_SCENE, cursor: 'pointer' }}
        role="button"
        tabIndex={-1}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(); } }}
      >
        <Caret open={open} onToggle={onToggle} />
        <span className="cm-osc-num">sc{row.n}</span>
        <EditableHeading
          titleClass="cm-osc-title" value={row.text} placeholder="untitled scene"
          kind="scene" itemId={row.id} chapId={row.chapId} sceneId={row.id}
          onSave={(t) => ops?.update('scene', row.id, { text: t })}
          onEnter={() => edit.addBeatAt(row.id, 0)}
        />
        <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.beatCount > 0 && <span className="cm-osc-count">{row.beatCount}</span>}
          <MoveButtons level="scene" id={row.id} move={row.move} hot={hot} />
          {ops && (
            <button type="button" className="osp-del osp-del-node" title="Delete scene" style={revealStyle(!!hot, 0.6)}
              onClick={() => ops.remove('scene', row.id)}>×</button>
          )}
        </span>
      </div>
    </div>
  );
}

// ── beat row ───────────────────────────────────────────────────────────────

function FlatBeatRow({
  row, index, siblingIds,
}: {
  row: BeatRow_;
  index: number;
  siblingIds: string[];
}) {
  const { ops, edit, threadFor } = useContext(OutlineCtx);
  const isEditing = edit.editingId === row.id;
  // A green merge proposal (read-merged ghost): always-on editable field + ✓/✗,
  // never draggable (nothing committed to reorder yet). Same kit CSS as beats.
  const isProposed = !!row.beat?.proposal;
  const draggable = !isEditing && !isProposed;
  const threadColor = threadFor?.(row.beat?.from_rough)?.color;
  const written = !!row.beat?.written;

  const drag = useDraggable({
    id: `ospbeat:${row.id}`,
    data: { type: 'outline-beat', sceneId: row.sceneId, beatId: row.id, index, label: row.text },
    disabled: !draggable,
  });
  const drop = useDroppable({
    id: `ospdrop:${row.id}`,
    data: { type: 'outline-beat', sceneId: row.sceneId, index },
  });
  const setNode = (node: any) => { drag.setNodeRef(node); drop.setNodeRef(node); };
  const neighbor = () => siblingIds[index - 1] ?? siblingIds[index + 1];

  return (
    <div className="osp-beat-slot" style={{ paddingLeft: IND_BEATS, position: 'relative' }}>
      {drop.isOver && <span className="osp-insert" />}
      <div
        ref={setNode}
        className={`kit-beat-row kit-beat-row--${row.kind}`}
        style={isProposed ? { backgroundColor: 'color-mix(in srgb, var(--asp-proposals) 8%, transparent)' } : undefined}
        data-ol-field=""
        data-beat-row=""
        data-beat-key={row.id}
        onClick={isProposed || isEditing ? undefined : () => edit.open(row.beat)}
        {...(draggable ? drag.listeners : {})}
        {...(draggable ? drag.attributes : {})}
      >
        {/* square marker (outline side); a check rides it once the beat is
            marked written into the chapter prose (checking is done from the scene
            margin). A written beat reads as a plain text square — its check is the
            distinction now, so placeholder/heading shapes flatten to text. Here on
            the outline the check is clickable to UNMARK; you can't mark from here. */}
        {written ? (
          <button
            type="button"
            style={{ gridColumn: 2, justifySelf: 'center', marginTop: 4, cursor: 'pointer', padding: 0, border: 'none', background: 'none', display: 'inline-flex' }}
            title="Written into the chapter — click to unmark (re-mark it from the scene margin)"
            onClick={(e) => { e.stopPropagation(); ops?.update('beat', row.id, { written: false }); }}
          >
            <BeatMarker kind="text" form="square" content="check" color={threadColor} size={14} />
          </button>
        ) : (
          <span
            style={{ gridColumn: 2, justifySelf: 'center', marginTop: 4 }}
            title="Not yet written — mark it written from the scene margin"
          >
            <BeatMarker kind={row.kind as any} form="square" content="none" color={threadColor} size={14} />
          </span>
        )}

        {isProposed ? (
          /* green proposal: always-on editable field routed into the proposal */
          <BeatField
            value={row.text}
            className={`kit-beat-input kit-beat-input--${row.kind}`}
            allowDeleteEmpty={false}
            onChange={(t) => ops?.changeProposedBeat(row.beat, t)}
            onCycle={ops ? (d) => ops.cycleProposedKind(row.beat, d) : undefined}
            onEnter={() => {}}
            onDeleteEmpty={() => {}}
          />
        ) : isEditing ? (
          <BeatField
            value={edit.draft}
            className={`kit-beat-input kit-beat-input--${row.kind}`}
            autoFocusEnd
            allowDeleteEmpty={siblingIds.length > 1}
            onChange={(t) => edit.change(row.id, t)}
            onEnter={() => { edit.flush(row.id); edit.addBeatAt(row.sceneId, index + 1); }}
            onCycle={ops ? () => { edit.flush(row.id); ops.update('beat', row.id, { kind: nextKind(row.kind) }); } : undefined}
            onNavigate={(dir) => { edit.flush(row.id); stepOutlineField(dir, '[data-beat-key]'); return true; }}
            onDeleteEmpty={() => edit.removeBeat(row.id, neighbor())}
            onBlur={() => edit.blur(row.id)}
          />
        ) : (
          <span className={`kit-beat-input kit-beat-input--${row.kind}`} style={{ cursor: 'text' }}>
            {row.text || <span className="opacity-40 italic">empty beat</span>}
          </span>
        )}

        {isProposed && ops ? (
          <span className="kit-prop-acts">
            <button type="button" className="kit-prop-no" title="Reject"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); ops.rejectBeat(row.beat); }}>✗</button>
            <button type="button" className="kit-prop-yes" title="Accept"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); ops.acceptBeat(row.beat); }}>✓</button>
          </span>
        ) : (
          <span className="kit-beat-kindtag flex items-center gap-1.5 select-none pointer-events-none mr-2">
            <span>⇥ {row.kind}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── add-scene / add-chapter rows ───────────────────────────────────────────

const addBtnStyle = (indent: number): CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 4,
  margin: 0,
  padding: '6px 8px',
  paddingLeft: indent,
});

// The trailing add rows live BELOW their siblings, so they self-detect hover
// (onMouseEnter marks the subtree hot via onHover) rather than relying on a
// parent heading. Kept pointer-clickable while faded so hovering the strip
// reveals it; the click is guarded on `hot` so an invisible strip can't fire.
function AddSceneBtn({ chapId, hot, onHover }: { chapId: string; hot?: boolean; onHover?: () => void }) {
  const { ops } = useContext(OutlineCtx);
  if (!ops) return null;
  return (
    <button type="button" className="osp-add" style={{ ...addBtnStyle(IND_SCENE), opacity: hot ? 0.7 : 0 }}
      onMouseEnter={onHover} onClick={() => { if (hot) ops.add('scene', chapId); }}>
      <Plus size={12} strokeWidth={2.2} />scene
    </button>
  );
}

function AddChapBtn({ actId, hot, onHover }: { actId: string; hot?: boolean; onHover?: () => void }) {
  const { ops } = useContext(OutlineCtx);
  if (!ops) return null;
  return (
    <button type="button" className="osp-add" style={{ ...addBtnStyle(IND_CHAPTER), opacity: hot ? 0.7 : 0 }}
      onMouseEnter={onHover} onClick={() => { if (hot) ops.addChapter(actId); }}>
      <Plus size={12} strokeWidth={2.2} />chapter
    </button>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export function FlatOutline({
  outline, ops, threads = [], filterThreadIds, onOpenChapter, marginAware,
}: {
  outline: any;
  ops?: OutlineOps;
  /** Project threads, for colouring beat markers by owning thread. */
  threads?: ThreadSummary[];
  /** When non-empty, show only beats owned by these threads (scenes/chapters/
   *  acts with no surviving beat are pruned). */
  filterThreadIds?: Set<string>;
  /** When set, each chapter heading shows a hover "open in manuscript" icon that
   *  calls this with the chapter id (the outline page deep-links the editor). */
  onOpenChapter?: (chapId: string) => void;
  /** Margin mode: render each chapter as a page-level <MarginBlock> with its own
   *  gutter heading (docks via the page's <MarginOverlay>), acts / add-rows as
   *  body-aligned empty-gutter blocks. The component must then be a direct child
   *  of <PageShell> (it's recognised via this flag) and sit inside an <OutlineDnd>
   *  that wraps the shell. Off → the legacy single flat list. */
  marginAware?: boolean;
}) {
  const filtering = !!filterThreadIds && filterThreadIds.size > 0;
  const pruned = useMemo(
    () => (filtering ? pruneOutline(outline, filterThreadIds!) : outline),
    [outline, filtering, filterThreadIds],
  );
  const flat = useMemo(() => flattenOutline(pruned, !filtering), [pruned, filtering]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Hover scope — the cursor's owning scene / chapter / act. A child row reports
  // its identity up on mouse-enter; the chapter/act are resolved from the row (or
  // via chapAct for scenes), so a heading's buttons reveal whenever any part of
  // its subtree is hovered. `hoverScene` also drives the scene wash highlight.
  const [hoverScene, setHoverScene] = useState<string | null>(null);
  const [hoverChap, setHoverChap] = useState<string | null>(null);
  const [hoverAct, setHoverAct] = useState<string | null>(null);
  const clearHover = useCallback(() => { setHoverScene(null); setHoverChap(null); setHoverAct(null); }, []);

  // beat map for editing orchestration (resolve by id + owns guard)
  const beatMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of flat) if (r.type === 'beat') m.set(r.id, r.beat);
    return m;
  }, [flat]);
  const beatMapRef = useRef(beatMap);
  beatMapRef.current = beatMap;
  const resolve = useCallback((id: string) => beatMapRef.current.get(id), []);
  const owns = useCallback((id: string) => beatMapRef.current.has(id), []);

  const edit = useBeatEdit(ops, resolve);
  useBeatEditSignal(owns, edit.openById);

  const threadFor = useMemo(() => makeThreadFor(threads), [threads]);
  const ctx = useMemo<OutlineCtxValue>(
    () => ({ readOnly: !ops, ops, edit, threadFor, numFor: noNumFor }),
    [ops, edit, threadFor],
  );

  const visible = useMemo(() => getVisible(flat, collapsed), [flat, collapsed]);

  // pending merge-proposal ghost beats across the WHOLE (unfiltered) outline — the
  // "accept all" count. Read from the source tree, not the pruned/filtered one.
  const proposalCount = useMemo(() => {
    let n = 0;
    for (const a of outline?.acts ?? [])
      for (const c of a.chapters ?? [])
        for (const s of c.scenes ?? [])
          for (const b of s.beats ?? []) if (b?.proposal) n++;
    return n;
  }, [outline]);

  // per-scene sibling IDs for delete-guard + neighbor focus
  const sceneBeatSiblings = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of flat) {
      if (r.type !== 'beat') continue;
      if (!m.has(r.sceneId)) m.set(r.sceneId, []);
      m.get(r.sceneId)!.push(r.id);
    }
    return m;
  }, [flat]);

  // per-beat index within its scene (for drag data)
  const beatIndex = useMemo(() => {
    const m = new Map<string, number>();
    const cnt = new Map<string, number>();
    for (const r of flat) {
      if (r.type !== 'beat') continue;
      const i = cnt.get(r.sceneId) ?? 0;
      m.set(r.id, i);
      cnt.set(r.sceneId, i + 1);
    }
    return m;
  }, [flat]);

  // beat → its scene, scene → its chapter (for focus highlighting)
  const beatScene = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of flat) if (r.type === 'beat') m.set(r.id, r.sceneId);
    return m;
  }, [flat]);
  const sceneChap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of flat) if (r.type === 'scene') m.set(r.id, r.chapId);
    return m;
  }, [flat]);
  // chapter → its act, so a hovered scene (which only knows its chapId) can mark
  // the owning act hot too.
  const chapAct = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of flat) if (r.type === 'chapter') m.set(r.id, r.actId);
    return m;
  }, [flat]);

  // the focused scene = the scene owning the beat currently being edited; its
  // chapter heading gets the focus treatment too.
  const focusScene = edit.editingId ? (beatScene.get(edit.editingId) ?? null) : null;
  const focusedChapId = focusScene ? (sceneChap.get(focusScene) ?? null) : null;

  // group the flat rows so each scene + its beats render inside one wrapper we
  // can wash on hover/focus. Acts, chapters and add-rows stay standalone.
  const items = useMemo(() => {
    const out: any[] = [];
    for (let i = 0; i < visible.length; i++) {
      const row = visible[i];
      if (row.type === 'scene') {
        const beats: any[] = [];
        let j = i + 1;
        while (j < visible.length && visible[j].type === 'beat') { beats.push(visible[j]); j++; }
        out.push({ kind: 'scene', scene: row, beats });
        i = j - 1;
      } else {
        out.push({ kind: 'row', row });
      }
    }
    return out;
  }, [visible]);

  // One `items` element → its node (scene-group · act · chapter · add-row). Shared
  // by the flat list and the per-chapter margin blocks (which slot scene-groups +
  // add-scene into a chapter block, and act / add-chapter into empty-gutter ones).
  const renderItem = (it: any): ReactNode => {
    if (it.kind === 'scene') {
      const scene = it.scene as SceneRow;
      const active = hoverScene === scene.id || focusScene === scene.id;
      // hovering a scene (or any of its beats, which live inside this wrapper)
      // marks the scene hot AND lights its owning chapter + act.
      const enter = () => {
        setHoverScene(scene.id);
        setHoverChap(scene.chapId);
        setHoverAct(chapAct.get(scene.chapId) ?? null);
      };
      return (
        <div
          key={scene.id}
          onMouseEnter={enter}
          onMouseLeave={() => setHoverScene(s => (s === scene.id ? null : s))}
          style={{ background: active ? SCENE_HILITE_BG : undefined, borderRadius: 8 }}
        >
          <SceneHeading row={scene} open={!collapsed.has(scene.id)} onToggle={() => toggle(scene.id)} hot={hoverScene === scene.id} />
          {it.beats.map((b: BeatRow_) => (
            <FlatBeatRow
              key={b.id}
              row={b}
              index={beatIndex.get(b.id) ?? 0}
              siblingIds={sceneBeatSiblings.get(b.sceneId) ?? []}
            />
          ))}
        </div>
      );
    }

    const row = it.row as OutlineRow;
    const isOpen = !collapsed.has(row.id);
    if (row.type === 'act') {
      return <ActHeading key={row.id} row={row} open={isOpen} onToggle={() => toggle(row.id)}
        hot={hoverAct === row.id}
        onHover={() => { setHoverAct(row.id); setHoverChap(null); setHoverScene(null); }} />;
    }
    if (row.type === 'chapter') {
      return <ChapHeading key={row.id} row={row} open={isOpen} onToggle={() => toggle(row.id)} focused={row.id === focusedChapId} onOpenChapter={onOpenChapter}
        hot={hoverChap === row.id}
        onHover={() => { setHoverChap(row.id); setHoverAct(row.actId); setHoverScene(null); }} />;
    }
    if (row.type === 'add-scene') {
      return filtering ? null : <AddSceneBtn key={row.id} chapId={row.chapId}
        hot={hoverChap === row.chapId}
        onHover={() => { setHoverChap(row.chapId); setHoverAct(chapAct.get(row.chapId) ?? null); setHoverScene(null); }} />;
    }
    if (row.type === 'add-chapter') {
      return filtering ? null : <AddChapBtn key={row.id} actId={row.actId}
        hot={hoverAct === row.actId}
        onHover={() => { setHoverAct(row.actId); setHoverChap(null); setHoverScene(null); }} />;
    }
    return null;
  };

  const acceptAll = ops && proposalCount > 0 ? (
    <div className="flex justify-end mb-2">
      <button type="button" className="kit-acceptall" onClick={() => ops.acceptAllBeats()}>
        ✓ Accept all · {proposalCount}
      </button>
    </div>
  ) : null;
  const emptyMsg = filtering && !pruned?.acts?.length ? (
    <div className="px-2 py-6 text-[13px] italic text-[var(--ink-3)]">
      No beats match the selected threads.
    </div>
  ) : null;
  const addAct = ops && !filtering ? (
    <button type="button" className="osp-add osp-add-act" onMouseEnter={clearHover} onClick={() => ops.add('act')}>
      + act
    </button>
  ) : null;

  // ── margin mode: each chapter is a page-level <MarginBlock> with its own gutter
  //    heading; acts / add-rows ride empty-gutter blocks so they stay body-aligned
  //    (only chapters carry a gutter mark, the way only threads do under Outline in
  //    the Character Studio). A collapsed act/chapter drops its rows from `items`,
  //    so its block (or whole sub-tree) simply isn't emitted. ──
  if (marginAware) {
    const gl = (id: string, node: ReactNode) =>
      node ? <MarginBlock key={id} id={id} gutter={<span aria-hidden />}>{node}</MarginBlock> : null;

    const units: any[] = [];
    for (let i = 0; i < items.length; ) {
      const it = items[i];
      if (it.kind === 'row' && it.row.type === 'chapter') {
        const chap = it.row as ChapRow;
        const body: any[] = [];
        i++;
        while (i < items.length) {
          const nx = items[i];
          if (nx.kind === 'row' && (nx.row.type === 'chapter' || nx.row.type === 'act' || nx.row.type === 'add-chapter')) break;
          body.push(nx);
          i++;
        }
        units.push({ type: 'chapter', chap, body });
      } else {
        units.push({ type: 'standalone', it });
        i++;
      }
    }

    return (
      <OutlineCtx.Provider value={ctx}>
        <div
          className="cm2v2"
          // containerType:'normal' neutralises .cm2v2's `container-type:inline-size`
          // so the nested chapter .wm-blocks don't resolve margin.css's
          // `@container (max-width:720px)` gutter-collapse against this wrapper.
          style={{ display: 'block', height: 'auto', minHeight: 0, padding: 0, overflow: 'visible', containerType: 'normal' }}
        >
          <div className="cm-outline" onMouseLeave={clearHover}>
            {gl('ol-acceptall', acceptAll)}
            {gl('ol-empty', emptyMsg)}
            {units.map((u, k) => {
              if (u.type === 'chapter') {
                const chap = u.chap as ChapRow;
                return (
                  <MarginBlock
                    key={chap.id}
                    id={chap.id}
                    gutter={
                      <div className="origin-left scale-[0.88] pl-3">
                        <ChapterMarginEntry n={chap.n} title={chap.text} onClick={() => toggle(chap.id)} />
                      </div>
                    }
                  >
                    {renderItem({ kind: 'row', row: chap })}
                    {u.body.map(renderItem)}
                  </MarginBlock>
                );
              }
              const it = u.it;
              const id = it.kind === 'row' ? `gl:${it.row.id}` : `gl:${k}`;
              return gl(id, renderItem(it));
            })}
            {gl('ol-addact', addAct)}
          </div>
        </div>
      </OutlineCtx.Provider>
    );
  }

  return (
    <OutlineCtx.Provider value={ctx}>
      <div
        className="cm2v2"
        style={{ display: 'block', height: 'auto', minHeight: 0, padding: 0, overflow: 'visible' }}
      >
        <div className="cm-outline" onMouseLeave={clearHover}>
          {acceptAll}
          {emptyMsg}
          {items.map(renderItem)}
          {addAct}
        </div>
      </div>
    </OutlineCtx.Provider>
  );
}
