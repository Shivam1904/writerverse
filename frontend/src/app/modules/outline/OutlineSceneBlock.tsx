import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { Trash2, ChevronRight } from 'lucide-react';
import { stepOutlineField } from '../../components/beatFocus';
import { BeatInput } from '../../components/BeatInput';
import { BeatMarker, BeatField } from '../../ui';
import { OutlineFieldInput } from '../../pages/outline/components/OutlineFieldInput';
import type { OutlineOps } from './useOutlineModel';
import './outlineSpine.css';
import '../../pages/write/v2/chaptersV2.css';

/**
 * OutlineSceneBlock — the reusable scene unit of the grand outline (the merge
 * workspace's <OutlineSpine>, and later the ChaptersV2 bottom rail). It owns the
 * scene head (collapse) and its beats: collapsed → a thread-coloured dash strip,
 * expanded → the editable beat list. The beat unit (`BeatRow`) is the single place
 * ALL beat functionality lives — it's at once a reorder drag-source, an
 * insert-before drop target, and an inline editor.
 *
 * Consumers provide an `OutlineCtx` (ops/edit/threadFor/numFor) and an <OutlineDnd>
 * ancestor for the drag/drop wiring. This module also exports the shared atoms the
 * surrounding tree (chapters/acts) reuses: `OutlineCtx`, `useBeatEdit`, the indent
 * constants, `Caret`, `EditableHeading`, `CollapsibleHead`.
 */

export interface ThreadVisual { color?: string; lane: number; active: boolean; isNew: boolean; }

export interface BeatEditApi {
  editingId: string | null;
  draft: string;
  open: (beat: any) => void;
  openById: (id: string) => void;
  change: (id: string, text: string) => void;
  flush: (id: string) => void;
  close: (id: string) => void;
  addBeatAt: (sceneId: string, atIndex: number) => void;
  removeBeat: (id: string, neighborId?: string) => void;
  blur: (id: string) => void;
}

export type BeatDisplayState = 'done' | 'todo' | 'suggested';

export interface OutlineCtxValue {
  readOnly: boolean;
  ops?: OutlineOps;
  edit: BeatEditApi;
  threadFor: (fromRough?: string) => ThreadVisual;
  numFor: (fromItem?: string) => number | null;
  /** When provided (the chapters rail), a beat's marker reads its written-state
   *  instead of a source number: done → square + check, todo → hollow square,
   *  suggested → accent. Omitted everywhere else (merge/outline use numbers). */
  stateFor?: (beat: any) => BeatDisplayState | undefined;
  /** chapters rail — clamp each beat's text to 2 lines (no inline editing there). */
  clampBeats?: boolean;
}

export const OutlineCtx = createContext<OutlineCtxValue>(null as any);

// indent hierarchy (px): chapter ‹ scene ‹ beats. Inline so it beats cm's padding.
export const IND_CHAPTER = 4;
export const IND_SCENE = 22;
export const IND_BEATS = 40;

/* ── beat editing orchestration (the per-surface part, on shared BeatInput) ── */
export function useBeatEdit(ops: OutlineOps | undefined, resolve: (id: string) => any): BeatEditApi {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  draftRef.current = draft;
  const savedRef = useRef('');
  const timerRef = useRef<any>(null);

  const clear = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  useEffect(() => () => clear(), []);

  const flush = useCallback((id: string) => {
    clear();
    const t = draftRef.current;
    if (t === savedRef.current) return;
    savedRef.current = t;
    ops?.update('beat', id, { text: t });
  }, [ops]);

  const scheduleSave = useCallback((id: string) => {
    clear();
    timerRef.current = setTimeout(() => flush(id), 600);
  }, [flush]);

  const open = useCallback((beat: any) => {
    if (!beat) return;
    clear();
    const t = beat.text || '';
    savedRef.current = t;
    setDraft(t);
    setEditingId(beat.id);
  }, []);

  const openById = useCallback((id: string) => open(resolve(id)), [open, resolve]);

  const openEmpty = useCallback((id: string) => {
    clear();
    savedRef.current = '';
    setDraft('');
    setEditingId(id);
  }, []);

  const change = useCallback((id: string, t: string) => { setDraft(t); scheduleSave(id); }, [scheduleSave]);
  const close = useCallback((id: string) => setEditingId((cur) => (cur === id ? null : cur)), []);

  const addBeatAt = useCallback((sceneId: string, atIndex: number) => {
    if (!ops) return;
    const id = ops.add('beat', sceneId, '', atIndex);
    if (id) openEmpty(id);
  }, [ops, openEmpty]);

  const removeBeat = useCallback((id: string, neighborId?: string) => {
    clear();
    ops?.remove('beat', id);
    if (neighborId) {
      const b = resolve(neighborId);
      if (b) { open(b); return; }
    }
    close(id);
  }, [ops, resolve, open, close]);

  const blur = useCallback((id: string) => {
    if (!draftRef.current.trim()) { removeBeat(id); return; }
    flush(id);
    close(id);
  }, [removeBeat, flush, close]);

  return useMemo(
    () => ({ editingId, draft, open, openById, change, flush, close, addBeatAt, removeBeat, blur }),
    [editingId, draft, open, openById, change, flush, close, addBeatAt, removeBeat, blur],
  );
}

function setRefs(...fns: ((node: any) => void)[]) {
  return (node: any) => { for (const f of fns) f?.(node); };
}

/* the caret — a real toggle button (the row also toggles, but the caret is the
 * reliable, obvious affordance so collapse never depends on hitting empty space). */
export function Caret({ open, onToggle }: { open: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      className={`cm-osc-caret${open ? ' is-open' : ''}`}
      aria-label={open ? 'Collapse' : 'Expand'}
      onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
    >
      <ChevronRight size={12} strokeWidth={2.2} />
    </button>
  );
}

/* The chapter/scene title: a content-width label at rest — clicking ONLY the text
 * opens the editor (and stops the row's toggle); editing fills the cell. Everywhere
 * else on the row falls through to the row's collapse toggle. */
export function EditableHeading({
  titleClass, value, placeholder, kind, itemId, chapId, sceneId, onSave, onEnter, titleStyle,
}: {
  titleClass: string;
  value: string;
  placeholder: string;
  kind: 'act' | 'chapter' | 'scene';
  itemId: string;
  chapId: string;
  sceneId?: string;
  onSave: (t: string) => void;
  onEnter: () => void;
  /** Optional inline overrides for the rest-state label (e.g. bold on focus). */
  titleStyle?: CSSProperties;
}) {
  const { readOnly } = useContext(OutlineCtx);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (editing) ref.current?.querySelector('input')?.focus(); }, [editing]);

  if (readOnly) {
    return <span className={`${titleClass} justify-self-start min-w-0 max-w-full truncate`} style={titleStyle}>{value || placeholder}</span>;
  }
  if (editing) {
    return (
      <span
        ref={ref}
        className="justify-self-stretch w-full min-w-0"
        onClick={(e) => e.stopPropagation()}
        onBlur={() => setEditing(false)}
      >
        <OutlineFieldInput
          kind={kind} itemId={itemId} chapId={chapId} sceneId={sceneId}
          className={titleClass} value={value} placeholder={placeholder}
          onSave={onSave} onEnter={onEnter} onFocusField={() => { }}
        />
      </span>
    );
  }
  return (
    <span
      className={`${titleClass} justify-self-start min-w-0 max-w-full truncate cursor-text`}
      style={titleStyle}
      title={value || placeholder}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      {value || <span className="italic opacity-50">{placeholder}</span>}
    </span>
  );
}

/* ── the beat unit — the ONE place all beat functionality lives ──
 * reorder drag-source + insert-before drop target + inline editor, in the cm-beat
 * shell. The marker (thread dot / source-number) takes the checkbox slot. */
function BeatRow({
  beat, sceneId, index, sceneBeatIds, headingComplete,
}: { beat: any; sceneId: string; index: number; sceneBeatIds: string[]; headingComplete?: boolean }) {
  const { readOnly, ops, edit, threadFor, numFor, stateFor, clampBeats } = useContext(OutlineCtx);
  const isEditing = edit.editingId === beat.id;
  // A green merge proposal (read-merged ghost): always-on editable field + ✓/✗,
  // never draggable (nothing committed to reorder yet). Same treatment the flat
  // outline gives proposed beats, so both surfaces read identically.
  const isProposed = !!beat?.proposal && !readOnly;
  const th = threadFor(beat.from_rough);
  const draggable = !readOnly && !isEditing && !isProposed;

  const drag = useDraggable({
    id: `ospbeat:${beat.id}`,
    data: { type: 'outline-beat', sceneId, beatId: beat.id, index, label: beat.text },
    disabled: !draggable,
  });
  const drop = useDroppable({
    id: `ospdrop:${beat.id}`,
    data: { type: 'outline-beat', sceneId, index },
    disabled: readOnly || isProposed,
  });
  const setNode = setRefs(drag.setNodeRef, drop.setNodeRef);

  const markColor = th.isNew ? 'var(--asp-proposals)' : th.color;
  const srcNum = numFor(beat.from_item);
  const showNum = srcNum != null && !!markColor;
  const isHeading = beat.kind === 'heading';

  // marker: merge/outline → source number; chapters rail → written-state
  // (done = check, todo = hollow square, suggested = accent). Headings keep the
  // concentric-circle treatment in both, never a check/number.
  const st = !isHeading ? stateFor?.(beat) : undefined;
  let mkKind = beat.kind;
  let mkContent: 'none' | 'number' | 'check' = showNum ? 'number' : 'none';
  let mkColor: string | undefined = markColor || undefined;
  let mkNum: number | null = srcNum;
  if (st) {
    mkNum = null;
    mkColor = th.color || undefined;
    if (st === 'done') { mkKind = 'text'; mkContent = 'check'; }
    else if (st === 'suggested') { mkKind = 'text'; mkContent = 'none'; mkColor = 'var(--asp-proposals)'; }
    else { mkKind = 'placeholder'; mkContent = 'none'; }
  }

  const neighbor = () => sceneBeatIds[index - 1] ?? sceneBeatIds[index + 1];

  return (
    <div className="osp-beat-slot">
      {drop.isOver && <span className="osp-insert" />}
      <div
        ref={setNode}
        className="cm-beat"
        style={isProposed ? { backgroundColor: 'color-mix(in srgb, var(--asp-proposals) 8%, transparent)' } : undefined}
        data-ol-field=""
        data-beat-row=""
        data-beat-key={beat.id}
        onClick={isEditing || readOnly || isProposed ? undefined : () => edit.open(beat)}
        {...(draggable ? drag.listeners : {})}
        {...(draggable ? drag.attributes : {})}
      >
        {/* outline side → a SQUARE; a thread-placed beat shows its source number +
            thread colour, an authored beat is a neutral square. Kind via fill.
            In the rail, the marker reads written-state instead (see stateFor). */}
        <BeatMarker
          kind={mkKind}
          form="square"
          content={mkContent}
          num={mkNum}
          color={mkColor}
          size={18}
          complete={headingComplete}
        />

        {isProposed ? (
          /* green proposal: always-on editable field routed into the proposal */
          <BeatField
            value={beat.text ?? ''}
            className="cm-beat-text w-full bg-transparent border-0 outline-none resize-none p-0"
            allowDeleteEmpty={false}
            onChange={(t) => ops?.changeProposedBeat(beat, t)}
            onCycle={ops ? (d) => ops.cycleProposedKind(beat, d) : undefined}
            onEnter={() => {}}
            onDeleteEmpty={() => {}}
          />
        ) : isEditing ? (
          <BeatInput
            value={edit.draft}
            className="cm-beat-text"
            allowDeleteEmpty={sceneBeatIds.length > 1}
            onChange={(t) => edit.change(beat.id, t)}
            onEnter={() => { edit.flush(beat.id); edit.addBeatAt(sceneId, index + 1); }}
            onNavigate={(dir) => { edit.flush(beat.id); stepOutlineField(dir); }}
            onDeleteEmpty={() => edit.removeBeat(beat.id, neighbor())}
            onBlur={() => edit.blur(beat.id)}
          />
        ) : (
          <span className={`cm-beat-text${clampBeats ? ' is-clamped' : ''}`}>
            {beat.text || <em className="osp-faint">empty beat</em>}
          </span>
        )}

        {isProposed ? (
          <span className="inline-flex items-center gap-1">
            <button type="button" className="kit-prop-no" title="Reject"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); ops?.rejectBeat(beat); }}>✗</button>
            <button type="button" className="kit-prop-yes" title="Accept"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); ops?.acceptBeat(beat); }}>✓</button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            {th.isNew && <span className="cm-beat-tag">new</span>}
            {!readOnly && !isEditing && (
              <button
                type="button"
                className="osp-del"
                title="Delete beat"
                aria-label="Delete beat"
                onClick={(e) => { e.stopPropagation(); ops?.remove('beat', beat.id); }}
              >
                <Trash2 size={12} strokeWidth={1.8} />
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/* a heading's group runs to the next heading; it's "complete" once that group
 * holds no placeholder beats (the outer ring solidifies). */
function groupComplete(beats: any[], i: number) {
  for (let j = i + 1; j < beats.length && beats[j].kind !== 'heading'; j++) {
    if (beats[j].kind === 'placeholder') return false;
  }
  return true;
}

/* the beats list a scene renders — beat rows + (when the scene is the append
 * target) a plain insert line at the bottom, the same indicator beats use. */
function BeatList({ scene, appendLine }: { scene: any; appendLine: boolean }) {
  const beats: any[] = scene.beats ?? [];
  const beatIds = beats.map((b) => b.id);
  return (
    <div className="cm-beats" style={{ paddingLeft: IND_BEATS, paddingTop: 0, paddingBottom: 2 }}>
      {beats.map((b, i) => (
        <BeatRow
          key={b.id}
          beat={b}
          sceneId={scene.id}
          index={i}
          sceneBeatIds={beatIds}
          headingComplete={b.kind === 'heading' ? groupComplete(beats, i) : undefined}
        />
      ))}
      <div className="osp-beat-slot">{appendLine && <span className="osp-insert" />}</div>
    </div>
  );
}

/* A collapsible chapter/scene head — `cm-osc-head` grid (caret · number · title ·
 * trailing). The whole head toggles; only the title text opens the editor; the
 * trailing controls stop propagation. `indent` sets the level's left inset. */
export function CollapsibleHead({
  open, onToggle, indent, num, title, trailing,
}: {
  open: boolean;
  onToggle: () => void;
  indent: number;
  num: number | string;
  title: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className="cm-osc-head"
      style={{ paddingLeft: indent }}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(); } }}
    >
      <Caret open={open} onToggle={onToggle} />
      <span className="cm-osc-num">{num}</span>
      {title}
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>{trailing}</span>
    </div>
  );
}

/* The scene block — collapsible head + (collapsed) dash strip / (expanded) beats.
 * The whole scene is the append drop target; a hovered beat wins via OutlineDnd's
 * collision detection. The scene lights when the drop lands inside it. */
export function OutlineSceneBlock({
  scene, chapId, n, numPrefix = '', defaultOpen, onOpen, active: activeScene,
}: { scene: any; chapId: string; n: number; numPrefix?: string; defaultOpen?: boolean; onOpen?: () => void; active?: boolean }) {
  const { readOnly, ops, edit, threadFor } = useContext(OutlineCtx);
  const beats: any[] = scene.beats ?? [];
  // A scene holding a pending merge proposal opens itself, so the green ✓/✗ beat
  // is visible on load — and pops open when a proposal lands after mount.
  const hasProposed = beats.some((b) => b?.proposal);
  const [open, setOpen] = useState((defaultOpen ?? false) || hasProposed); // scenes collapsed by default
  useEffect(() => { if (hasProposed) setOpen(true); }, [hasProposed]);

  const drop = useDroppable({ id: `ospscene:${scene.id}`, data: { type: 'scene', sceneId: scene.id }, disabled: readOnly });
  const { active, over } = useDndContext();
  const overId = over ? String(over.id) : null;
  const overScene = overId === `ospscene:${scene.id}`;
  const lit = !!active && (overScene || beats.some((b) => overId === `ospdrop:${b.id}`));

  return (
    <div ref={drop.setNodeRef} className={`cm-osc${lit || activeScene ? ' is-current' : ''}`}>
      <CollapsibleHead
        open={open}
        onToggle={() => { setOpen((o) => !o); onOpen?.(); }}
        indent={IND_SCENE}
        num={`${numPrefix}${n}`}
        title={
          <EditableHeading
            titleClass="cm-osc-title" value={scene.text || ''} placeholder="untitled scene"
            kind="scene" itemId={scene.id} chapId={chapId} sceneId={scene.id}
            onSave={(t) => ops!.update('scene', scene.id, { text: t })}
            onEnter={() => edit.addBeatAt(scene.id, 0)}
          />
        }
        trailing={
          <>
            {beats.length > 0 && <span className="cm-osc-count">{beats.length}</span>}
            {!readOnly && (
              <button type="button" className="osp-del osp-del-node" title="Delete scene" onClick={() => ops!.remove('scene', scene.id)}>×</button>
            )}
          </>
        }
      />
      {open ? (
        <BeatList scene={scene} appendLine={overScene} />
      ) : beats.length > 0 ? (
        // collapsed → the dashed thread-coloured beat strip; sits INSIDE the scene
        // droppable (part of the drop-highlight zone). Clicking it expands the scene
        // (and, in the rail where onOpen is wired, opens it).
        <div
          className="flex items-center gap-1.5"
          style={{ paddingLeft: IND_BEATS, paddingBottom: 6, flexWrap: 'wrap', cursor: 'pointer' }}
          onClick={() => { setOpen(true); onOpen?.(); }}
        >
          {beats.map((b) => (
            <BeatMarker key={b.id} kind={b.kind} form="dash" color={threadFor(b.from_rough).color} size={16} muted={!String(b.text ?? '').trim()} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
