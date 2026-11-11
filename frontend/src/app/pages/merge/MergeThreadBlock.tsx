import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { GlossyStoryIcon } from '../../components/StoryIconsRegistry';
import { useThreadBeats } from '../../modules/threadList/useThreadBeats';
import { BeatInput } from '../../components/BeatInput';
import { BeatMarker } from '../../ui';
import '../../modules/threadList/thread-list.css'; // .tl-* block styles

/* MergeThreadBlock — the merge page's thread column block. The WHOLE row is the
 * drag source for the grand outline (no handle); a plain click starts the drag
 * (the cursor shows it on the overlay), a double-click opens the beat for inline
 * editing (drag is suppressed while editing). Beats are numbered sequentially —
 * headings included. A placed beat keeps its number + colour; only the number
 * box's background fades a little.
 *
 * Each beat carries the shared <OutlineDnd> `thread-beat` payload (a heading
 * carries the beats until the next heading), so a drop persists through
 * ops.dropBeat → place_thread_beat. */

function childrenOf(beats: any[], i: number) {
  const out: any[] = [];
  for (let j = i + 1; j < beats.length && beats[j].kind !== 'heading'; j++) {
    out.push({ itemId: beats[j].id, text: beats[j].text, kind: beats[j].kind });
  }
  return out;
}

function MergeBeatRow({
  thread, beats, beat, index, num, placed, B,
}: { thread: any; beats: any[]; beat: any; index: number; num: number; placed: boolean; B: any }) {
  const editing = B.openId === beat.id;
  const isHeading = beat.kind === 'heading';
  // a heading is "complete" once none of its group's beats are still placeholders
  const headingComplete = isHeading && childrenOf(beats, index).every((c) => c.kind !== 'placeholder');
  // `placed` is only a visual marker — a placed beat can still be dragged in again.
  const draggable = !editing;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `mb-${beat.id}`,
    data: {
      type: 'thread-beat',
      payload: {
        threadId: thread.id,
        itemId: beat.id,
        text: beat.text,
        kind: beat.kind,
        children: beat.kind === 'heading' ? childrenOf(beats, index) : undefined,
      },
      label: beat.text,
    },
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      className={[
        'flex items-start gap-2 px-1 py-1 rounded-md',
        isDragging ? 'opacity-40' : '',
        draggable ? 'cursor-grab active:cursor-grabbing hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]' : '',
      ].filter(Boolean).join(' ')}
      style={{ touchAction: draggable ? 'none' : undefined, paddingLeft: isHeading ? undefined : 16 }}
      onDoubleClick={() => B.open(beat.id)}
      {...(draggable ? { ...attributes, ...listeners } : {})}
    >
      {/* merge column → unmerged = circle, merged (already in the outline) = square;
          merged also reads faded. (The normal thread editor is always a circle.) */}
      <span className="shrink-0 mt-[1px]">
        <BeatMarker kind={beat.kind} form={placed ? 'square' : 'circle'} content="number" num={num} color={thread.color} size={isHeading ? 20 : 15} muted={placed} complete={headingComplete} />
      </span>
      {editing ? (
        <BeatInput
          value={beat.text ?? ''}
          className="flex-1 bg-transparent border-0 outline-none resize-none text-[13.5px] leading-snug text-[var(--ink)]"
          allowDeleteEmpty={false}
          onChange={(t) => B.changeText(beat.id, t)}
          onEnter={() => { B.flush(beat.id); B.close(); }}
          onNavigate={(d) => B.navigate(beat.id, d)}
          onDeleteEmpty={() => B.removeAndFocusPrev(beat.id)}
          onBlur={() => { B.flush(beat.id); B.close(); }}
        />
      ) : (
        <span
          className={`flex-1 text-[13.5px] leading-snug ${isHeading ? 'font-bold text-[var(--ink)]' : 'text-[var(--ink-2)]'} ${placed ? 'opacity-60' : ''}`}
          style={{ fontFamily: 'var(--serif)' }}
        >
          {beat.text || <em className="text-[var(--ink-4)]">empty beat</em>}
        </span>
      )}
    </div>
  );
}

export function MergeThreadBlock({
  projectId, thread, placed, onMerge, merging,
}: {
  projectId?: string; thread: any; placed: Set<string>;
  onMerge?: (id: string) => void; merging?: boolean;
}) {
  const B = useThreadBeats(projectId, thread);
  const beats: any[] = B.beats;
  const remaining = beats.filter((b) => !placed.has(b.id)).length;
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 mb-2">
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
      >
        {open
          ? <ChevronDown size={14} className="shrink-0 text-[var(--ink-3)]" />
          : <ChevronRight size={14} className="shrink-0 text-[var(--ink-3)]" />}
        <GlossyStoryIcon iconKey="thread" color={thread.color} size={12} className="inline-flex align-middle" title={thread.name} />
        <span className="font-bold text-[13px]" style={{ color: thread.color, fontFamily: 'var(--serif)' }}>
          <em>{thread.name}</em>
        </span>
        <span className="flex-1" />
        <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]" style={{ fontFamily: 'var(--ui)' }}>
          {remaining} to place
        </span>
      </div>
      {open && (
        <div className="flex flex-col mt-2">
          {beats.length === 0 ? (
            <div className="text-[12px] italic text-[var(--ink-3)] py-1">No beats yet.</div>
          ) : (
            beats.map((b, i) => (
              <MergeBeatRow
                key={b.id}
                thread={thread}
                beats={beats}
                beat={b}
                index={i}
                num={i + 1}
                placed={placed.has(b.id)}
                B={B}
              />
            ))
          )}
          {onMerge && (
            <div className="flex justify-end mt-2 pt-1">
              <button type="button" className="tl-btn-gold tl-btn-sm" disabled={merging}
                onClick={(e) => { e.stopPropagation(); onMerge(thread.id); }}>
                <span className="tl-mk">✦</span> {merging ? 'Proposing…' : 'Merge into outline'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
