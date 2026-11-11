import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { queries } from '../../queries';
import { callOp } from '../../gateway';
import { receipt } from '../../modules/receipt/receiptStore';
import { useOutlineModel } from '../../modules/outline/useOutlineModel';
import { OutlineDnd } from '../../modules/outline/OutlineDnd';
import { OutlineDrawer } from '../../modules/threadList/OutlineDrawer';
import { buildNestedActs, type StructurePreset } from '../../modules/threadList/BaseOutlinePicker';
import { Button } from '../../ui';
import { MergeThreadBlock } from './MergeThreadBlock';

/* MergePage — the dedicated "weave threads into one outline" workspace, reached at
 * /project/:projectId/merge. Self-contained: threads (drag sources) on the left,
 * the live grand outline (drop targets) on the right, with ONE page-local
 * <OutlineDnd> owning the drag/drop handlers. No shared editable thread block, no
 * portal, no global merge context — concerns stay on this page. */

export function MergePage() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const { data } = useQuery(queries.plotThreads(projectId));
  const threads = ((data as any)?.threads ?? []) as any[];

  const { grandOutline, ops } = useOutlineModel(projectId);
  const hasOutline = (grandOutline?.acts?.length ?? 0) > 0;

  const threadSummaries = useMemo(
    () => threads.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    [threads],
  );

  // source-beat id → its number within its thread, 1..N over ALL beats (headings
  // included) — matching MergeThreadBlock so a placed beat keeps its column number
  // wherever (and however many times) it lands.
  const numByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of threads) {
      (t.beats ?? []).forEach((b: any, i: number) => m.set(b.id, i + 1));
    }
    return m;
  }, [threads]);

  // a source beat reads "placed" once a scene beat carries its id as from_item
  const placed = useMemo(() => {
    const s = new Set<string>();
    for (const a of grandOutline?.acts ?? [])
      for (const c of a.chapters ?? [])
        for (const sc of c.scenes ?? [])
          for (const b of sc.beats ?? [])
            if (b.from_item) s.add(b.from_item);
    return s;
  }, [grandOutline]);

  // picking a scaffold creates the real grand outline (init_grand_outline)
  const chooseStructure = (p: StructurePreset) => ops.init({ acts: buildNestedActs(p.top, p.unit, 3, 6) });
  const chooseCustom = (top: string, unit: string, count: number) => {
    const tt = (top || '').trim();
    const uu = (unit || 'Chapter').trim() || 'Chapter';
    ops.init({ acts: buildNestedActs(tt, uu, tt ? 3 : 1, count) });
  };

  const [mergingThreadId, setMergingThreadId] = useState<string | null>(null);
  const handleMerge = useCallback(async (threadId: string) => {
    if (!projectId || mergingThreadId) return;
    // Merge skips placed beats (wrt-47); with none left it would do nothing, so say why.
    const beats = threads.find((t) => t.id === threadId)?.beats ?? [];
    if (beats.length && beats.every((b: any) => placed.has(b.id))) {
      receipt('Every beat in this thread is already in the outline');
      return;
    }
    setMergingThreadId(threadId);
    try {
      await callOp(projectId, 'run_merge_rough_into_grand', { rough_id: threadId }, 'plot-threads');
    } catch {
      // The gateway already told the author (problem toast, or an
      // extension's own message) — just don't leave an unhandled rejection.
    } finally {
      setMergingThreadId(null);
    }
  }, [projectId, mergingThreadId, threads, placed]);

  const goBack = () => projectId && navigate(`/project/${projectId}/plot-threads`);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--surface)]">
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-[var(--line)]">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft size={15} /> Done merging
        </Button>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]" style={{ fontFamily: 'var(--ui)' }}>
            {hasOutline ? 'Weaving into one story' : 'First, the spine'}
          </span>
          <span className="text-[15px] font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--serif)' }}>
            {hasOutline ? 'Merge into the grand outline' : 'Choose a base outline'}
          </span>
        </div>
      </div>

      <OutlineDnd
        onPlace={(sceneId, index, payload) => ops.dropBeat(sceneId, index, payload)}
        onReorderBeat={(_sceneId, beatId, toIndex) => ops.reorderTo('beat', beatId, toIndex)}
        onPlaceNewScene={(chapterId, payload) => ops.dropNewScene(chapterId, payload)}
      >
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 basis-0 min-h-0 overflow-auto p-4 border-r border-[var(--line)]">
            {threads.length === 0 ? (
              <div className="text-[13px] italic text-[var(--ink-3)]">No threads to merge yet.</div>
            ) : (
              threads.map((t) => (
                <MergeThreadBlock key={t.id} projectId={projectId} thread={t} placed={placed}
                  onMerge={handleMerge} merging={mergingThreadId === t.id} />
              ))
            )}
          </div>
          <div className="flex-1 basis-0 min-h-0 overflow-auto p-4">
            <OutlineDrawer
              outline={grandOutline}
              threads={threadSummaries}
              ops={ops}
              numByItem={numByItem}
              onStructure={chooseStructure}
              onCustom={chooseCustom}
            />
          </div>
        </div>
      </OutlineDnd>
    </div>
  );
}

export default MergePage;
