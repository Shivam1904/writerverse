import { type ReactNode } from 'react';
import { Fingerprint, ListTree, AudioLines, ScanEye } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { StudioHeader } from './components/StudioHeader';
import { StudioSection } from './components/StudioSection';
import { WeaveTeachBox, ScaffoldTeachBox } from './components/StudioBits';
import { ThreadsList } from '../../modules/threadList/ThreadsList';
import { ThreadMarginEntry } from '../threads/components/ThreadMarginEntry';
import { ScaffoldPickerModal } from './components/ScaffoldPickerModal';
import { IdentitySection, IDENTITY_SUBS, IdentitySubEntry } from './components/IdentitySection';
import { VoiceBlock } from './components/VoiceBlock';
import { StudioPresence } from './components/StudioPresence';
import { StudioPresenceTeaching } from './components/StudioPresenceTeaching';
import { LensKit } from '../../modules/lensKit';
import { ArnIdeaButton, ArnIdeaBox } from '../../modules/arnKit';
import { MarginBlock, MarginOverlay, type MarginItem } from '../../modules/margin';
import { PageShell } from '../../components/PageShell';
import { LoadState } from '../../components/LoadError';
import { useCharacterStudio } from './useCharacterStudio';
import './characters.css';
import './studio.css';
import '../world/world.css';

/* ---- margin gutter entry — shadcn kit ----
 * The lit boxed-icon tile (kit-head-box) + kit system typography (ty-system-label
 * / ty-system-caption). Rendered both in the block gutter and in the off-screen
 * MarginOverlay. One distinct boxed lucide glyph per studio section. */
const SECTION_ICON: Record<string, ReactNode> = {
  identity: <Fingerprint size={17} strokeWidth={1.8} />,
  outline: <ListTree size={17} strokeWidth={1.8} />,
  voice: <AudioLines size={17} strokeWidth={1.8} />,
  lenses: <ScanEye size={17} strokeWidth={1.8} />,
};

function StudioMarginEntry({ icon, label, sub, onClick }: {
  icon: ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-[var(--r-md)] px-1 py-1${onClick ? ' cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className="kit-head-box">{icon}</span>
      <div className="min-w-0 pt-0.5">
        <div className="ty-system-label truncate">{label}</div>
        {sub && <div className="ty-system-caption">{sub}</div>}
      </div>
    </div>
  );
}

type Studio = ReturnType<typeof useCharacterStudio>;

/* ── per-section bodies — the only part that differs between sections; the
 *    gutter + StudioSection wrapper around each is shared (see `block` below). ── */
function renderIdentity(projectId: string | undefined, s: Studio) {
  // The Identity section's ARN (markers + lens) now lives on the Description
  // sub-section inside IdentitySection, not on the parent — so nothing here.
  return (
    <IdentitySection
      marginAware
      projectId={projectId}
      character={s.character}
      siblings={s.siblings}
      showIdeas={s.showIdeas}
    />
  );
}

// Outline section body — just the teaching/onboarding boxes. The thread blocks
// themselves live at PAGE level (see renderThreads), not in here.
function renderOutlineHead(s: Studio, onWeave: () => void) {
  return (
    <>
      <ScaffoldTeachBox threadCount={s.charThreads.length} onDraftScaffolds={s.openScaffolds} />
      {s.teachShowing && (
        <WeaveTeachBox
          threadCount={s.charThreads.length}
          onWeave={onWeave}
          onDraftMore={() => s.openScaffolds()}
          onInventMore={() => s.openScaffolds('invent')}
        />
      )}
    </>
  );
}

// The thread blocks render at PAGE level (a sibling of the section blocks inside
// .cst2-col), NOT nested in the Outline StudioSection — so each thread's margin
// heading rides the MAIN gutter and docks in the rail via the page overlay, the
// same wiring the Threads page uses. ThreadsList self-manages each block's expand.
function renderThreads(projectId: string | undefined, s: Studio) {
  return (
    <ThreadsList
      projectId={projectId}
      threads={s.charThreads}
      markerSection="outline"
      showMerge
      onRenameThread={s.handleRenameThread}
      onDeleteThread={s.handleDeleteThread}
      renderGutter={(t) => (
        // indented + scaled down so the thread heading reads as a SUBsection of
        // Outline (it appears/vanishes with the Outline section toggle).
        <div className="origin-left scale-[0.88] pl-3">
          <ThreadMarginEntry thread={t} />
        </div>
      )}
    />
  );
}

function renderPresence(projectId: string | undefined, s: Studio) {
  return (
    <>
      <VoiceBlock
        projectId={projectId}
        character={s.character}
        showIdeas={s.showIdeas}
      />
      {!s.outlineFetched ? null : s.hasAnyMention ? (
        <StudioPresence projectId={projectId} character={s.character} />
      ) : (
        <StudioPresenceTeaching
          projectId={projectId}
          character={s.character}
          tag={s.hasChapters ? 'no mentions yet' : 'no chapters yet'}
          onWrite={s.onWriteChapters}
        />
      )}
    </>
  );
}

function renderLenses(s: Studio) {
  return (
    <>
      {/* lenses box is story-scoped — story-level themes show on every cast page. */}
      <div className="mb-1 flex">
        <ArnIdeaButton section="lenses" storyScoped hidden={!s.showIdeas} />
      </div>
      <ArnIdeaBox section="lenses" storyScoped hidden={!s.showIdeas} />
      <LensKit type="page" where="character" id={s.character?.name} variant="workspace" showHead={false} threads={s.charThreads} />
    </>
  );
}

/* Character studio — stepped layout (2026-06-08 redesign; Arc merged into Identity
 * 2026-06-20; PageShell migration 2026-06-27). Top → bottom: PageHeader (name +
 * stepper caption) · Identity · Outline · Presence · Lenses, each a <MarginBlock>
 * with one shared <MarginOverlay>. The page no longer owns its own scroll element —
 * PageShell renders inside the app's `.wv2-content` (the single scroll container),
 * and the stepper's scroll-spy + jump resolve that element (see useCharacterStudio).
 * All data/state lives in useCharacterStudio — this component only lays out the stack. */
export function CharacterStudioPage() {
  const { projectId, characterId } = useParams();
  const s = useCharacterStudio(projectId, characterId);
  const navigate = useNavigate();
  const goMerge = () => { if (projectId) navigate(`/project/${projectId}/merge`); };

  // No character yet: the cast may still be loading or have failed to load
  // (spinner / "Couldn't load" + Retry); only a loaded cast without this id
  // means the character really is gone.
  if (!s.character) {
    return (
      <div className="wv2-page">
        <div className="wv2-page-main chr-main">
          <button type="button" className="chr-person-back" onClick={s.back}>&larr; Back to cast</button>
          {s.castStatus === 'ready'
            ? <div className="chr-empty"><p>Character not found.</p></div>
            : <LoadState status={s.castStatus} what="this character" onRetry={s.retryCast} />}
        </div>
      </div>
    );
  }

  const { character } = s;

  // gutter sub-labels (live status) per section — shared by gutter + overlay.
  const gutterSub: Record<string, string> = {
    identity: s.descFilled ? 'essence set' : 'start here',
    outline: `${s.charThreads.length} thread${s.charThreads.length === 1 ? '' : 's'}`,
    voice: s.voiceSet ? 'set' : 'not started',
    lenses: 'analysis',
  };

  // The four SECTIONS always dock. Threads dock between Outline and Presence ONLY
  // while the Outline section is expanded — so the rail holds the thread margins
  // when open and drops them entirely when collapsed (matching renderThreads
  // below). Docked thread copies carry the same indent/scale as their travelers.
  const sectionItem = (id: string): MarginItem => ({
    id,
    render: (scrollTo: () => void) => (
      <StudioMarginEntry label={SECTION_LABEL[id]} sub={gutterSub[id]} icon={SECTION_ICON[id]} onClick={scrollTo} />
    ),
  });
  const overlayItems: MarginItem[] = [
    sectionItem('identity'),
    // Identity children dock (indented/scaled) only while Identity is expanded.
    ...(s.openSections.identity
      ? IDENTITY_SUBS.map((sub): MarginItem => ({
        id: `idsub-${sub.id}`,
        render: (scrollTo: () => void) => <IdentitySubEntry Icon={sub.Icon} label={sub.label} onClick={scrollTo} />,
      }))
      : []),
    sectionItem('outline'),
    ...(s.openSections.outline
      ? s.charThreads.map((t: any): MarginItem => ({
        id: t.id,
        render: (scrollTo: () => void) => (
          <div className="origin-left scale-[0.88] pl-3"><ThreadMarginEntry thread={t} onClick={scrollTo} /></div>
        ),
      }))
      : []),
    sectionItem('voice'),
    sectionItem('lenses'),
  ];

  // One section row: gutter entry (toggles the section) + StudioSection wrapper
  // around the section body. `anchor` marks the block whose gutter the overlay
  // measures its column from.
  const block = (cfg: {
    id: string; glyph: string; ready?: boolean; hasProposal?: boolean;
    desc: string; sub?: string; seed: string; headerExtra?: ReactNode; anchor?: boolean;
    /** false → no parent ARN (marker + AI-rewrite) in the section header. Identity
     *  opts out: its ARN moved down to the Description sub-section. */
    marker?: boolean;
    children: ReactNode;
  }) => {
    const entry = (
      <StudioMarginEntry
        label={SECTION_LABEL[cfg.id]}
        sub={gutterSub[cfg.id]}
        icon={SECTION_ICON[cfg.id]}
        onClick={() => s.toggleSection(cfg.id)}
      />
    );
    return (
      <MarginBlock id={cfg.id} gutter={cfg.anchor ? <div ref={s.gutterAnchorRef}>{entry}</div> : entry}>
        <StudioSection
          glyph={cfg.glyph}
          label={SECTION_LABEL[cfg.id]}
          markerSection={cfg.marker === false ? undefined : cfg.id}
          ready={cfg.ready}
          hasProposal={cfg.hasProposal}
          desc={cfg.desc}
          sub={cfg.sub}
          active={s.current === cfg.id}
          open={!!s.openSections[cfg.id]}
          onToggle={() => s.toggleSection(cfg.id)}
          name={character.name}
          onAsk={() => s.ask(cfg.seed)}
          refEl={s.setSectionRef(cfg.id)}
          headerExtra={cfg.headerExtra}
        >
          {cfg.children}
        </StudioSection>
      </MarginBlock>
    );
  };

  const noThreads = s.charThreads.length === 0;

  // The page heading is now a standard PageHeader (concept glyph + name as text),
  // with the stepper directly below it (caption) and the global ideas toggle as
  // its sole action. The character's avatar/identity-mark moved OUT of the heading
  // and into the Identity section body (the <StudioHeader> cluster — see below).
  return (
    // The `.cst2-root` wrapper is KEPT (not for scroll — PageShell uses the app's
    // single `.wv2-content` scroll) but because the proposal field-box styling
    // (`.cst-prop--block`, studio.css) is scoped under `.cst2-root`. It no longer
    // owns a scroll: the old `.cst2-scroll` (overflow:auto) + `.cst2-col` wrappers
    // are dropped so there is ONE scroll context. `.cst2-root` is a flex column
    // and PageShell (min-h-full) fills it. key by character so per-character
    // UI-only state resets on navigation.
    <div className="cst2-root" key={characterId}>
      <PageShell
        header={null}
        overlay={<MarginOverlay items={overlayItems} anchorRef={s.gutterAnchorRef} />}
      >
        <StudioHeader projectId={projectId} character={character} />
        {block({
          id: 'identity', glyph: '✦', ready: s.descFilled, hasProposal: s.identityHasProposal, anchor: true,
          marker: false, // ARN moved to the Essence sub-section
          desc: noThreads ? 'who they are — essence, appearance, world, backstory' : `${character.name}'s essence`,
          seed: 'essence',
          // The identity-mark cluster (avatar/portrait + name/colour/tier editors)
          // now lives INSIDE the Identity section body — it is no longer the page
          // heading anchor.
          children: <></>,
        })}

        {/* Identity children — page-level margin blocks (Essence · Internal ·
            External · facets). Shown only when Identity is expanded; they travel
            AND dock (indented/scaled), like threads under Outline. */}
        {!!s.openSections.identity && renderIdentity(projectId, s)}

        {block({
          id: 'outline', glyph: '☰', ready: s.charThreads.length > 0,
          desc: `${s.charThreads.length} plot thread${s.charThreads.length === 1 ? '' : 's'}`,
          sub: noThreads ? 'their plot threads, woven into one outline' : '',
          seed: 'outline',
          children: renderOutlineHead(s, goMerge),
        })}

        {/* threads — page-level blocks in the MAIN gutter. Shown only when the
            Outline section is expanded; collapsing Outline hides the thread
            bodies AND their gutter travelers. They travel but never dock. */}
        {!!s.openSections.outline && renderThreads(projectId, s)}

        {block({
          id: 'voice', glyph: '❝', ready: s.voiceSet, hasProposal: s.voiceHasProposal,
          desc: noThreads ? 'their voice, and how present they are across the manuscript' : 'Presence across manuscript',
          sub: s.voiceSet ? 'set' : undefined,
          seed: 'voice',
          children: renderPresence(projectId, s),
        })}

        {block({
          id: 'lenses', glyph: '◎',
          desc: noThreads ? 'analysis lenses watching this character across their threads & prose' : 'Lenses to watch for cracks in the manuscript',
          seed: 'lenses',
          children: renderLenses(s),
        })}
      </PageShell>

      {s.scaffoldOpen && (
        <ScaffoldPickerModal
          projectId={projectId}
          characterName={character.name}
          arcReady={s.arcReady}
          focusInvent={s.scaffoldFocus === 'invent'}
          onClose={s.closeScaffold}
          onInvent={() => s.ask('invent')}
          onSketchArc={s.onScaffoldSketchArc}
          onCreated={s.onScaffoldCreated}
        />
      )}
    </div>
  );
}

const SECTION_LABEL: Record<string, string> = {
  identity: 'Identity',
  outline: 'Outline',
  voice: 'Presence',
  lenses: 'Lenses',
};
