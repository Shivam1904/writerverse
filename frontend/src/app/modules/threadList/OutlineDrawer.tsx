import { BaseOutlinePicker, type StructurePreset } from './BaseOutlinePicker';
import { OutlineSpine } from '../outline/OutlineSpine';
import './thread-list.css'; // .tl-drawer-* (the merge page has no ThreadsList to load it)
import type { OutlineOps } from '../outline/useOutlineModel';

/* OutlineDrawer — the right half of the merge view.
 *
 * Two states, keyed off the REAL grand outline (no local stub any more):
 *   · NO OUTLINE YET → the <BaseOutlinePicker> ("Start with a base outline").
 *     Picking a scaffold runs the real init_grand_outline; once acts exist this
 *     flips to the spine.
 *   · OUTLINE EXISTS → the reskinned <OutlineSpine> over the live grand outline:
 *     drag a thread beat from the left to place it (persisted via place_thread_beat
 *     through the shared <OutlineDnd> an ancestor provides), edit any line inline.
 *
 * Loading + drop wiring are the threads page's; only the UI is the clean preview. */

interface ThreadSummary { id: string; name: string; color: string; }

export function OutlineDrawer({
  outline = null,
  threads = [],
  ops,
  activeThreadId,
  numByItem,
  onStructure,
  onCustom,
  onThread,
}: {
  /** The live grand-outline tree (useOutlineModel.grandOutline). */
  outline?: any;
  /** Source threads — colours the spine's placed beats. */
  threads?: ThreadSummary[];
  /** Outline edit/placement ops (useOutlineModel.ops). */
  ops?: OutlineOps;
  /** The focused storyline — its placed beats are highlighted in the spine. */
  activeThreadId?: string | null;
  /** Source-beat id → its number within its thread (for the placed-beat badge). */
  numByItem?: Map<string, number>;
  onStructure?: (preset: StructurePreset) => void;
  onCustom?: (top: string, unit: string, count: number) => void;
  onThread?: (thread: any) => void;
}) {
  const acts: any[] = outline?.acts ?? [];

  if (!acts.length) {
    return (
      <div className="tl-drawer">
        {/* "use a thread as the spine" isn't wired to a real outline yet, so its
            list is hidden (threads=[]) — structure presets + custom are live. */}
        <BaseOutlinePicker
          threads={[]}
          onStructure={(p) => onStructure?.(p)}
          onCustom={(t, u, c) => onCustom?.(t, u, c)}
          onThread={(t) => onThread?.(t)}
        />
      </div>
    );
  }

  let beatCount = 0;
  for (const a of acts) for (const c of a.chapters ?? []) for (const s of c.scenes ?? []) beatCount += (s.beats ?? []).length;

  return (
    <div className="tl-drawer">
      <div className="tl-drawer-head">
        <span className="tl-drawer-pill">Grand outline</span>
        <span className="tl-drawer-head-note">{beatCount ? `${beatCount} beat${beatCount === 1 ? '' : 's'} placed` : 'one woven spine'}</span>
      </div>
      <div className="tl-drawer-body">
        <OutlineSpine outline={outline} threads={threads} ops={ops} activeThreadId={activeThreadId} numByItem={numByItem} />
      </div>
    </div>
  );
}
