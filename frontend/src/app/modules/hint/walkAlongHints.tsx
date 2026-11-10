/**
 * Walk-along hints — a THIRD hint species, shown as its own list at the TOP of
 * the suggestions rail, above the initialize list. Unlike the other two species
 * (which POINT you elsewhere), a walk-along keeps you put — either by running
 * an action in place or by quietly nudging the work you're already doing.
 *
 * Cards are deliberately NOT modular: each one is its own bespoke layout. The
 * <WalkAlongShell> below is just ONE reusable pattern — collapse→expand with an
 * idle→running→done button — for cards that fire an LLM action. Purely
 * informational/encouraging cards build their own JSX directly, and one card
 * (WeaveThreadsCard) is the exception that DOES point elsewhere — a bespoke
 * navigating nudge with its own CTA button.
 */
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, ChevronDown } from 'lucide-react';
import { pageGlyph } from '../../pageGlyphs';
import { queries } from '../../queries';
import { callOp } from '../../gateway';
import { extractElements } from '../../pages/braindumps/data';
import { candidateCharNames } from '../../pages/braindumps/components/entityTags';
import { IDEA_COLORS } from '../../pages/braindumps/components/colorIdea';
import { useCountsRecord } from '../../useCounts';
import { useChatStore } from '../chat/useChatStore';
import './hint.css';

/** Evaluation context — the page you're on + the shell's presence counts. */
export interface WalkAlongHintCtx {
  section?: string;
  counts: Record<string, number>;
}

export interface WalkAlongHintDef {
  id: string;
  /** Show this hint when its condition holds. */
  when: (ctx: WalkAlongHintCtx) => boolean;
  /** One-sentence plain-text summary — what Night Eyes is told is on screen
   *  (see modules/hint/collectLiveHints). Keep it in sync with the Card's copy. */
  text: string;
  /** The card's bespoke UI. */
  Card: () => JSX.Element;
}

/** The in-place action a walk-along hint runs from its expanded panel. */
interface WalkAction {
  /** Idle button label, e.g. 'Extract elements'. */
  label: string;
  /** Label while the action is in flight, e.g. 'Extracting…'. */
  runningLabel: string;
  /** Label once it's done, e.g. 'Elements extracted'. */
  doneLabel: string;
  /** Runs the action; resolves on success, rejects to return the button to idle. */
  run: (projectId: string) => Promise<unknown>;
}

// ── Shared shell ─────────────────────────────────────────────────────────────

/**
 * The two-stage chrome every walk-along card shares.
 *
 *   • Collapsed — a single clickable row: glyph + the soft invitation `prompt` +
 *     a chevron. The whole row expands on click / Enter / Space.
 *   • Expanded — the heavier panel: glyph + `title` header, the bespoke
 *     `children` explanation, and the action button (idle → running → done,
 *     reusing the page's own `wv2-btn-ai` styling so it reads as the same move
 *     the page header's button runs). A quiet "Not now" collapses it again.
 *
 * Themed gold to match the AI action it triggers (the same --gold as wv2-btn-ai).
 */
function WalkAlongShell({
  page,
  prompt,
  title,
  action,
  children,
}: {
  page: string;
  prompt: ReactNode;
  title: string;
  action: WalkAction;
  children: ReactNode;
}) {
  const { projectId } = useParams();
  const glyph = pageGlyph(page);
  const Glyph = glyph?.icon;
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');

  const runAction = async () => {
    if (phase !== 'idle' || !projectId) return;
    setPhase('running');
    try {
      await action.run(projectId);
      setPhase('done');
    } catch (err) {
      console.error('walk-along action failed:', err);
      setPhase('idle');
    }
  };

  if (!expanded) {
    return (
      <article
        className="wv2-walk-card"
        data-page={page}
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(true);
          }
        }}
      >
        <div className="wv2-walk-invite">
          {Glyph && (
            <span className="wv2-walk-ic" aria-hidden="true">
              <Glyph size={13} strokeWidth={2} />
            </span>
          )}
          <span className="wv2-walk-prompt">{prompt}</span>
          <ChevronDown size={14} strokeWidth={2.5} className="wv2-walk-chev" />
        </div>
      </article>
    );
  }

  const btnLabel =
    phase === 'running' ? action.runningLabel : phase === 'done' ? action.doneLabel : action.label;

  return (
    <article className="wv2-walk-card is-open" data-page={page}>
      <header className="wv2-walk-head">
        {Glyph && (
          <span className="wv2-walk-ic" aria-hidden="true">
            <Glyph size={13} strokeWidth={2} />
          </span>
        )}
        <span className="wv2-walk-title">{title}</span>
      </header>
      <div className="wv2-walk-body">{children}</div>
      <div className="wv2-walk-foot">
        <button
          type="button"
          className="wv2-btn wv2-btn-ai wv2-btn-sm"
          disabled={phase !== 'idle'}
          onClick={runAction}
        >
          <span className="wv2-spark">✦</span>
          {btnLabel}
        </button>
        {phase === 'idle' && (
          <button type="button" className="wv2-walk-back" onClick={() => setExpanded(false)}>
            Not now
          </button>
        )}
      </div>
    </article>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

/**
 * braindumps: a pile of ideas exists but no cast and no threads yet → offer to
 * sort the pile into building blocks. The button runs the SAME wire as the Ideas
 * header's "Extract elements" — one LLM call fanned out into per-type proposals
 * (actors / threads / world / story) the author accepts independently.
 */
function SortIdeasCard() {
  return (
    <WalkAlongShell
      page="braindumps"
      prompt={<>Your ideas are strong — shall I start sorting them out?</>}
      title="Sort your ideas into building blocks"
      action={{
        label: 'Extract elements',
        runningLabel: 'Extracting…',
        doneLabel: 'Elements extracted',
        run: extractElements,
      }}
    >
      <p className="wv2-walk-line">
        I can read through your ideas and pull out the <strong>actors</strong>,{' '}
        <strong>threads</strong>, and <strong>worldbuilding</strong> blocks hiding in them — each
        comes back as a proposal you can accept or skip.
      </p>
    </WalkAlongShell>
  );
}

/**
 * braindumps: too few ideas to sort yet — a purely informational nudge. No
 * action, no expand/collapse: just glyph + a warm headline + a one-line
 * encouragement that this is the right place to keep dumping.
 */
function AddMoreIdeasCard() {
  const glyph = pageGlyph('braindumps');
  const Glyph = glyph?.icon;
  return (
    <article className="wv2-walk-note" data-page="braindumps">
      {Glyph && (
        <span className="wv2-walk-ic" aria-hidden="true">
          <Glyph size={13} strokeWidth={2} />
        </span>
      )}
      <div className="wv2-walk-note-body">
        <p className="wv2-walk-note-head">Keep the ideas coming.</p>
        <p className="wv2-walk-note-sub">
          Dump your brain here <strong>whenever</strong> — a few more and I can start sorting them
          into actors, threads, and worldbuilding.
        </p>
      </div>
    </article>
  );
}
/**
 * braindumps: a pile exists but nothing's categorised yet → teach the in-place
 * tag/colour gesture. Purely informational, no button (you tag right here on this
 * page): glyph + headline, a line that mimics the real "+ tag" affordance, and a
 * row of the ACTUAL colour palette so the swatch picker is recognisable. Chrome
 * stays neutral so those swatches are the only colour on the card.
 */
function TagIdeasCard() {
  const Glyph = pageGlyph('braindumps')?.icon;
  return (
    <article className="wv2-walk-tag" data-page="braindumps">
      <header className="wv2-walk-tag-head">
        {Glyph && (
          <span className="wv2-walk-tag-ic" aria-hidden="true">
            <Glyph size={13} strokeWidth={2} />
          </span>
        )}
        <span className="wv2-walk-tag-title">Colour-code your ideas</span>
      </header>
      <p className="wv2-walk-tag-line">
        Hover any idea and hit <span className="wv2-walk-tag-chip">+ tag</span> — drop a{' '}
        <strong>colour</strong> or a <strong>#label</strong> on it, then group the whole pile by
        theme at a glance.
      </p>
      <div className="wv2-walk-tag-swatches" aria-hidden="true">
        {IDEA_COLORS.slice(0, 6).map((c, i) => (
          <span
            key={c}
            className="wv2-walk-tag-sw"
            style={{ background: c, ['--sw-i' as any]: i }}
          />
        ))}
      </div>
    </article>
  );
}

/**
 * braindumps: the AI tagged character names in the ideas that aren't real
 * Characters yet → walk the author through making them real, ONE at a time. Shows
 * the FIRST candidate; its button drafts a full character (role, arcs,
 * relationships) via promote_to_character — a proposal that lands on the Characters
 * page. Once that one is accepted it stops being a candidate, the card advances to
 * the next, and retires when every tagged character is real. Keyed on the name so
 * each advance remounts the shell fresh (idle button, not stuck on the last "done").
 */
function MakeCharactersRealCard() {
  const { projectId } = useParams();
  const bdQ = useQuery({ ...queries.braindumps(projectId), enabled: !!projectId });
  const charsQ = useQuery({ ...queries.characters(projectId), enabled: !!projectId });
  const first = candidateCharNames(
    (bdQ.data as any[]) ?? [],
    ((charsQ.data as any)?.characters ?? []).map((c: any) => c?.name),
  )[0];
  if (!first) return null; // belt-and-braces; `when` already gates on the count

  return (
    <WalkAlongShell
      key={first}
      page="braindumps"
      prompt={<>Make your characters real — start with <strong>{first}</strong>?</>}
      title="Make your characters real"
      action={{
        label: `Make ${first} real`,
        runningLabel: `Drafting ${first}…`,
        doneLabel: 'Drafted — review on Characters',
        run: (pid) => callOp(pid, 'promote_to_character', { name: first }, 'characters'),
      }}
    >
      <p className="wv2-walk-line">
        <strong>{first}</strong> keeps coming up in your ideas but isn't a real character yet. I'll
        draft them — <strong>role</strong>, <strong>arcs</strong>, and{' '}
        <strong>relationships</strong> — from everything you've written, as a proposal you can
        accept on the Characters page.
      </p>
    </WalkAlongShell>
  );
}

/**
 * outline: a shape exists but is still thin on beats → point the author back at
 * their threads to pull material into the scenes. The ONE walk-along that POINTS
 * elsewhere rather than acting in place — so it's a bespoke navigating card with
 * a real CTA button, and it's themed terracotta (the navigation-nudge accent, not
 * the gold AI accent) so it never reads as an AI action.
 */
function WeaveThreadsCard() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const glyph = pageGlyph('plot-threads');
  const Glyph = glyph?.icon;

  const go = () => {
    if (projectId) navigate(`/project/${projectId}/plot-threads`);
  };

  return (
    <article className="wv2-walk-weave" data-page="plot-threads">
      <header className="wv2-walk-weave-head">
        {Glyph && (
          <span className="wv2-walk-weave-ic" aria-hidden="true">
            <Glyph size={13} strokeWidth={2} />
          </span>
        )}
        <span className="wv2-walk-weave-title">Weave in your threads</span>
      </header>
      <p className="wv2-walk-weave-line">
        Your outline is still thin. Pull a <strong>thread</strong> through it — turn the tensions
        you've mapped into the <strong>beats</strong> each scene needs.
      </p>
      <div className="wv2-walk-weave-foot">
        <button type="button" className="wv2-walk-weave-cta" onClick={go}>
          Go to threads
          <ArrowLeft size={13} strokeWidth={2.5} />
        </button>
      </div>
    </article>
  );
}

/**
 * plot-threads: the mirror of WeaveThreadsCard, seen from the threads side — an
 * outline exists but is still thin on beats. Purely informational/visual (NO
 * button): it teaches the two ways to feed the outline. Its visual is the star —
 * beats stream along a dashed track from the thread node to the outline node, a
 * gentle loop that reads as "drag these across" (stilled under reduced-motion).
 */
function MergeBeatsCard() {
  const TGlyph = pageGlyph('plot-threads')?.icon;
  const OGlyph = pageGlyph('outline')?.icon;
  return (
    <article className="wv2-walk-merge" data-page="plot-threads">
      <div className="wv2-walk-merge-viz" aria-hidden="true">
        <span className="wv2-walk-merge-node">
          {TGlyph && <TGlyph size={14} strokeWidth={2} />}
        </span>
        <span className="wv2-walk-merge-track">
          <span className="wv2-walk-merge-beat" style={{ ['--i' as any]: 0 }} />
          <span className="wv2-walk-merge-beat" style={{ ['--i' as any]: 1 }} />
          <span className="wv2-walk-merge-beat" style={{ ['--i' as any]: 2 }} />
        </span>
        <span className="wv2-walk-merge-node is-dest">
          {OGlyph && <OGlyph size={14} strokeWidth={2} />}
        </span>
      </div>
      <p className="wv2-walk-merge-line">
        <strong>Drag</strong> the beats from <strong>thread</strong> to <strong>outline</strong>, or
        let us <strong>merge</strong> for you.
      </p>
    </article>
  );
}

// ── World → Night Eyes nudges ─────────────────────────────────────────────────

/**
 * The two World-page cards that, unlike every other walk-along (which runs an op
 * in place or points elsewhere), OPEN NIGHT EYES pre-loaded with a starter
 * prompt — the chat is where this work actually happens (it asks, you answer, it
 * proposes the writes). Both share this shell: a gold card whose whole surface
 * seeds the composer and pops the panel. The ✦ is honest here — it really does
 * open the AI, matching the editor's "Ask Night Eyes" selection button.
 */
function NightEyesNudge({
  title,
  seed,
  children,
}: {
  title: string;
  seed: string;
  children: ReactNode;
}) {
  const open = useChatStore((s) => s.open);
  const setSeed = useChatStore((s) => s.setSeed);
  const ask = () => {
    setSeed(seed);
    open();
  };
  return (
    <article
      className="wv2-ne-card"
      role="button"
      tabIndex={0}
      onClick={ask}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ask();
        }
      }}
    >
      <header className="wv2-ne-head">
        <span className="wv2-ne-ic" aria-hidden="true">✦</span>
        <span className="wv2-ne-title">{title}</span>
      </header>
      <div className="wv2-ne-body">{children}</div>
      <div className="wv2-ne-foot">
        <span className="wv2-ne-go">
          Ask Night Eyes
          <ArrowRight size={12} strokeWidth={2.5} />
        </span>
      </div>
    </article>
  );
}

/** Join words as a natural English list ("a, b, and c"). */
function listEnglish(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * The story-craft details the World meta hint tracks, with their filled state.
 * The base three always count; perspective / tense / audience join only once the
 * manuscript has real structure (>1 beat) — they shape HOW prose is written and
 * judged, so they're premature on an empty outline. Reads the live `counts` that
 * BOTH the visibility predicate and the card share, so the two can't drift.
 */
function metaFields(counts: Record<string, number>) {
  const items = [
    { key: 'synopsis', label: 'Synopsis', done: (counts.projectMeta ?? 0) > 0 },
    { key: 'genre', label: 'Genre', done: (counts.genres ?? 0) > 0 },
    { key: 'tone', label: 'Tone', done: (counts.tones ?? 0) > 0 },
  ];
  if ((counts.beats ?? 0) > 1) {
    items.push(
      { key: 'perspective', label: 'Perspective', done: (counts.perspective ?? 0) > 0 },
      { key: 'tense', label: 'Tense', done: (counts.tense ?? 0) > 0 },
      { key: 'audience', label: 'Audience', done: (counts.audience ?? 0) > 0 },
    );
  }
  return items;
}

/**
 * world: the author's project metadata is incomplete → open Night Eyes to fill it
 * in conversationally. Progressive: tracks synopsis / genre / tone always, and
 * adds perspective / tense / audience once there's real structure to write into
 * (>1 beat). These details matter when WRITING and JUDGING prose, so the seeded
 * chat is framed around capturing exactly the ones still missing.
 */
function MetaFillCard() {
  const { projectId } = useParams();
  const { counts } = useCountsRecord(projectId);
  const fields = metaFields(counts);
  const missing = fields.filter((f) => !f.done);
  if (missing.length === 0) return null; // belt-and-braces; `when` already gates

  const seed =
    `Help me fill in my story's remaining details — ${listEnglish(
      missing.map((f) => f.label.toLowerCase()),
    )}. Ask me what you need to know, then save it to my project.`;

  return (
    <NightEyesNudge title="Fill in your story's details" seed={seed}>
      <p className="wv2-ne-line">
        {missing.length} {missing.length === 1 ? 'detail' : 'details'} still missing — the kind
        Night Eyes leans on when it <strong>writes</strong> and <strong>judges</strong> your prose.
      </p>
      <ul className="wv2-ne-check">
        {fields.map((f) => (
          <li key={f.key} className={`wv2-ne-check-item${f.done ? ' is-done' : ''}`}>
            <span className="wv2-ne-check-box" aria-hidden="true">
              {f.done && <Check size={10} strokeWidth={3.5} />}
            </span>
            {f.label}
          </li>
        ))}
      </ul>
    </NightEyesNudge>
  );
}

/**
 * world: the worldbuilding is still thin → open Night Eyes to flesh it out. The
 * seeded chat suggests rules, places, items, magic systems — the texture that
 * makes a world feel lived-in — and proposes the ones the author keeps.
 */
function WorldFleshCard() {
  const seed =
    "Help me flesh out my worldbuilding — the rules, places, items, and any magic " +
    'or systems that make this world feel real. Suggest a few that fit my story, ' +
    'and add the ones I like.';
  return (
    <NightEyesNudge title="Flesh out your world" seed={seed}>
      <p className="wv2-ne-line">
        Give your world some texture — <strong>rules</strong>, <strong>places</strong>,{' '}
        <strong>items</strong>, <strong>magic</strong>. Night Eyes can suggest a few that fit and
        add the ones you keep.
      </p>
    </NightEyesNudge>
  );
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const WALK_ALONG_HINTS: WalkAlongHintDef[] = [
  {
    // A pile worth sorting, nothing extracted yet — surfaced on Ideas, runs the
    // extract in place. Fires once the pile has enough to chew on — ≥2 ideas OR
    // >500 chars of text (a couple of long ideas count as much as many short
    // ones) — AND no cast AND no threads (so extraction has somewhere to land,
    // not a re-run over existing).
    id: 'walk:sort-ideas',
    text: 'Sort your ideas into building blocks — extract the actors, threads, and worldbuilding hiding in your braindumps.',
    when: ({ section, counts }) =>
      section === 'braindumps' &&
      ((counts.braindumps ?? 0) >= 2 || (counts.braindumpChars ?? 0) > 500) &&
      (counts.characters ?? 0) === 0 &&
      (counts.threads ?? 0) === 0,
    Card: SortIdeasCard,
  },
  {
    // Not enough ideas added yet — keep dumping until there's enough to extract.
    // Exact complement of walk:sort-ideas' pile gate: fewer than 2 ideas AND
    // ≤500 chars of text.
    id: 'walk:add-more-ideas',
    text: 'Keep dumping ideas — a few more and they can be sorted into actors, threads, and worldbuilding.',
    when: ({ section, counts }) =>
      section === 'braindumps' &&
      (counts.braindumps ?? 0) < 2 &&
      (counts.braindumpChars ?? 0) <= 500 &&
      (counts.characters ?? 0) === 0 &&
      (counts.threads ?? 0) === 0,
    Card: AddMoreIdeasCard,
  },
  {
    // A pile worth organising but nothing categorised — teach the tag/colour
    // gesture. ≥3 ideas (enough that grouping pays off) AND zero tags/colours
    // anywhere; the moment one idea gets a tag OR a colour, it retires.
    id: 'walk:tag-ideas',
    text: 'Colour-code your ideas — tag them with a colour or #label to group the pile by theme.',
    when: ({ section, counts }) =>
      section === 'braindumps' && (counts.braindumps ?? 0) >= 3 && (counts.ideaTags ?? 0) === 0,
    Card: TagIdeasCard,
  },
  {
    // braindumps: the AI tagged character names that aren't real Characters yet —
    // walk the author through promoting them one at a time. Fires whenever there's
    // a candidate; the card itself picks the FIRST and advances as each is accepted
    // (the count drops with it), retiring once every tagged character is real.
    id: 'walk:make-characters-real',
    text: 'Some characters tagged in your ideas aren’t real yet — make them real one at a time, drafting role, arcs, and relationships from your braindumps.',
    when: ({ section, counts }) =>
      section === 'braindumps' && (counts.candidateChars ?? 0) > 0,
    Card: MakeCharactersRealCard,
  },
  {
    // outline exists but is thin on beats (<3 across every scene) — nudge back to
    // the threads page to source material. Gated on outline>0 (acts exist) so it
    // doesn't double up with the empty-outline "weave" INITIALIZE hint, which
    // fires on this page only when there's no outline yet.
    id: 'walk:weave-threads',
    text: 'The outline is thin on beats — pull a thread through it to source the beats each scene needs.',
    when: ({ section, counts }) =>
      section === 'outline' && (counts.outline ?? 0) > 0 && (counts.beats ?? 0) < 3,
    Card: WeaveThreadsCard,
  },
  {
    // plot-threads mirror of walk:weave-threads, same gate (outline exists but
    // thin on beats). Informational/visual only — no button.
    id: 'walk:merge-beats',
    text: 'Feed the outline — drag beats from a thread into it, or let Night Eyes merge them in.',
    when: ({ section, counts }) =>
      section === 'plot-threads' && (counts.outline ?? 0) > 0 && (counts.beats ?? 0) < 1,
    Card: MergeBeatsCard,
  },
  {
    // world: project metadata still incomplete → open Night Eyes to fill it in.
    // Tracks synopsis/genre/tone always; perspective/tense/audience join the
    // checklist once there's >1 beat (real structure to write into). Retires the
    // moment nothing's missing.
    id: 'walk:fill-meta',
    text: "Story details are still missing — fill in the synopsis, genre, and tone (and perspective/tense/audience) Night Eyes leans on when it writes and judges prose.",
    when: ({ section, counts }) =>
      section === 'world' && metaFields(counts).some((f) => !f.done),
    Card: MetaFillCard,
  },
  {
    // world: worldbuilding still thin (<3 entries) → open Night Eyes to flesh it
    // out. Retires once the world has some substance.
    id: 'walk:flesh-world',
    text: 'Worldbuilding is thin — flesh out the rules, places, items, and magic that make the world feel real.',
    when: ({ section, counts }) =>
      section === 'world' && (counts.worldEntries ?? 0) < 3,
    Card: WorldFleshCard,
  },
];

/** The walk-along hints whose condition currently holds, in registry order. */
export function activeWalkAlongHints(ctx: WalkAlongHintCtx): WalkAlongHintDef[] {
  return WALK_ALONG_HINTS.filter((h) => h.when(ctx));
}
