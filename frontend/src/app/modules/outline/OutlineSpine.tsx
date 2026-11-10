import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useBeatEditSignal } from '../../components/beatFocus';
import type { OutlineOps } from './useOutlineModel';
import {
  OutlineCtx,
  useBeatEdit,
  Caret,
  EditableHeading,
  CollapsibleHead,
  OutlineSceneBlock,
  IND_CHAPTER,
  IND_SCENE,
  type OutlineCtxValue,
  type ThreadVisual,
} from './OutlineSceneBlock';
import './outlineSpine.css';
import '../../pages/write/v2/chaptersV2.css';

/**
 * OutlineSpine — the grand outline for the merge workspace, wearing the ChaptersV2
 * drawer's "expand-all" look (the `cm-*` classes under a neutralised `.cm2v2`).
 * Acts → chapters → scenes. The scene unit lives in <OutlineSceneBlock> (a reusable
 * component, shared with the chapters rail); this file owns the act/chapter tree,
 * the "new scene" drop row, and the edit/thread state it hands down via OutlineCtx.
 *
 * Must sit inside an <OutlineDnd> ancestor so a plot-thread beat dragged from the
 * left column resolves onto a scene/beat drop target here.
 */

const LANE_CAP = 4;

interface ThreadSummary { id: string; name: string; color: string; }

interface OutlineSpineProps {
  outline: any;
  threads?: ThreadSummary[];
  activeThreadId?: string | null;
  ops?: OutlineOps;
  proposalThreadId?: string | null;
  /** Source-beat id (`from_item`) → its number within its thread. */
  numByItem?: Map<string, number>;
}

/* the "new scene" row — clicking adds an empty scene; dropping a thread beat on it
 * creates a fresh scene seeded with that beat (via add_scene_with_beats). Lights up
 * as a full scene-sized drop zone (reuses the scene `is-current` tint). */
function NewSceneRow({ chapterId }: { chapterId: string }) {
  const { readOnly, ops } = useContext(OutlineCtx);
  const drop = useDroppable({ id: `ospnewscene:${chapterId}`, data: { type: 'new-scene', chapterId }, disabled: readOnly });
  const { active, over } = useDndContext();
  const lit = !!active && String(over?.id) === `ospnewscene:${chapterId}`;
  if (readOnly) return null;
  return (
    <div ref={drop.setNodeRef} className={`cm-osc${lit ? ' is-current' : ''}`} style={{ marginTop: 2, opacity: lit ? 1 : 0.7 }}>
      <div
        className="cm-osc-head"
        style={{ paddingLeft: IND_SCENE, cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onClick={() => ops!.add('scene', chapterId)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ops!.add('scene', chapterId); } }}
      >
        <span className="cm-osc-caret"><Plus size={12} strokeWidth={2.2} /></span>
        <span className="cm-osc-num" style={{ background: 'transparent' }} />
        <span className="cm-osc-title">{lit ? 'Drop to create a new scene' : 'New scene'}</span>
        <span />
      </div>
    </div>
  );
}

function ChapterSection({ chapter, n }: { chapter: any; n: number }) {
  const { readOnly, ops } = useContext(OutlineCtx);
  const scenes: any[] = chapter.scenes ?? [];
  const [open, setOpen] = useState(true);
  return (
    <div className="cm-chapter">
      <CollapsibleHead
        open={open}
        onToggle={() => setOpen((o) => !o)}
        indent={IND_CHAPTER}
        num={`ch${chapter.n ?? n}`}
        title={
          <EditableHeading
            titleClass="cm-chapter-title" value={chapter.text || ''} placeholder="untitled chapter"
            kind="chapter" itemId={chapter.id} chapId={chapter.id}
            onSave={(t) => ops!.update('chapter', chapter.id, { text: t })}
            onEnter={() => ops!.add('scene', chapter.id)}
          />
        }
        trailing={!readOnly && (
          <button type="button" className="osp-del osp-del-node" title="Delete chapter" onClick={() => ops!.remove('chapter', chapter.id)}>×</button>
        )}
      />
      {open && (
        <>
          {scenes.map((sc, i) => (
            <OutlineSceneBlock key={sc.id} scene={sc} chapId={chapter.id} n={i + 1} numPrefix="sc" />
          ))}
          <NewSceneRow chapterId={chapter.id} />
        </>
      )}
    </div>
  );
}

function ActSection({ act }: { act: any }) {
  const { readOnly, ops } = useContext(OutlineCtx);
  const chapters: any[] = act.chapters ?? [];
  const [open, setOpen] = useState(true); // acts open by default
  return (
    <div className="cm-act is-current">
      <div
        className="cm-act-row"
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen((o) => !o); } }}
      >
        <Caret open={open} onToggle={() => setOpen((o) => !o)} />
        <EditableHeading
          titleClass="cm-act-title" value={act.text || ''} placeholder="untitled act"
          kind="act" itemId={act.id} chapId={act.id}
          onSave={(t) => ops!.update('act', act.id, { text: t })}
          onEnter={() => ops!.addChapter(act.id)}
        />
        <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <b>{chapters.length} ch</b>
          {!readOnly && (
            <button type="button" className="osp-del osp-del-node" title="Delete act" onClick={() => ops!.remove('act', act.id)}>×</button>
          )}
        </span>
      </div>
      {open && (
        <div className="cm-chapters">
          {chapters.map((ch, i) => (
            <ChapterSection key={ch.id} chapter={ch} n={i + 1} />
          ))}
          {!readOnly && (
            <button type="button" className="osp-add" style={{ marginLeft: IND_CHAPTER }} onClick={() => ops!.addChapter(act.id)}>+ chapter</button>
          )}
        </div>
      )}
    </div>
  );
}

export function OutlineSpine({
  outline,
  threads = [],
  activeThreadId,
  ops,
  proposalThreadId,
  numByItem,
}: OutlineSpineProps) {
  const readOnly = !ops || !!proposalThreadId;
  const acts: any[] = useMemo(() => outline?.acts ?? [], [outline]);

  // pending merge-proposal ghost beats across the outline — the "accept all" count.
  const proposalCount = useMemo(() => {
    let n = 0;
    for (const a of acts)
      for (const c of a.chapters ?? [])
        for (const s of c.scenes ?? [])
          for (const b of s.beats ?? []) if (b?.proposal) n++;
    return n;
  }, [acts]);

  const numFor = useCallback(
    (fromItem?: string) => (fromItem != null ? numByItem?.get(fromItem) ?? null : null),
    [numByItem],
  );

  const threadIndex = useMemo(() => {
    const m = new Map<string, { color: string; lane: number }>();
    threads.forEach((t, i) => m.set(t.id, { color: t.color, lane: i }));
    return m;
  }, [threads]);

  const threadFor = useCallback(
    (fromRough?: string): ThreadVisual => {
      const th = fromRough ? threadIndex.get(fromRough) : undefined;
      return {
        color: th?.color,
        lane: th ? (th.lane % LANE_CAP) + 1 : 0,
        active: !!fromRough && fromRough === activeThreadId,
        isNew: !!proposalThreadId && fromRough === proposalThreadId,
      };
    },
    [threadIndex, activeThreadId, proposalThreadId],
  );

  const beatsById = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of acts) for (const c of a.chapters ?? []) for (const s of c.scenes ?? []) for (const b of s.beats ?? []) m.set(b.id, b);
    return m;
  }, [acts]);
  const beatsByIdRef = useRef(beatsById);
  beatsByIdRef.current = beatsById;
  const resolve = useCallback((id: string) => beatsByIdRef.current.get(id), []);

  const edit = useBeatEdit(ops, resolve);
  const owns = useCallback((id: string) => beatsByIdRef.current.has(id), []);
  useBeatEditSignal(owns, edit.openById);

  const ctx = useMemo<OutlineCtxValue>(() => ({ readOnly, ops, edit, threadFor, numFor }), [readOnly, ops, edit, threadFor, numFor]);

  // `.cm2v2` carries the cm-* visual rules but is also that page's grid layout —
  // neutralise the layout bits (inline, layout-only) so only the look applies here.
  const scopeReset: React.CSSProperties = { display: 'block', height: 'auto', minHeight: 0, padding: 0, overflow: 'visible' };

  return (
    <OutlineCtx.Provider value={ctx}>
      <div className="cm2v2" style={scopeReset}>
        {!acts.length ? (
          <p className="cm-outline-empty">No outline yet.</p>
        ) : (
          <div className="cm-outline">
            {!readOnly && proposalCount > 0 && (
              <div className="flex justify-end mb-2">
                <button type="button" className="kit-acceptall" onClick={() => ops!.acceptAllBeats()}>
                  ✓ Accept all · {proposalCount}
                </button>
              </div>
            )}
            {acts.map((a, i) => (
              <ActSection key={a.id ?? i} act={a} />
            ))}
            {!readOnly && (
              <button type="button" className="osp-add osp-add-act" onClick={() => ops!.add('act')}>+ act</button>
            )}
          </div>
        )}
      </div>
    </OutlineCtx.Provider>
  );
}
