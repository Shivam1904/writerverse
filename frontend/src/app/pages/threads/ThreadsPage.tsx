import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spline, ScanEye, Sparkles, Users, Shapes, ChevronRight, LucideMerge } from 'lucide-react';
import { Button } from '../../ui';
import './threads.css';
import '../world/world.css';
import '../characters/studio.css';
import { PageHeader } from '../../components/PageHeader';
import { PageShell } from '../../components/PageShell';
import { ThreadMarginEntry } from './components/ThreadMarginEntry';
import { WorldSectionEntry } from '../world/components/WorldMargin';
import { DraftActions } from './components/DraftActions';
import { StorySeedSuggestions, useStorySeeds } from './components/StorySeedSuggestions';
import { ThreadSuggestions, useThreadSuggestionCards } from './components/ThreadSuggestions';
import { MarginOverlay, MarginBlock, type MarginItem } from '../../modules/margin';
import { OutlineDnd } from '../../modules/outline/OutlineDnd';
import { GenerateIdeasPopover } from '../../components/GenerateIdeasPopover';
import { NewThreadModal } from './components/NewThreadModal';
import { ScaffoldPickerModal } from '../characters/components/ScaffoldPickerModal';
import { EditThreadModal } from './components/EditThreadModal';
import { ThreadsList } from '../../modules/threadList/ThreadsList';
import { ThreadsStart } from './components/ThreadsStart';
import { LoadState } from '../../components/LoadError';
import { LensKit } from '../../modules/lensKit';
import { useThreadsPage } from './useThreadsPage';

export function ThreadsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const t = useThreadsPage(projectId);
  const threads = t.threads;

  // The header's merge button mirrors the per-block weave affordance: both just
  // open the dedicated merge workspace (/project/:projectId/merge), where the
  // author drags thread beats into the grand outline. Same destination as
  // ThreadsList's goMerge.
  const goMerge = () => { if (projectId) navigate(`/project/${projectId}/merge`); };

  // The "Create" section gathers pending story seeds + suggested storylines. It
  // only exists when one of those has content (same hooks the blocks render from).
  const storySeeds = useStorySeeds();
  const threadSuggestions = useThreadSuggestionCards();
  const hasCreate = storySeeds.length > 0 || threadSuggestions.length > 0;

  // ── Margin: the storylines split into three SECTIONS — Character / Entity /
  // Story threads — each an icon-box entry (shared with World/Studio), followed
  // by Lenses. Each thread keeps its glossy <ThreadMarginEntry> traveler in the
  // gutter, but only the SECTION headings dock: the sections are listed in the
  // overlay, the individual threads are not, so they scroll past instead of
  // sticking. Threads are bucketed by scope.type: `character` → Character, `story`
  // (or unscoped) → Story, everything else (item/location/relationship/theme/
  // rule/other) → Entity. Empty buckets are dropped.
  const threadSections = useMemo(() => {
    const character: any[] = [];
    const entity: any[] = [];
    const story: any[] = [];
    for (const th of threads) {
      const type = th.scope?.type;
      if (type === 'character') character.push(th);
      else if (type === 'story' || !type) story.push(th);
      else entity.push(th);
    }
    return [
      { id: '__char', label: 'Character threads', icon: <Users size={17} strokeWidth={1.8} />, noun: 'character thread', list: character },
      { id: '__entity', label: 'Entity threads', icon: <Shapes size={17} strokeWidth={1.8} />, noun: 'entity thread', list: entity },
      { id: '__story', label: 'Story threads', icon: <Spline size={17} strokeWidth={1.8} />, noun: 'story thread', list: story },
    ].filter((s) => s.list.length > 0);
  }, [threads]);

  // Each thread section's body header toggles its thread list in/out of view.
  // Default-expanded; clicking the body header (not the gutter marker) collapses.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (id: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const gutterAnchorRef = useRef<HTMLDivElement>(null);
  // In the empty state the page header (and its Generate button) is hidden, so
  // the generate popover anchors to the start page's own "Suggest threads"
  // button instead.
  const startSuggestRef = useRef<HTMLButtonElement>(null);

  // The two top-level section headings (same entry in gutter + overlay). The
  // gutter carries the icon + title; the one-line "— desc" lives in the body
  // header (studio idiom), so no `sub` here.
  const sectionEntry = (id: string, onClick?: () => void) => {
    if (id === '__create') {
      return <WorldSectionEntry icon={<Sparkles size={17} strokeWidth={1.8} />} label="Create" onClick={onClick} />;
    }
    if (id === '_empty') {
      return <></>;
    }
    return <WorldSectionEntry icon={<ScanEye size={17} strokeWidth={1.8} />} label="Lenses" onClick={onClick} />;
  };

  // Overlay items, in document order: [create] · for each section its heading
  // then (when expanded) its threads · lenses — `s` is scrollTo. Both the section
  // headings AND the individual threads dock. A COLLAPSED section contributes only
  // its heading: its threads are dropped from the rail entirely, so they vanish
  // from the gutter when collapsed and reappear (docking) when expanded.
  const overlayItems: MarginItem[] = useMemo(() => {
    const items: MarginItem[] = [];
    if (hasCreate) items.push({ id: '__create', render: (s: () => void) => sectionEntry('__create', s) });
    for (const sec of threadSections) {
      items.push({ id: sec.id, render: (s: () => void) => <WorldSectionEntry icon={sec.icon} label={sec.label} onClick={s} /> });
      if (!collapsedSections.has(sec.id)) {
        for (const th of sec.list) {
          items.push({ id: th.id, render: (s: () => void) => threadMargin(th, s) });
        }
      }
    }
    items.push({ id: 'lenses', render: (s: () => void) => sectionEntry('lenses', s) });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadSections, hasCreate, collapsedSections]);

  // Subsection gutter — each thread's heading (header click toggles it).
  const renderThreadGutter = (th: any) => threadMargin(th, () => t.toggleThread(th.id));

  // The shared draft affordance — a primary "Create thread" + an AI ✦ that
  // expands into Create / Expand from ideas / Invent scaffold. Each call returns
  // a fresh element so the two sections keep independent expand state. The Create
  // section shows the primary label; the Threads section uses the icon-only +.
  const draftActions = (primaryLabel?: string) => (
    <DraftActions
      primaryLabel={primaryLabel}
      onCreateThread={() => t.openScaffolds()}
      onCreate={t.handleExtractPlot}
      onInvent={() => t.openScaffolds('invent')}
      braindumps={t.braindumps}
      onGenerateOpen={() => t.setGenOpen(true)}
      onGenerate={t.handleGenerate}
    />
  );

  if (t.status !== 'ready') {
    return (
      <div className="wv2-init-page">
        <LoadState status={t.status} what="your plot threads" onRetry={() => t.retryLoad()} />
      </div>
    );
  }

  // First touch — no storylines yet. Render the init on the shared full-bleed
  // init stage. Init pages carry no right rail — just the centred takeover.
  if (t.empty) {
    return (
      <>
        <div className="wv2-init-page">
          <div className="wv2-init-stage">
            <ThreadsStart
              projectId={projectId}
              canExtract={t.canExtractPlot}
              beats={t.counts.beats}
              extracting={t.plotExtracting}
              extractQueued={t.plotExtractQueued}
              onExtract={t.handleExtractPlot}
              onSuggest={(seed) => { t.setGenSeed(seed ?? ''); t.setGenOpen(true); }}
              suggestRef={startSuggestRef}
              onNewThread={t.openNewThread}
            />
          </div>
        </div>

        {t.newOpen && (
          <NewThreadModal
            projectId={projectId}
            initial={t.threadInitial}
            onClose={() => t.setNewOpen(false)}
            onCreate={t.handleCreateThread}
          />
        )}

        <GenerateIdeasPopover
          open={t.genOpen}
          onClose={() => t.setGenOpen(false)}
          anchorRef={startSuggestRef as any}
          braindumps={t.braindumps}
          initialIdea={t.genSeed}
          title="Generate a plot thread"
          hint="Built from these ideas — untick any to leave out, or jot a new one. The rest stay in mind as context."
          generateLabel="Generate thread"
          busyLabel="Generating…"
          addPlaceholder="add an idea for this thread…"
          saveNote="New ideas are saved to your braindumps."
          onGenerate={t.handleGenerate}
        />
      </>
    );
  }

  return (
    <OutlineDnd
      onPlace={(sceneId, index, payload) => t.outlineModel.ops.dropBeat(sceneId, index, payload)}
      onReorderBeat={(_sceneId, beatId, toIndex) => t.outlineModel.ops.reorderTo('beat', beatId, toIndex)}
    >
      <>
      {/* Standard PageShell geometry (200px gutter, 800px panel) — same on every
          page so the title's left edge is consistent. The old `.thr-page` wrapper
          (a wider 920px panel + 150px gutter) is gone; its dead `.thr-map` rules
          in threads.css were the old grand-outline grid (no longer rendered). */}
      <PageShell
        header={
          <PageHeader
            section="plot-threads"
            eyebrow="Plan · plot threads"
            title="Your storylines"
            suffix={threads.length ? `· ${threads.length}` : undefined}
            caption=""
            actions={
              <div className="flex items-center gap-2">
                {draftActions('Create thread')}
                <Button
                  variant="secondary"
                  size="sm"
                  title="Merge threads into the grand outline"
                  aria-label="Merge threads into the grand outline"
                  onClick={goMerge}
                >
                  <LucideMerge size={15} />
                </Button>
              </div>
            }
          />
        }
        overlay={<MarginOverlay items={overlayItems} anchorRef={gutterAnchorRef} />}
      >
          {/* § Create — pending story seeds + suggested storylines; only when
              there's something to show. Carries the draft buttons. */}
          {hasCreate && (
            <MarginBlock id="__create" gutter={sectionEntry('__create')}>
              <SectionDesc desc="ideas & drafts to make real" />
              <StorySeedSuggestions />
              <ThreadSuggestions />
            </MarginBlock>
          )}

          {/* § Character / Entity / Story threads — one section heading per
              non-empty bucket; that bucket's threads follow as siblings. The
              first section anchors the overlay's gutter column. */}
          {threadSections.map((sec, idx) => {
            const collapsed = collapsedSections.has(sec.id);
            return (
              <Fragment key={sec.id}>
                <MarginBlock
                  id={sec.id}
                  gutter={
                    idx === 0 ? (
                      <div ref={gutterAnchorRef}>
                        <WorldSectionEntry icon={sec.icon} label={sec.label} />
                      </div>
                    ) : (
                      <WorldSectionEntry icon={sec.icon} label={sec.label} />
                    )
                  }
                >
                  <SectionDesc
                    desc={`${sec.list.length} ${sec.noun}${sec.list.length === 1 ? '' : 's'}`}
                    collapsed={collapsed}
                    onToggle={() => toggleSection(sec.id)}
                  />
                </MarginBlock>

                {!collapsed && (
                  <ThreadsList
                    projectId={projectId}
                    threads={sec.list}
                    showMerge
                    focusedId={t.activeTab}
                    onFocusChange={t.setActiveThread}
                    expandedIds={t.expandedIds}
                    onToggleThread={t.toggleThread}
                    onDeleteThread={t.handleDeleteThread}
                    onRenameThread={t.handleRenameThread}
                    onEditThread={t.setEditingThreadId}
                    onColorThread={t.handleColorThread}
                    renderGutter={renderThreadGutter}
                    markerSection="outline"
                  />
                )}
              </Fragment>
            );
          })}

          {/* § Lenses — second section (LensKit's own PageHead suppressed; the
              section heading is the gutter + this body desc, like Threads) */}
          <MarginBlock id="lenses" gutter={sectionEntry('lenses')}>
            <SectionDesc desc="attach lenses that judge your threads" />
            <LensKit type="page" where="threads" id={t.activeTab ?? undefined} variant="workspace" showHead={false} threads={threads} />
          </MarginBlock>
      </PageShell>

        {t.newOpen && (
          <NewThreadModal
            projectId={projectId}
            initial={t.threadInitial}
            onClose={() => t.setNewOpen(false)}
            onCreate={t.handleCreateThread}
          />
        )}

        {t.scaffoldNewOpen && (
          <ScaffoldPickerModal
            projectId={projectId}
            scopePicker
            focusInvent={t.scaffoldFocus === 'invent'}
            onClose={t.closeScaffolds}
            onInvent={() => { t.closeScaffolds(); t.setGenOpen(true); }}
            onCreated={t.handleScaffoldCreated}
          />
        )}

        {t.editingThread && (
          <EditThreadModal
            projectId={projectId}
            thread={t.editingThread}
            onClose={() => t.setEditingThreadId(null)}
            onSave={t.handleSaveThreadEdit}
          />
        )}
      </>
    </OutlineDnd>
  );
}

// The one-line section header inside a section body — matches the character
// studio's "— desc" line (cst-sec-desc), over a --line top border. When
// `onToggle` is supplied the whole line becomes a collapse control: a chevron
// leads it (rotated when open) and clicking hides/shows the section body below.
function SectionDesc({
  desc,
  actions,
  collapsed,
  onToggle,
}: {
  desc: string;
  actions?: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-[var(--line)] py-3">
      {onToggle ? (
        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-2 text-left">
          <ChevronRight size={14} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
          <span className="cst-sec-desc">— {desc}</span>
        </button>
      ) : (
        <span className="cst-sec-desc">— {desc}</span>
      )}
      {actions && <><span className="flex-1" />{actions}</>}
    </div>
  );
}

// A thread's margin entry — its glossy heading, indented right of the section
// heading to show it's a child. The same wrapper feeds the in-flow gutter
// traveler and the dock ghost, so both stay aligned.
function threadMargin(th: any, onClick: () => void) {
  return (
    <div className="pl-4">
      <ThreadMarginEntry thread={th} sub={shortStatus(th)} onClick={onClick} />
    </div>
  );
}

// Compact status line for a thread's gutter heading (mirrors the left-rail
// grouping semantics: gaps first, then on-track, then unplotted).
function shortStatus(t: any): string {
  if (t.gaps > 0) return `${t.gaps} open gap${t.gaps === 1 ? '' : 's'}`;
  if (t.total > 0) return 'on track';
  return 'unplotted';
}
