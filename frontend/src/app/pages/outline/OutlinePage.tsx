import { useMemo, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LucideMerge, ListTree, ScanEye } from 'lucide-react';
import './outline.css';
import { PageHeader } from '../../components/PageHeader';
import { PageShell } from '../../components/PageShell';
import { Button, Chip } from '../../ui';
import { queries } from '../../queries';
import { useOutlineModel } from '../../modules/outline/useOutlineModel';
import { FlatOutline } from '../../modules/outline/FlatOutline';
import { outlineChapters } from '../../modules/outline/tree';
import { ChapterMarginEntry } from '../../modules/outline/OutlineMargin';
import { OutlineDnd } from '../../modules/outline/OutlineDnd';
import { OutlineScaffoldPickerFull } from './components/OutlineScaffoldPickerFull';
import { LoadState } from '../../components/LoadError';
import { LensKit } from '../../modules/lensKit';
import { MarginBlock, MarginOverlay, type MarginItem } from '../../modules/margin';
import { WorldSectionEntry } from '../world/components/WorldMargin';

// The two docking sections, shared by the in-flow traveler (gutter) and the
// off-screen overlay dock — same icon-box entry both places (onClick = scrollTo
// in the overlay), exactly like WorldPage / Character Studio.
const sectionEntry = (id: 'outline' | 'lenses', onClick?: () => void) =>
  id === 'outline' ? (
    <WorldSectionEntry icon={<ListTree size={17} strokeWidth={1.8} />} label="Grand outline" sub="acts, chapters & scenes" onClick={onClick} />
  ) : (
    <WorldSectionEntry icon={<ScanEye size={17} strokeWidth={1.8} />} label="Lenses" sub="analysis" onClick={onClick} />
  );

export function OutlinePage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { grandOutline, ops, status, reload } = useOutlineModel(projectId);

  const { data: threadsData } = useQuery(queries.plotThreads(projectId));
  const threads = useMemo(
    () => (((threadsData as any)?.threads ?? []) as any[]).map((t) => ({ id: String(t.id), name: t.name, color: t.color })),
    [threadsData],
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggleThread = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // "Grand outline" is a collapsible section (like a Character Studio section):
  // collapsing it hides the whole chapter stack AND its docks.
  const [outlineOpen, setOutlineOpen] = useState(true);

  // overlay: anchor ref measures the gutter column; items drive the docks.
  // Between the two sections we splice one indented dock per VISIBLE chapter —
  // only while the section is open — exactly as threads dock under Outline in the
  // Character Studio.
  const gutterAnchorRef = useRef<HTMLDivElement>(null);
  const chapters = useMemo(() => outlineChapters(grandOutline, selected), [grandOutline, selected]);
  const overlayItems: MarginItem[] = useMemo(
    () => [
      { id: 'outline', render: (s) => sectionEntry('outline', s) },
      ...(outlineOpen
        ? chapters.map((ch): MarginItem => ({
          id: ch.id,
          render: (s) => (
            <div className="origin-left scale-[0.88] pl-3">
              <ChapterMarginEntry n={ch.n} title={ch.text} onClick={s} />
            </div>
          ),
        }))
        : []),
      { id: 'lenses', render: (s) => sectionEntry('lenses', s) },
    ],
    [outlineOpen, chapters],
  );

  const empty = !grandOutline || !grandOutline.acts?.length;

  if (status !== 'ready') {
    return (
      <div className="wv2-init-page">
        <LoadState status={status} what="your outline" onRetry={() => void reload()} />
      </div>
    );
  }

  if (empty) {
    return (
      <div className="wv2-init-page">
        <div className="wv2-init-stage">
          <OutlineScaffoldPickerFull onInit={ops.init} />
        </div>
      </div>
    );
  }

  return (
    // OutlineDnd wraps the WHOLE shell so its single drag/drop context spans every
    // page-level chapter <MarginBlock> (beats reorder across chapters). It renders
    // no DOM wrapper, so the PageShell layout is unchanged.
    <OutlineDnd
      onPlace={(sceneId, index, payload) => ops.dropBeat(sceneId, index, payload)}
      onReorderBeat={(_sceneId, beatId, toIndex) => ops.reorderTo('beat', beatId, toIndex)}
      onPlaceNewScene={(chapterId, payload) => ops.dropNewScene(chapterId, payload)}
    >
      <PageShell
        header={
          <PageHeader
            section="outline"
            eyebrow="Plan · outline"
            title="Grand outline"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => projectId && navigate(`/project/${projectId}/merge`)}
              >
                <LucideMerge size={14} /> Merge threads in
              </Button>
            }
          />
        }
        overlay={<MarginOverlay items={overlayItems} anchorRef={gutterAnchorRef} />}
      >
        {/* ── SECTION: Grand outline (collapsible — gutter entry toggles it) ── */}
        <MarginBlock
          id="outline"
          gutter={<div ref={gutterAnchorRef}>{sectionEntry('outline', () => setOutlineOpen((o) => !o))}</div>}
        >
          {outlineOpen && threads.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 mb-2 pb-2.5 border-b border-border">
              {threads.map((t) => (
                <Chip
                  key={t.id}
                  variant="filter"
                  pressed={selected.has(t.id)}
                  dot={t.color}
                  onClick={() => toggleThread(t.id)}
                  role="button"
                  tabIndex={0}
                >
                  {t.name}
                </Chip>
              ))}
              {selected.size > 0 && (
                <button
                  type="button"
                  className="ml-1 text-[12px] text-[var(--ink-3)] hover:text-[var(--ink)] underline"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </MarginBlock>

        {/* chapters — page-level margin blocks emitted by FlatOutline (marginAware);
            each chapter rides the main gutter as an indented sub-margin and docks
            via the overlay. Shown only while the section is open. */}
        {outlineOpen && (
          <FlatOutline
            marginAware
            outline={grandOutline}
            ops={ops}
            threads={threads}
            filterThreadIds={selected}
            onOpenChapter={(chapId) => projectId && navigate(`/project/${projectId}/chapters?chap=${chapId}`)}
          />
        )}

        {/* ── SECTION: Lenses ── */}
        <MarginBlock id="lenses" className="mt-8" gutter={sectionEntry('lenses')}>
          <LensKit
            type="page"
            where="outline"
            variant="workspace"
            showHead={false}
            threads={threads}
          />
        </MarginBlock>
      </PageShell>
    </OutlineDnd>
  );
}
