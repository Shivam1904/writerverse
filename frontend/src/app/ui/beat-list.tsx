import * as React from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '../lib/utils';
import { BeatField, autoGrow } from './beat-field';
import { BeatMarker } from './beat-marker';

/**
 * BeatList — the thread-block beat editor as a kit component, and the single
 * renderer for ALL three beat surfaces (the legacy tl-* rows are retired):
 *   · list (default) → the everyday editor: dot marker, always-on textarea, ⠿
 *     handle reorders, Tab cycles the kind, green proposal rows with ✓/✗.
 *   · analysis       → same row, but a flagged beat's dot turns red + blinks and
 *     a reasoning list (one per gauge) renders below it. Driven by
 *     `contradictionsFor`.
 *   · merge          → the dot becomes a number block (thread colour, ✓ once
 *     placed) and the WHOLE row is a drag source for the grand outline. The host
 *     supplies `placedIds` + `dragPayloadFor`; the grand-outline DndContext wraps
 *     this list (so merge mode renders NO DndContext of its own).
 *
 * Keystrokes match the shared field-list contract (the braindumps stream /
 * showcase Ideas — see useFieldList):
 *   · Enter             → add the next beat below; focus it.
 *   · Shift+Enter       → newline in the same field (native; not intercepted).
 *   · Backspace (empty) → remove the beat; focus the previous (caret at end).
 *   · ArrowDown         → caret moves within the field; at the very END it hops to
 *                         the next beat (caret at start).
 *   · ArrowUp           → caret moves within the field; at the very START it hops to
 *                         the previous beat (caret at end).
 *   · Alt+↑/↓           → jump straight to the prev/next beat.
 *   · Tab               → cycle this beat's kind (beat-specific).
 *   · blur              → save (controlled mode flushes the pending write).
 *
 * A beat may be `proposed` (AI suggestion): the row turns green with absolute
 * accept/reject at the top-right, and an "accept all" appears.
 *
 * Two ways to drive it:
 *   · UNCONTROLLED (the showcase / demo) — pass nothing (or just `beats`): it
 *     owns its own state, mutating in place. Self-contained.
 *   · CONTROLLED (the real Threads page) — pass `beats` + the callbacks. Every
 *     edit, add, reorder, kind-cycle and proposal accept/reject routes out to the
 *     parent (which owns persistence via useThreadBeats). `focusId` tells the list
 *     which row to focus after an add / delete (the parent moves it).
 */

export type BeatKind = 'text' | 'placeholder' | 'heading';
export type BeatView = 'list' | 'analysis';
export interface BeatProposal { id?: string; text?: string; kind?: string }
export interface BeatContradiction { text: string; gauge?: string }
export interface Beat {
  id: string;
  text: string;
  kind: BeatKind;
  /** demo flag — a self-contained "this row is an AI suggestion". */
  proposed?: boolean;
  /** real proposal payload (Night Eyes): when present the row shows the PROPOSED
   *  text and edits route into the proposal, not the committed beat. */
  proposal?: BeatProposal | null;
  /** a brand-new proposed beat (ghost insert — no committed beat behind it yet). */
  insert?: boolean;
}

type Caret = 'start' | 'end';

const KINDS: BeatKind[] = ['text', 'placeholder', 'heading'];
const PH: Record<BeatKind, string> = {
  text: 'Write the beat…',
  placeholder: 'What happens here? (placeholder)',
  heading: 'Section heading…',
};

const isProposed = (b: Beat) => !!b.proposal || !!b.proposed;
const displayText = (b: Beat) => (b.proposal ? (b.proposal.text ?? '') : (b.text ?? ''));

let _seq = 0;
const newBeat = (text = '', kind: BeatKind = 'text', proposed = false): Beat => ({ id: `beat-${(_seq++).toString(36)}`, text, kind, proposed });

function Marker({ kind, color, flagged, handleProps }: {
  kind: BeatKind; color: string; flagged: boolean; handleProps?: Record<string, any>;
}) {
  // the shared vocabulary: thread editor → a small circle (no number), kind via fill
  return (
    <span style={{ gridColumn: 2, justifySelf: 'center', marginTop: 3 }} {...(handleProps || {})} aria-label="Drag to reorder" title="Drag to reorder">
      <BeatMarker kind={kind} form="circle" content="none" color={color} size={9} flagged={flagged} />
    </span>
  );
}

/* The shared, dnd-agnostic visual row. The wrapper supplies `setNodeRef`/`style`
 * and `handleProps` — the drag listeners live on the ⠿ handle (sortable reorder).
 * The handle is the ONLY drag activator. */
function BeatRowView({
  beat, color, view, flagged, contradictions, allowDeleteEmpty, setRef,
  setNodeRef, style, handleProps,
  onChange, onEnter, onCycle, onDeleteEmpty, onNav, onBlur, onAccept, onReject,
}: {
  beat: Beat;
  color: string;
  view: BeatView;
  flagged: boolean;
  contradictions: BeatContradiction[];
  allowDeleteEmpty: boolean;
  setRef: (id: string, el: HTMLTextAreaElement | null) => void;
  setNodeRef: (el: HTMLElement | null) => void;
  style: React.CSSProperties;
  handleProps?: Record<string, any>;
  onChange: (t: string) => void;
  onEnter: () => void;
  onCycle: (d: 1 | -1) => void;
  onDeleteEmpty: () => void;
  /** move focus to the prev/next beat; returns whether it moved. */
  onNav: (d: 1 | -1, caret: Caret) => boolean;
  onBlur: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const prop = isProposed(beat);
  const rowStyle: React.CSSProperties = {
    ...style,
    backgroundColor: prop ? 'color-mix(in srgb, var(--asp-proposals) 8%, transparent)' : style.backgroundColor,
  };
  // No dead zones: clicking anywhere in the row — the drag-handle gutter, the dot,
  // the column gaps, the kindtag, the row padding — focuses this beat (caret to
  // end). Direct clicks on the textarea (native caret placement) and the
  // accept/reject controls keep their own behaviour. PointerSensor drives drag via
  // pointer events, so preventing the mousedown default here never blocks a drag.
  const focusRow = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t === taRef.current || t.closest('.kit-prop-acts') || t.closest('.kit-beat-handle')) return;
    e.preventDefault();
    const el = taRef.current;
    if (!el) return;
    el.focus();
    const p = el.value.length;
    el.setSelectionRange(p, p);
  };
  return (
    <div
      ref={setNodeRef as any}
      style={rowStyle}
      onMouseDown={focusRow}
      className={cn(
        'kit-beat-row relative',
        `kit-beat-row--${beat.kind}`,
      )}
    >
      <Marker kind={beat.kind} color={color} flagged={flagged} handleProps={handleProps} />
      <BeatField
        value={displayText(beat)}
        placeholder={PH[beat.kind]}
        className={cn('kit-beat-input', `kit-beat-input--${beat.kind}`)}
        allowDeleteEmpty={allowDeleteEmpty}
        inputRef={(el) => { taRef.current = el; setRef(beat.id, el); }}
        onChange={onChange}
        onEnter={onEnter}
        onCycle={onCycle}
        onDeleteEmpty={onDeleteEmpty}
        onNavigate={onNav}
        onBlur={onBlur}
      />
      <span className="kit-beat-kindtag flex items-center gap-1.5 select-none pointer-events-none mr-2">
        <span>⇥ {beat.kind}</span>
      </span>
      {prop ? (
        <span className="kit-prop-acts">
          <button type="button" className="kit-prop-no" title="Reject" onMouseDown={(e) => e.preventDefault()} onClick={onReject}>✗</button>
          <button type="button" className="kit-prop-yes" title="Accept" onMouseDown={(e) => e.preventDefault()} onClick={onAccept}>✓</button>
        </span>
      ) : null}
      {view === 'analysis' && flagged && contradictions.length > 0 && (
        <div className="kit-contra-list">
          {contradictions.map((c, i) => (
            <div key={i} className="kit-contra-item">
              <span className="kit-contra-mk">▲</span>
              <span className="kit-contra-text">{c.text}</span>
              {c.gauge && <span className="kit-contra-gauge">{c.gauge}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type RowProps = Omit<React.ComponentProps<typeof BeatRowView>, 'setNodeRef' | 'style' | 'handleProps'>;

/* list / analysis — sortable (reorder; a heading drags its block). */
function SortableRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.beat.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return <BeatRowView {...props} setNodeRef={setNodeRef} style={style} handleProps={{ ...attributes, ...listeners }} />;
}

export interface BeatListProps {
  /** The beats. Controlled when paired with `onChangeText`; otherwise seeds the
   *  internal demo state once. */
  beats?: Beat[];
  color?: string;
  className?: string;
  /** Which surface this list renders. Defaults to the everyday `list` view. */
  view?: BeatView;
  /** analysis: per-beat contradictions (the red dot + reasoning list). */
  contradictionsFor?: (beatId: string) => BeatContradiction[];
  /** Controlled: which row should hold focus after an add/delete (caret at end). */
  focusId?: string | null;
  /** Controlled: a committed beat's text changed. Presence of this switches the
   *  list to controlled mode. */
  onChangeText?: (id: string, text: string) => void;
  /** Controlled: add a beat after `afterId` (null = append). */
  onAdd?: (afterId: string | null) => void;
  /** Controlled: Tab cycled this beat's kind. */
  onCycle?: (id: string, dir: 1 | -1) => void;
  /** Controlled: Backspace on an empty beat. */
  onDeleteEmpty?: (id: string) => void;
  /** Controlled: dnd reorder. */
  onReorder?: (activeId: string, overId: string) => void;
  /** Controlled: edit a proposed (green) beat's text. */
  onChangeProposedText?: (beat: Beat, text: string) => void;
  /** Controlled: accept a proposal. */
  onAcceptProposal?: (beat: Beat) => void;
  /** Controlled: reject a proposal. */
  onRejectProposal?: (beat: Beat) => void;
  /** Controlled: accept every pending proposal. */
  onAcceptAll?: () => void;
  /** Controlled: a field lost focus — flush its pending save. */
  onBlurField?: (id: string) => void;
}

export function BeatList({
  beats: beatsProp, color = 'var(--terra)', className, view = 'list',
  contradictionsFor, focusId,
  onChangeText, onAdd, onCycle, onDeleteEmpty, onReorder,
  onChangeProposedText, onAcceptProposal, onRejectProposal, onAcceptAll, onBlurField,
}: BeatListProps) {
  const controlled = beatsProp !== undefined && !!onChangeText;

  // ── uncontrolled (demo) state — only used when not controlled ──
  const [internal, setInternal] = React.useState<Beat[]>(
    () => beatsProp ?? [
      newBeat('Tony confronts the mentor', 'text'),
      newBeat('The vault refuses to open', 'text', true),
      newBeat('Sound the call to adventure', 'placeholder', true),
      newBeat('Act II', 'heading'),
    ],
  );
  const beats = controlled ? beatsProp! : internal;

  const els = React.useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = React.useRef<{ id: string; caret: Caret } | null>(null); // uncontrolled: focus after add/remove
  const prevFocus = React.useRef<string | null>(null);  // controlled: track focusId edges
  // Mouse/touch drag on the dot, or keyboard: Tab to the dot, Space to pick up,
  // ↑/↓ to move, Space to drop (Esc cancels).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const focusAt = (id: string | undefined | null, caret: Caret) => {
    if (!id) return;
    const el = els.current.get(id);
    if (!el) return;
    el.focus();
    const pos = caret === 'start' ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
    autoGrow(el);
  };

  // uncontrolled: focus the row queued by the last internal mutation
  React.useEffect(() => {
    if (controlled) return;
    const p = pendingFocus.current;
    if (!p) return;
    pendingFocus.current = null;
    focusAt(p.id, p.caret);
  });
  // controlled: follow the parent's focusId whenever it changes to a new row
  React.useEffect(() => {
    if (!controlled) return;
    if (focusId && focusId !== prevFocus.current) { prevFocus.current = focusId; focusAt(focusId, 'end'); }
    if (!focusId) prevFocus.current = null;
  }, [controlled, focusId]);

  const setRef = (id: string, el: HTMLTextAreaElement | null) => {
    if (el) { els.current.set(id, el); autoGrow(el); } else els.current.delete(id);
  };

  // focus the prev/next beat (pure focus move — works in both modes). Returns
  // whether a sibling existed to move to.
  const nav = (id: string, dir: 1 | -1, caret: Caret) => {
    const i = beats.findIndex((b) => b.id === id);
    const target = beats[i + dir];
    if (!target) return false;
    focusAt(target.id, caret);
    return true;
  };

  // ── uncontrolled mutators (demo) ──
  const iChange = (id: string, text: string) => setInternal((bs) => bs.map((b) => (b.id === id ? { ...b, text } : b)));
  const iCycle = (id: string, dir: 1 | -1) => setInternal((bs) => bs.map((b) => {
    if (b.id !== id) return b;
    const i = (KINDS.indexOf(b.kind) + dir + KINDS.length) % KINDS.length;
    return { ...b, kind: KINDS[i] };
  }));
  const iAddAfter = (id?: string) => setInternal((bs) => {
    const i = id ? bs.findIndex((b) => b.id === id) : bs.length - 1;
    const fresh = newBeat();
    pendingFocus.current = { id: fresh.id, caret: 'start' };
    const next = [...bs]; next.splice(i + 1, 0, fresh); return next;
  });
  const iRemoveEmpty = (id: string) => setInternal((bs) => {
    if (bs.length <= 1) return bs;
    const i = bs.findIndex((b) => b.id === id);
    pendingFocus.current = { id: bs[i - 1]?.id ?? bs[i + 1]?.id ?? '', caret: 'end' };
    return bs.filter((b) => b.id !== id);
  });
  const iAccept = (id: string) => setInternal((bs) => bs.map((b) => (b.id === id ? { ...b, proposed: false, proposal: null } : b)));
  const iReject = (id: string) => setInternal((bs) => bs.filter((b) => b.id !== id));
  const iAcceptAll = () => setInternal((bs) => bs.map((b) => (isProposed(b) ? { ...b, proposed: false, proposal: null } : b)));
  const iReorder = (activeId: string, overId: string) =>
    setInternal((bs) => arrayMove(bs, bs.findIndex((b) => b.id === activeId), bs.findIndex((b) => b.id === overId)));

  // ── resolved handlers (route to parent when controlled, else mutate demo) ──
  const change = (b: Beat, t: string) => {
    if (!controlled) return iChange(b.id, t);
    if (b.proposal) onChangeProposedText?.(b, t); else onChangeText?.(b.id, t);
  };
  const enter = (b: Beat) => (controlled ? onAdd?.(b.id) : iAddAfter(b.id));
  const cycle = (b: Beat, d: 1 | -1) => (controlled ? onCycle?.(b.id, d) : iCycle(b.id, d));
  const del = (b: Beat) => (controlled ? onDeleteEmpty?.(b.id) : iRemoveEmpty(b.id));
  const blur = (b: Beat) => (controlled ? onBlurField?.(b.id) : undefined);
  const accept = (b: Beat) => (controlled ? onAcceptProposal?.(b) : iAccept(b.id));
  const reject = (b: Beat) => (controlled ? onRejectProposal?.(b) : iReject(b.id));
  const acceptAll = () => (controlled ? onAcceptAll?.() : iAcceptAll());
  const addEnd = () => (controlled ? onAdd?.(beats[beats.length - 1]?.id ?? null) : iAddAfter());

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    if (controlled) onReorder?.(String(active.id), String(over.id));
    else iReorder(String(active.id), String(over.id));
  };

  const propCount = beats.filter(isProposed).length;

  // shared per-row props (everything but the dnd wiring)
  const rowProps = (b: Beat): RowProps => {
    const flagged = view === 'analysis' && (contradictionsFor?.(b.id)?.length ?? 0) > 0;
    return {
      beat: b,
      color,
      view,
      flagged,
      contradictions: flagged ? (contradictionsFor?.(b.id) ?? []) : [],
      allowDeleteEmpty: beats.length > 1,
      setRef,
      onChange: (t) => change(b, t),
      onEnter: () => enter(b),
      onCycle: (d) => cycle(b, d),
      onDeleteEmpty: () => del(b),
      onNav: (d, caret) => nav(b.id, d, caret),
      onBlur: () => blur(b),
      onAccept: () => accept(b),
      onReject: () => reject(b),
    };
  };

  const footer = (
    <div className="mt-1 flex items-center gap-3 ">
      <span className="tl-spacer" />
      {propCount > 0 && (
        <button type="button" className="kit-acceptall" onClick={acceptAll}>✓ Accept all · {propCount}</button>
      )}
    </div>
  );

  // ── list / analysis — internal sortable reorder ──
  return (
    <div className={cn('kit-beat-list', className)}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={beats.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="relative">
            <div className="absolute top-0 left-[26px] w-[3px] h-full justify-center pointer-events-none"
              style={{ backgroundColor: color, opacity: 0.15, marginTop: '14px' }} />
            {beats.map((b) => <SortableRow key={b.id} {...rowProps(b)} />)}

            <button type="button" className="kit-beat-add ml-6" onClick={addEnd}>
              <span className="kit-beat-add-plus">＋</span> add a beat
            </button>
          </div>
        </SortableContext>
      </DndContext>
      {footer}
    </div>
  );
}
