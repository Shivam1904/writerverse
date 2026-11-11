import { useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen, Users, Globe } from 'lucide-react';
import '../characters/studio.css';
import { Card } from '../../ui';
import type { WorldSection } from './data';
import { sectionKind } from './worldIdeas';
import { WorldIntro } from './components/WorldIntro';
import { WorldCast } from './components/WorldCast';
import { RulesSection } from './components/RulesSection';
import { CardSection } from './components/CardSection';
import { TextListSection } from './components/TextListSection';
import { AddSectionPanel } from './components/AddSectionPanel';
import { CandidateEntities } from './components/CandidateEntities';
import { WorldSectionEntry, SectionMarginEntry } from './components/WorldMargin';
import { MarginBlock, MarginOverlay, type MarginItem } from '../../modules/margin';
import { ArnIdeaButton, ArnIdeaBox } from '../../modules/arnKit';
import { PageHeader } from '../../components/PageHeader';
import { PageShell } from '../../components/PageShell';
import { LoadError } from '../../components/LoadError';
import { useWorldPage } from './useWorldPage';

/**
 * WorldPage — Story + Characters + each world section, STACKED in one scroll.
 * Every block is a <MarginBlock>; one shared <MarginOverlay> parks the heading
 * entries at the gutter edges (see modules/margin). All data plumbing lives in
 * useWorldPage — this component does nothing but lay out the stack.
 */
export function WorldPage() {
  const { projectId } = useParams();
  const w = useWorldPage(projectId);

  // The three top-level SECTIONS — the only entries that dock. Each renders the
  // same icon-box entry in gutter and overlay (`onClick` = scrollTo in overlay).
  // Worldbuilding's subsections below are NOT here, so they never dock.
  const sectionEntry = (id: string, onClick?: () => void) => {
    if (id === '__story') return <WorldSectionEntry icon={<BookOpen size={17} strokeWidth={1.8} />} label="Story" sub="your premise" onClick={onClick} />;
    if (id === '__characters') return <WorldSectionEntry icon={<Users size={17} strokeWidth={1.8} />} label="Characters" sub="who lives in this world" onClick={onClick} />;
    return <WorldSectionEntry icon={<Globe size={17} strokeWidth={1.8} />} label="Worldbuilding" sub="rules, places & things" onClick={onClick} />;
  };

  // overlay: anchor ref measures gutter position, items list drives the overlay.
  const gutterAnchorRef = useRef<HTMLDivElement>(null);
  const overlayItems: MarginItem[] = useMemo(
    () => [
      { id: '__story', render: (s) => sectionEntry('__story', s) },
      { id: '__characters', render: (s) => sectionEntry('__characters', s) },
      { id: '__worldbuilding', render: (s) => sectionEntry('__worldbuilding', s) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The "ideas" a section carries (candidate entities + braindump phrases). The
  // idea box self-resolves from the ARN registry's `world` map by entity kind —
  // the page only passes the kind (storyScoped: no character gate, like today).
  const renderIdeas = (section: WorldSection) => {
    const kind = sectionKind(section.name || section.id);
    return (
      <>
        <div className="flex justify-end">
          <ArnIdeaButton section={kind} storyScoped />
        </div>
        <ArnIdeaBox section={kind} storyScoped />
        <CandidateEntities
          names={w.candidatesByKind[kind] || []}
          onMakeReal={(name) => w.onMakeReal(section, name)}
        />
      </>
    );
  };

  // The body for one section, by layout kind. The section's identity (title /
  // hint / glyph / color) is edited in the gutter margin entry, not here.
  const renderSection = (section: WorldSection) => {
    const pending = w.bySection.get(section.id) ?? [];
    const ideas = renderIdeas(section);
    if (section.kind === 'rules') {
      return (
        <RulesSection
          ideas={ideas}
          rules={section.items}
          pending={pending}
          onAdd={(text) => w.onAdd(text, ['rule'], text)}
          onUpdate={(id, text) => w.onUpdate(id, { content: text, title: text })}
          onDelete={w.onDelete}
        />
      );
    }
    if (section.kind === 'places') {
      return (
        <CardSection
          ideas={ideas}
          items={section.items}
          addLabel={section.addLabel}
          layout="top"
          pending={pending}
          proposalFor={w.proposalForItem}
          blockColor={section.color || 'var(--asp-world)'}
          onAdd={(name, line) => w.onAdd(name, ['place'], line)}
          onUpdate={(id, patch) => w.onUpdate(id, patch)}
          onColor={(id, color) => w.onUpdate(id, { color })}
          onDelete={w.onDelete}
        />
      );
    }
    if (section.kind === 'things') {
      return (
        <CardSection
          ideas={ideas}
          items={section.items}
          addLabel={section.addLabel}
          layout="side"
          pending={pending}
          proposalFor={w.proposalForItem}
          blockColor={section.color || 'var(--asp-world)'}
          onAdd={(name, line) => w.onAdd(name, ['thing'], line)}
          onUpdate={(id, patch) => w.onUpdate(id, patch)}
          onColor={(id, color) => w.onUpdate(id, { color })}
          onDelete={w.onDelete}
        />
      );
    }
    return (
      <TextListSection
        ideas={ideas}
        items={section.items}
        addLabel={section.addLabel}
        sectionId={section.id}
        pending={pending}
        proposalFor={w.proposalForItem}
        blockColor={section.color || 'var(--asp-world)'}
        onAdd={(name, text) => w.onAdd(name || text, [section.id], name ? text : undefined)}
        onUpdate={(id, patch) => w.onUpdate(id, patch)}
        onColor={(id, color) => w.onUpdate(id, { color })}
        onDelete={w.onDelete}
      />
    );
  };

  const pageHeader = (
    <PageHeader
      section="world"
      eyebrow="Imagine · world"
      title="World"
      suffix={w.sections.length ? `· ${w.sections.length}` : undefined}
    />
  );

  if (w.loadFailed && !w.loaded) {
    return (
      <PageShell header={pageHeader}>
        <LoadError what="your world" onRetry={w.reload} />
      </PageShell>
    );
  }

  return (
    <PageShell
      header={pageHeader}
      overlay={<MarginOverlay items={overlayItems} anchorRef={gutterAnchorRef} />}
    >
      {/* ── SECTION: Story ── */}
        <MarginBlock id="__story" gutter={<div ref={gutterAnchorRef}>{sectionEntry('__story')}</div>}>
          <WorldIntro world={w.world} loading={!w.loaded} onSave={w.onSaveMeta} meta={w.meta} />
        </MarginBlock>

        {/* ── SECTION: Characters ── */}
        <MarginBlock id="__characters" gutter={sectionEntry('__characters')}>
          <WorldCast />
        </MarginBlock>

        {/* ── SECTION: Worldbuilding (its subsections + add follow as siblings) ── */}
        <MarginBlock id="__worldbuilding" gutter={sectionEntry('__worldbuilding')}>
          {/* {w.hasAnyIdeas && (
            <div className="mt-3">
              <Button
                variant={w.showIdeas ? 'ai' : 'ghost'}
                size="sm"
                onClick={() => w.setShowIdeas((v) => !v)}
                title={w.showIdeas ? 'Hide braindump ideas under each section' : 'Show braindump ideas under each section'}
              >
                <Spark /> {w.showIdeas ? 'Hide ideas' : 'Ideas from your braindumps'}
              </Button>
            </div>
          )} */}
        </MarginBlock>

        {/* ── SUBSECTIONS: world sections — travelers only (not in the overlay),
             indented to read as nested under Worldbuilding ── */}
        {w.sections.map((section) => (
          <MarginBlock
            key={section.id}
            id={section.id}
            className="pl-3"
            gutter={
              <SectionMarginEntry
                section={section}
                onSave={(patch) => w.onUpdateSectionHeading(section.name || section.id, patch)}
              />
            }
          >
            {renderSection(section)}
          </MarginBlock>
        ))}

        <div className="pl-3">
          {w.addingSection ? (
            <AddSectionPanel
              existingKeys={new Set(w.world.sections.map((s) => s.name).filter(Boolean) as string[])}
              onAdd={w.onAddSection}
              onCancel={() => w.setAddingSection(false)}
            />
          ) : (
            <Card
              as="button"
              variant="dashed"
              onClick={() => w.setAddingSection(true)}
              className="mt-1.5 flex w-full items-baseline gap-2 px-3.5 py-2.5 text-left transition-colors hover:border-[var(--terra-soft)]"
            >
              <span className="ty-system-label">+ new section</span>
              <span className="ty-story-body text-[11.5px] italic text-muted-foreground">e.g. Factions, Magic, Calendar…</span>
            </Card>
          )}
        </div>
    </PageShell>
  );
}
