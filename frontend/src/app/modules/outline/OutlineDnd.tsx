import { createContext, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import './outlineSpine.css'; // .tho-drag-ghost (the drag overlay label)

/* Resolve to the droppable under the pointer; when a beat insert-point and its
 * enclosing scene both match (nested), prefer the beat so precise inserts win and
 * the whole-scene drop is only the fallback for the empty area. */
const dropUnderPointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length <= 1) return hits;
  const precise = hits.filter((h) => (h.data?.droppableContainer as any)?.data?.current?.type !== 'scene');
  return precise.length ? precise : hits;
};

/**
 * The single dnd-kit context shared by a drag SOURCE (a plot-thread card's beat)
 * and the drop TARGETS inside <ThreadedOutline> (scenes + outline beats). It must
 * wrap BOTH for a cross-component drag to resolve — on the threads page that's
 * the cards column + the rail; in a standalone drawer it's just the outline.
 *
 * Two drag kinds flow through one `onDragEnd`:
 *   · thread-beat  → place into a scene (drop on a beat = insert before it,
 *                    drop on the scene's tail zone = append)
 *   · outline-beat → reorder within its own scene (cross-scene moves are ignored)
 *
 * Drop semantics live here; the visuals (armed tail zones, insert lines) read
 * `OutlineDragActiveCtx` so they only light up mid-drag.
 */

// True between dragstart and dragend — lets drop zones grow into easy targets.
export const OutlineDragActiveCtx = createContext(false);

// ── droppable / draggable data shapes (read off active/over in onDragEnd) ──
export interface ThreadBeatDrag {
  type: 'thread-beat';
  /** place_thread_beat payload — { threadId, itemId, text, kind }. */
  payload: any;
  label?: string;
}
export interface OutlineBeatDrag {
  type: 'outline-beat';
  sceneId: string;
  beatId: string;
  index: number;
  label?: string;
}
export interface BeatDrop {
  type: 'outline-beat';
  sceneId: string;
  /** Insert-before index of this beat within its scene. */
  index: number;
}
export interface SceneDrop {
  type: 'scene';
  sceneId: string;
}
export interface NewSceneDrop {
  type: 'new-scene';
  chapterId: string;
}

interface OutlineDndProps {
  /** Place an incoming thread-card beat into a scene. `index` < 0 = append. */
  onPlace: (sceneId: string, index: number, payload: any) => void;
  /** Reorder an existing outline beat within its scene to an absolute index. */
  onReorderBeat?: (sceneId: string, beatId: string, toIndex: number) => void;
  /** Drop a thread beat onto a chapter's "new scene" zone → create a scene + seed it. */
  onPlaceNewScene?: (chapterId: string, payload: any) => void;
  children: React.ReactNode;
}

export function OutlineDnd({ onPlace, onReorderBeat, onPlaceNewScene, children }: OutlineDndProps) {
  // distance:5 keeps a plain click (open-to-edit) from registering as a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [active, setActive] = useState<{ label: string } | null>(null);

  function handleDragStart(e: DragStartEvent) {
    const d = e.active.data.current as any;
    setActive({ label: d?.label ?? '' });
  }

  function handleDragEnd(e: DragEndEvent) {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const src = a.data.current as ThreadBeatDrag | OutlineBeatDrag | undefined;
    const dst = over.data.current as BeatDrop | SceneDrop | NewSceneDrop | undefined;
    if (!src || !dst) return;

    // a thread beat dropped on a chapter's "new scene" zone → make a fresh scene
    if (dst.type === 'new-scene') {
      if (src.type === 'thread-beat') onPlaceNewScene?.(dst.chapterId, src.payload);
      return;
    }

    const sceneId = dst.sceneId;
    const index = dst.type === 'scene' ? -1 : dst.index; // scene drop = append

    if (src.type === 'thread-beat') {
      onPlace(sceneId, index, src.payload);
    } else if (src.type === 'outline-beat' && onReorderBeat) {
      if (src.sceneId !== sceneId) return; // within-scene reorder only
      onReorderBeat(sceneId, src.beatId, index);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      // resolve the droppable the cursor is actually inside (a hovered beat wins
      // over its enclosing scene). While over the thread column `over` stays null,
      // so the outline shows no phantom drop zone.
      collisionDetection={dropUnderPointer}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <OutlineDragActiveCtx.Provider value={!!active}>
        {children}
      </OutlineDragActiveCtx.Provider>
      <DragOverlay dropAnimation={null}>
        {active ? <div className="tho-drag-ghost">{active.label || 'beat'}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
