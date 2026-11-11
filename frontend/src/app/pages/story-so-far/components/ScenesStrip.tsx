import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';

/**
 * The scenes strip — a 3-view track ported from the refined handoff
 * (04-story-so-far.html + behavior/04-story-so-far.md C1):
 *   Scenes   — flat draggable timeline with a chapter-bracket overlay
 *   Chapters — chapters as cards with nested mini-scenes + progress
 *   Recent   — last-active chapters as a vertical list
 * View choice persists in localStorage. Chapter grouping is derived (one
 * chapter for now — real chapter data arrives when scenes wire to the outline).
 */
const VIEW_KEY = 'writerverse.story-so-far.view';
const COUNTERS = {
  scenes: '{n} of ? · drag to reorder',
  chapters: '1 chapter · {n} scenes · drag to reorder',
  recent: 'last activity · newest first',
};

// Bucket the flat scenes into chapters using the chapter fields the outline
// loader attaches to each scene. Falls back to a single bucket if scenes don't
// carry chapter info.
function toChapters(scenes) {
  if (!scenes.length) return [];
  if (!scenes[0].chapterId) {
    return [{ id: 'ch1', n: 1, title: 'untitled', scenes, current: true }];
  }
  const order = [];
  const byId = new Map();
  for (const s of scenes) {
    const key = s.chapterId;
    if (!byId.has(key)) {
      const ch = {
        id: key,
        n: s.chapterNumber ?? order.length + 1,
        title: s.chapterTitle || 'untitled',
        scenes: [],
        current: false,
      };
      byId.set(key, ch);
      order.push(ch);
    }
    byId.get(key).scenes.push(s);
  }
  if (order.length) order[order.length - 1].current = true;
  return order;
}

function SortableScene({ scene, index }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 };
  return (
    <div ref={setNodeRef} style={style} className={`wv2-scene done${isDragging ? ' dragging' : ''}`} {...attributes} {...listeners}>
      <div className="wv2-pill">{index + 1}</div>
      <div className="wv2-ttl">{scene.label}</div>
    </div>
  );
}

export function ScenesStrip({ scenes, onReorder, onAddScene }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'scenes';
    return localStorage.getItem(VIEW_KEY) || 'scenes';
  });
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ }
  }, [view]);

  function handleDragEnd(e) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(scenes, oldIndex, newIndex));
  }

  const chapters = toChapters(scenes);
  const counterTpl = view === 'chapters'
    ? `${chapters.length} chapter${chapters.length === 1 ? '' : 's'} · {n} scenes · drag to reorder`
    : COUNTERS[view];
  const counter = counterTpl.replace('{n}', String(scenes.length));
  const empty = scenes.length === 0;

  return (
    <section className="wv2-scenes-strip">
      <div className="wv2-strip-head">
        <div className="wv2-strip-h">
          The scenes <span className="wv2-ct">{counter}</span>
        </div>
        <div className="wv2-strip-right">
          <div className="wv2-view-toggle" role="tablist" aria-label="scene track view">
            {['scenes', 'chapters', 'recent'].map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                className={view === v ? 'on' : ''}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button className="wv2-btn wv2-btn-ghost wv2-btn-sm" onClick={onAddScene}>
            <Plus strokeWidth={1.9} />
            add a scene
          </button>
        </div>
      </div>

      {empty ? (
        <div className="wv2-scenes-empty">
          <p className="wv2-empty">No scenes yet</p>
        </div>
      ) : view === 'scenes' ? (
        <div className="wv2-view">
          <div className="wv2-chap-rail" aria-hidden="true">
            {chapters.map((ch, i) => (
              <div
                key={ch.id}
                className="wv2-chap-bracket"
                style={{ flex: `0 0 ${ch.scenes.length * 92}px`, marginLeft: i === 0 ? 0 : 6 }}
              >
                <div className="wv2-bracket-lbl"><b>Ch {ch.n}</b> · <em>{ch.title}</em></div>
                <div className="wv2-bracket-arc" />
              </div>
            ))}
            <div className="wv2-chap-bracket next" style={{ flex: '0 0 92px', marginLeft: 6 }}>
              <div className="wv2-bracket-lbl"><b>Ch {chapters.length + 1}</b> · <em>untitled</em></div>
              <div className="wv2-bracket-arc" />
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="wv2-timeline">
              <SortableContext items={scenes.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                {scenes.map((s, i) => (
                  <SortableScene key={s.id} scene={s} index={i} />
                ))}
              </SortableContext>
              <div className="wv2-conn chapbreak" title="chapter break" />
              <div className="wv2-scene empty" role="button" tabIndex={0} onClick={onAddScene}>
                <div className="wv2-pill">+</div>
                <div className="wv2-ttl">next?</div>
              </div>
            </div>
          </DndContext>
        </div>
      ) : view === 'chapters' ? (
        <div className="wv2-view">
          <div className="wv2-chap-grid">
            {chapters.map((ch) => (
              <div key={ch.id} className="wv2-chap-card current">
                <div className="wv2-ch-head">
                  <span className="wv2-ch-num"><span className="wv2-stat-dot" />Ch {ch.n}</span>
                  <span className="wv2-ch-meta">{ch.scenes.length} sc</span>
                </div>
                <div className="wv2-ch-title">{ch.title}</div>
                <div className="wv2-mini-scenes">
                  {ch.scenes.map((s, i) => (
                    <div key={s.id} className="wv2-mini"><span className="wv2-mini-n">{i + 1}</span><span className="wv2-mini-t">{s.label}</span></div>
                  ))}
                  <div className="wv2-mini empty" title="add a scene" role="button" tabIndex={0} onClick={onAddScene}>+ add scene</div>
                </div>
                <div className="wv2-ch-progress"><span style={{ width: '75%' }} /></div>
              </div>
            ))}
            <div className="wv2-chap-card empty" role="button" tabIndex={0} onClick={onAddScene}>
              <span className="wv2-plus">+</span>
              <span>add a chapter</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="wv2-view">
          <div className="wv2-recent-chaps">
            {chapters.map((ch) => (
              <div key={ch.id} className="wv2-recent-chap current">
                <div className="wv2-ch-badge"><span className="wv2-badge-lbl">Ch</span><span className="wv2-badge-num">{ch.n}</span></div>
                <div className="wv2-recent-body">
                  <div className="wv2-recent-top">
                    <h5>{ch.title}</h5>
                    <span className="wv2-recent-meta">{ch.scenes.length} scenes</span>
                  </div>
                  <div className="wv2-scene-dots">
                    {ch.scenes.map((s, i) => (
                      <button key={s.id} className="wv2-sdot"><span className="wv2-sdot-n">{i + 1}</span><span className="wv2-sdot-t">{s.label}</span></button>
                    ))}
                    <button className="wv2-sdot empty" onClick={onAddScene}><span className="wv2-sdot-t">+ next scene</span></button>
                  </div>
                </div>
                <div className="wv2-recent-when"><b>2m ago</b>active</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
