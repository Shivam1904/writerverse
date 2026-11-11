import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Layers3 } from 'lucide-react';
import {
  OutlineCtx,
  OutlineSceneBlock,
  CollapsibleHead,
  useBeatEdit,
  IND_CHAPTER,
  type OutlineCtxValue,
  type ThreadVisual,
  type BeatDisplayState,
} from '../../../modules/outline/OutlineSceneBlock';
import { useWriteSelection } from '../useWriteSelection';
import type { OutlineActNode, OutlineChapterNode, OutlineSceneNode } from '../data';
import type { BeatState, ThreadMeta } from './useChapterBeats';

interface Props {
  acts: OutlineActNode[];
  beatStates: Record<string, BeatState>;
  colorFor: (threadId?: string | null) => string;
  threads: ThreadMeta[];
}

/**
 * The bottom story-thread rail: acts → chapters → scenes. The scene unit is the
 * shared <OutlineSceneBlock> (the same one the merge workspace uses) — collapsed
 * → a thread-coloured dash strip, expanded → the square beat rows; chapter heads
 * wear our <CollapsibleHead> "cm" row. The rail is READ-ONLY: it hands the scene
 * block an OutlineCtx with no ops (no editing/dragging), `stateFor` (marker reads
 * written-state — done = check), and `clampBeats` (2-line beats). Navigation:
 *   · click chapter → toggle expand/collapse + open (set ?chap)
 *   · click scene   → toggle expand/collapse + open (set ?chap + ?sc)
 */
export function StoryRail({ acts, beatStates, colorFor, threads }: Props) {
  const { chap, sc, select } = useWriteSelection();
  const activeChapId = chap;
  const activeSceneId = sc;

  const [railOpen, setRailOpen] = useState(() => localStorage.getItem('cv2:rail') !== 'closed');
  const [openCh, setOpenCh] = useState<Set<string>>(() => new Set());

  const trackRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLDivElement>(null);

  // Default-open the active chapter once it's known.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || activeChapId == null) return;
    seededRef.current = true;
    setOpenCh((p) => new Set(p).add(String(activeChapId)));
  }, [activeChapId]);

  // Scroll the current chapter into view on mount.
  useEffect(() => {
    const tr = trackRef.current;
    const cur = curRef.current;
    if (tr && cur) tr.scrollLeft = Math.max(0, cur.offsetLeft - 48);
  }, []);

  const toggleCh = (id: string) =>
    setOpenCh((p) => {
      const x = new Set(p);
      if (x.has(id)) { x.delete(id); } else { x.add(id); }
      return x;
    });

  const toggleRail = () =>
    setRailOpen((v) => { const n = !v; localStorage.setItem('cv2:rail', n ? 'open' : 'closed'); return n; });

  // ── the read-only OutlineCtx the scene block reads ──
  const edit = useBeatEdit(undefined, () => undefined); // never used (readOnly)
  const threadFor = useCallback(
    (fromRough?: string): ThreadVisual => ({ color: colorFor(fromRough), lane: 0, active: false, isNew: false }),
    [colorFor],
  );
  const numFor = useCallback(() => null, []);
  const stateFor = useCallback(
    (beat: any): BeatDisplayState | undefined => beatStates[beat.id],
    [beatStates],
  );
  const ctx = useMemo<OutlineCtxValue>(
    () => ({ readOnly: true, ops: undefined, edit, threadFor, numFor, stateFor, clampBeats: true }),
    [edit, threadFor, numFor, stateFor],
  );

  // adapt the rail's scene shape to what OutlineSceneBlock reads (title→text,
  // thread→from_rough); ids are preserved so stateFor keys still resolve.
  const adaptScene = (s: OutlineSceneNode) => ({
    id: s.id,
    text: s.title,
    beats: (s.beats ?? []).map((b) => ({ ...b, from_rough: b.thread })),
  });

  const renderChapter = (ch: OutlineChapterNode) => {
    const isCurrent = String(ch.id) === String(activeChapId);
    const isOpen = openCh.has(String(ch.id));
    return (
      <div
        key={ch.id}
        ref={isCurrent ? curRef : null}
        className={`rail-chapter${isCurrent ? ' is-current' : ''}${isOpen ? ' is-open' : ''}`}
        style={{ minWidth: 0 }}
      >
        <CollapsibleHead
          open={isOpen}
          onToggle={() => { toggleCh(String(ch.id)); select(ch.id, null); }}
          indent={IND_CHAPTER}
          num={`ch${ch.n}`}
          title={<span className="cm-osc-title">{ch.title || 'Untitled'}</span>}
          trailing={ch.scenes.length > 0 ? <span className="cm-osc-count">{ch.scenes.length}</span> : null}
        />
        {isOpen ? (
          <div className="rail-scenes">
            {ch.scenes.map((scene) => (
              <div key={scene.id} style={{ flex: '0 0 auto', width: 210 }}>
                <OutlineSceneBlock
                  scene={adaptScene(scene)}
                  chapId={String(ch.id)}
                  n={scene.n}
                  numPrefix="sc"
                  active={String(scene.id) === String(activeSceneId)}
                  onOpen={() => select(ch.id, scene.id)}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <footer className="rail">
      <div
        className="rail-head cursor-pointer"
        role="button"
        tabIndex={0}
        aria-expanded={railOpen}
        title={railOpen ? 'Collapse the story thread' : 'Expand the story thread'}
        onClick={toggleRail}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRail(); } }}
      >
        <span className="rail-collapse">
          <span className={`rail-collapse-caret${railOpen ? ' is-open' : ''}`}>
            <ChevronDown size={12} strokeWidth={1.9} />
          </span>
          <Layers3 size={13} strokeWidth={1.9} />
          Story thread
        </span>
        <div className="rail-legend">
          {threads.map((t) => (
            <span key={t.id} className="rail-leg">
              <i style={{ background: t.color }} />
              {t.name}
            </span>
          ))}
        </div>
      </div>

      {railOpen ? (
        <OutlineCtx.Provider value={ctx}>
          <div className="rail-track" ref={trackRef}>
            {acts.map((act) => (
              <div key={act.id} className={`rail-act${act.chapters.some((c) => String(c.id) === String(activeChapId)) ? ' is-current' : ''}`}>
                <div className="rail-act-label">
                  <span className="rail-act-dot" />
                  {act.name}
                </div>
                <div className="rail-act-chapters">{act.chapters.map((ch) => renderChapter(ch))}</div>
              </div>
            ))}
          </div>
        </OutlineCtx.Provider>
      ) : null}
    </footer>
  );
}
