/**
 * Initialize hints — a SECOND hint species, shown as its own list ABOVE the
 * generic <HintRailCard> list in the suggestions rail.
 *
 * Where a HintRailCard is ONE shared shell themed per page (modules/hint), an
 * initialize hint is fully bespoke: each entry brings its own copy AND its own
 * condition. They fire on a MILESTONE the author just reached or an empty-state
 * worth nudging — and they do it CROSS-PAGE: a card shows on one page but points
 * at a DIFFERENT page where the work happens. e.g. while you're in the cast and
 * still have no threads, "Map out every subplot" surfaces on the People page and
 * navigates you to Plot threads.
 *
 * There are NO buttons. The whole card navigates to its destination page (the
 * page its glyph names) on click / Enter / Space — exactly like <HintRailCard>.
 * A card whose destination IS the page you're already on renders as a quiet,
 * non-navigating note (same own-page rule HintRailCard uses).
 *
 * To add one: write a Card that wraps its copy in <InitzShell page="…">, then
 * append a def to INITIALIZE_HINTS with a `when` predicate over the shell's
 * presence counts + the section you want it to appear ON.
 */
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { pageGlyph } from '../../pageGlyphs';
import './hint.css';

/** Evaluation context: the page you're on + the shell's presence counts. */
export interface InitializeHintCtx {
  section?: string;
  counts: Record<string, number>;
}

export interface InitializeHintDef {
  id: string;
  /** Show this hint when its milestone condition holds. */
  when: (ctx: InitializeHintCtx) => boolean;
  /** One-sentence plain-text summary — what Night Eyes is told is on screen
   *  (see modules/hint/collectLiveHints). Keep it in sync with the Card's copy. */
  text: string;
  /** The card's bespoke UI. */
  Card: () => JSX.Element;
}

// ── Shared shell ─────────────────────────────────────────────────────────────

/**
 * The clickable chrome every init card shares: glyph + title header, a bespoke
 * body, and a quiet "Open <page> →" go-affordance. The whole card navigates to
 * `page` — the destination the glyph names — on click / Enter / Space. When that
 * destination is the page you're already on, the card goes inert (no nav, no
 * go-affordance): the destination's own empty-state UI is already on screen.
 */
function InitzShell({
  page,
  title,
  children,
}: {
  page: string;
  title: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { projectId, section: currentSection } = useParams();
  const glyph = pageGlyph(page);
  const Glyph = glyph?.icon;

  const onOwnPage = !!currentSection && currentSection === page;
  const navigable = !!projectId && !onOwnPage;

  const go = () => {
    if (navigable) navigate(`/project/${projectId}/${page}`);
  };

  return (
    <article
      className="wv2-initz-card"
      data-page={page}
      role={navigable ? 'button' : undefined}
      tabIndex={navigable ? 0 : undefined}
      onClick={navigable ? go : undefined}
      onKeyDown={
        navigable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go();
              }
            }
          : undefined
      }
    >
      <header className="wv2-initz-head">
        {Glyph && (
          <span className="wv2-initz-ic" aria-hidden="true">
            <Glyph size={13} strokeWidth={2} />
          </span>
        )}
        <span className="wv2-initz-title">{title}</span>
      </header>
      <div className="wv2-initz-body">{children}</div>
      {navigable && glyph && (
        <div className="wv2-initz-foot">
          <span className="wv2-initz-go">
            Open {glyph.label}
            <ArrowRight size={12} strokeWidth={2.5} />
          </span>
        </div>
      )}
    </article>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

/** Shows on People (cast exists, no threads yet) → go map the subplots. */
function StartThreadsCard() {
  return (
    <InitzShell page="plot-threads" title="Map out every subplot">
      <p className="wv2-initz-line">
        <strong>Start creating threads</strong> to map out every subplot — the
        tensions and mysteries that run through your story.
      </p>
    </InitzShell>
  );
}

/** Shows on Ideas (notes captured, no cast yet) → go create the first person. */
function StartCharactersCard() {
  return (
    <InitzShell page="characters" title="Give the story a pulse">
      <p className="wv2-initz-line">
        <strong>Create your first character</strong> — someone who wants, hides, and
        collides with everyone else. People are what make a plot breathe.
      </p>
    </InitzShell>
  );
}

/** Shows on Manuscript (no braindumps yet) → go dump the stray ideas. */
function StartBraindumpsCard() {
  return (
    <InitzShell page="braindumps" title="Nothing's too small to keep">
      <p className="wv2-initz-line">
        <strong>Dump every stray idea</strong> — a line of dialogue, a what-if, a
        half-formed hunch. The messy pile is where the story starts.
      </p>
    </InitzShell>
  );
}

/**
 * plot-threads: a first thread exists but no outline yet → nudge to start the
 * outline and plan chapters. Sibling of OutlineFromThreadsCard (which fires at
 * ≥2 threads); this single-thread case is plot-threads-only.
 */
function StartOutlineFromThreadCard() {
  return (
    <InitzShell page="outline" title="Time to plan the chapters">
      <p className="wv2-initz-line">
        <strong>Start an outline</strong> and plan the chapters — give your thread a{' '}
        <strong>shape</strong> to live in.
      </p>
    </InitzShell>
  );
}

/**
 * threads exist but there's no outline yet → start weaving them. Shows on BOTH
 * the plot-threads page (whole card navigates to the outline) AND the outline
 * page itself — where InitzShell goes inert (the empty-state scaffold picker is
 * already on screen), so the copy points down to the picker instead.
 */
function OutlineFromThreadsCard() {
  const { section } = useParams();
  const onOutline = section === 'outline';
  return (
    <InitzShell page="outline" title="Your threads are ready to weave">
      <p className="wv2-initz-line">
        {onOutline ? (
          <>
            Pick a shape below to <strong>merge your threads</strong> into a single{' '}
            <strong>story</strong>.
          </>
        ) : (
          <>
            <strong>Initialize an outline</strong> to start merging your threads into a{' '}
            <strong>story</strong>.
          </>
        )}
      </p>
    </InitzShell>
  );
}

/**
 * chapters / outline: a manuscript exists but nothing's being gauged yet → nudge
 * to put a gauge on it. Surfaced on Manuscript AND Grand outline, navigates to the
 * Gauges route (its GaugesInit onboarding takes over while nothing's bound). Gated
 * to mirror the rail's See group, which only appears once a chapter exists.
 */
function StartWatchingCard() {
  return (
    <InitzShell page="gauges" title="Put a gauge on your story">
      <p className="wv2-initz-line">
        Your manuscript&rsquo;s taking shape. <strong>Start watching it</strong> — a gauge reads
        every scene for one thing: a rising tension, a contradiction, who&rsquo;s where.
      </p>
    </InitzShell>
  );
}

/**
 * plot-threads: a manuscript + threads exist but nothing's being gauged yet → offer
 * a gauge framed around a thread's tension. Navigates to the Gauges route. One of
 * three page-relevant "watch it" nudges (thread / arc / shape) that each frame the
 * same destination around what the current page is about.
 */
function WatchThreadCard() {
  return (
    <InitzShell page="gauges" title="Watch a thread hold">
      <p className="wv2-initz-line">
        You&rsquo;ve got threads and pages now. <strong>Put a gauge on one</strong> — it follows a
        thread&rsquo;s tension scene by scene and flags where it goes slack.
      </p>
    </InitzShell>
  );
}

/**
 * characters: a manuscript + cast exist but nothing's being gauged yet → offer a
 * gauge framed around a character's arc. Navigates to the Gauges route.
 */
function WatchArcCard() {
  return (
    <InitzShell page="gauges" title="Watch an arc bend">
      <p className="wv2-initz-line">
        Your cast is on the page. <strong>Put a gauge on someone</strong> — it watches their arc
        bend scene by scene, so you catch a beat that falls flat.
      </p>
    </InitzShell>
  );
}

// ── Registry ───────────────────────────────────────────────────────────────

export const INITIALIZE_HINTS: InitializeHintDef[] = [
  {
    // No threads yet — surfaced on People, navigates to Plot threads.
    id: 'initz:start-threads',
    text: 'Map out every subplot — start creating threads for the tensions and mysteries running through the story (on the plot-threads page).',
    when: ({ section, counts }) =>
      section === 'characters' && (counts.threads ?? 0) === 0,
    Card: StartThreadsCard,
  },
  {
    // No cast yet — surfaced on Ideas, navigates to People.
    id: 'initz:start-characters',
    text: 'Give the story a pulse — create the first character (on the characters page).',
    when: ({ section, counts }) =>
      section === 'braindumps' && (counts.characters ?? 0) === 0,
    Card: StartCharactersCard,
  },
  {
    // No braindumps yet — surfaced on Manuscript, navigates to Braindumps.
    id: 'initz:start-braindumps',
    text: 'Dump every stray idea — the messy pile is where the story starts (on the braindumps page).',
    when: ({ section, counts }) =>
      section === 'chapters' && (counts.braindumps ?? 0) === 0,
    Card: StartBraindumpsCard,
  },
  {
    // Exactly one thread, no outline — nudge to start the outline + plan
    // chapters. plot-threads-only; mutually exclusive with the ≥2 weave card.
    id: 'initz:start-outline-from-thread',
    text: 'Time to plan the chapters — start an outline to give the thread a shape to live in.',
    when: ({ section, counts }) =>
      section === 'plot-threads' &&
      (counts.threads ?? 0) === 1 &&
      (counts.outline ?? 0) === 0,
    Card: StartOutlineFromThreadCard,
  },
  {
    // Threads exist but no outline — nudge to weave them. Fires on the
    // plot-threads page (whole card → outline) AND the outline page (inert
    // there; the empty-state scaffold picker is already on screen).
    id: 'initz:outline-from-threads',
    text: 'Threads are ready to weave — initialize an outline to merge them into a single story.',
    when: ({ section, counts }) =>
      (section === 'plot-threads' || section === 'outline') &&
      (counts.threads ?? 0) >= 2 &&
      (counts.outline ?? 0) === 0,
    Card: OutlineFromThreadsCard,
  },
  {
    // A manuscript exists but nothing's being gauged — surfaced on Manuscript AND
    // Grand outline, navigates to the Gauges route (its GaugesInit onboarding shows
    // while nothing's bound). Mirrors the See group, which unlocks at the first chapter.
    id: 'initz:start-watching',
    text: "Put a gauge on the story — start watching scenes for one thing: a rising tension, a contradiction, who's where.",
    when: ({ section, counts }) =>
      (section === 'chapters' || section === 'outline') &&
      (counts.chapters ?? 0) > 0 &&
      (counts.gaugesBound ?? 0) === 0,
    Card: StartWatchingCard,
  },
  {
    // Manuscript + threads exist, nothing gauged — surfaced on Plot threads,
    // navigates to Gauges. Gauge framed around following a thread's tension.
    id: 'initz:watch-thread',
    text: "Watch a thread hold — put a gauge on one to follow its tension scene by scene and flag where it goes slack.",
    when: ({ section, counts }) =>
      section === 'plot-threads' &&
      (counts.chapters ?? 0) > 0 &&
      (counts.threads ?? 0) > 0 &&
      (counts.gaugesBound ?? 0) === 0,
    Card: WatchThreadCard,
  },
  {
    // Manuscript + cast exist, nothing gauged — surfaced on People, navigates to
    // Gauges. Gauge framed around a character's arc.
    id: 'initz:watch-arc',
    text: "Watch an arc bend — put a gauge on a character to follow their arc scene by scene, so you catch a beat that falls flat.",
    when: ({ section, counts }) =>
      section === 'characters' &&
      (counts.chapters ?? 0) > 0 &&
      (counts.characters ?? 0) > 0 &&
      (counts.gaugesBound ?? 0) === 0,
    Card: WatchArcCard,
  },
];

/** The initialize hints whose condition currently holds, in registry order. */
export function activeInitializeHints(ctx: InitializeHintCtx): InitializeHintDef[] {
  return INITIALIZE_HINTS.filter((h) => h.when(ctx));
}
