import { Fragment, useState, useRef, useId } from 'react';
import { Plus, Trash2, ArrowUp, ChevronLeft, X, List, LayoutGrid, FileText, Pencil, PanelRight, Layers, Lightbulb, Globe, Users } from 'lucide-react';
import { MiniLensCard, FullLensCard, LensChip, LibraryDeck, InventMini } from '../../modules/lens/LensAtoms';
import { LensShaping } from '../../modules/lens/LensBoards';
import '../../modules/lens/lens.css';
import type { PackLens } from '../../modules/lens/lensLibrary';
import '../../app.css';
import {
  Button, AiDiamond, NavButton, Chip, Badge, Swatch, Input, Card, CardHead,
  ContainerHead, RailHead, PageHead,
  Heading, SectionHeading, Eyebrow, Label,
  Spark, Kbd, Spinner, DragHandle, EntityDot, Progress,
  Segmented, Toggle, PinToggle, Checkbox, Popover, Phrase, PhraseParagraph, BeatList, BeatMarker, Field,
} from '../../ui';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { useThemeStore } from '../../theme/useThemeStore';
import { THEME_NAMES, THEME_LABELS } from '../../theme/themes';
import { cn } from '../../lib/utils';
import { EntityMark } from '../../components/EntityMark';
import { ThreadedStoryIcon } from '../../components/ThreadedStoryIcon';
import { SectionMark } from '../../components/SectionMark';
import { PageShellDemo } from './central/PageShellDemo';
import { BrandLogoSpecimens } from './ShowcaseBrandLogos';

/**
 * /demo/showcase-ui — the living kit playground, rendered INSIDE the app
 * app shell: one gradient base, borderless container-card panels (topbar · left
 * margin · center · right margin). Every named kit component lives in the
 * scrolling center panel, with
 * its variants + use cases, across all 17 themes.
 */

/* ---- layout helpers ---- */
function Section({ title, name, children }: { title: string; name: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-8">
      <div className="mb-5 flex items-baseline gap-3">
        <Heading as="h2" size="section">{title}</Heading>
        <code className="font-sans text-[11px] text-muted-foreground">{name}</code>
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** `ty` = the typography this component's text uses (e.g. "system label",
 *  "story body"). Rendered as a small pill so the showcase maps every text-
 *  bearing component to a named typography. */
function Spec({ label, ty, use, children }: { label: string; ty?: string; use?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <code className="font-sans text-[11px] font-semibold text-foreground">{label}</code>
        {ty && <TyTag>{ty}</TyTag>}
        {use && <span className="font-sans text-[11px] text-muted-foreground">— {use}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/** the typography-mapping pill — names which `.ty-*` a component's text uses. */
function TyTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[var(--r-sm)] bg-secondary px-1.5 py-0.5 font-sans text-[10px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}

/** DashedSquare — the provisional / "not real yet" marker: an empty dashed square
 *  (an unchecked box). When the entity is made real it becomes its story glyph. */
function DashedSquare({ size = 20, color = 'var(--line-2)' }: { size?: number; color?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, flex: `0 0 ${size}px`, display: 'block', borderRadius: 6, border: `1.5px dashed ${color}` }}
    />
  );
}

/* ---- Lens indicator (6 modes) ---------------------------------------------
 * One eye, six lifecycle states, all wearing OUR digital eye (the hexagonal
 * vector frame + iris ring + pupil from the "digital eye" specimen). The eye is
 * dormant when there's nothing to watch, parks open while attached/idle, and
 * comes fully alive — spinning iris + saccade + mechanical blink — only while
 * the lens is reading the draft (`judging`). Color / border / badge / reticle
 * per mode follow the lens design language (--lens-* tokens). */

/** LensEye — our digital eye, in one of three lifecycle states.
 *  The hexagon IS the eyelids — its top 3 lines are the upper lid, its bottom 3
 *  the lower lid. The eye emotes by where those lids sit + the iris↔pupil gap:
 *    closed  = only the lower lid drawn — the eye is shut (dormant)
 *    ready   = both lids open, calm — pupil close to the iris ring
 *    alert   = wide awake — small pupil, lots of space inside the iris
 *    relaxed = content — the upper lid drops down over the iris (droopy)
 *    live    = the full digital read (spinning iris + saccade + blink) */
type EyeExpr = 'closed' | 'ready' | 'alert' | 'relaxed' | 'live' | 'stale';
const ALMOND = 'M 10 50 L 30 25 L 70 25 L 90 50 L 70 75 L 30 75 Z';
// upper lid dropped down (top vertices lowered) — the droopy, relaxed eye
const ALMOND_DROOPED = 'M 10 51 L 29 38 L 71 38 L 90 51 L 70 75 L 30 75 Z';
// only the lower lid — the bottom 3 lines of the almond — a shut eye
const LOWER_LID = 'M 10 50 L 30 75 L 70 75 L 90 50';
/* iris ring + pupil radii (+ vertical seat, optional pupil x-drift) per expression */
const EYE_GEOM: Record<Exclude<EyeExpr, 'closed'>, { iris: number; pupil: number; cy: number; px?: number }> = {
  alert: { iris: 18, pupil: 7, cy: 50 },              // wide awake — big gap
  ready: { iris: 18, pupil: 11, cy: 50 },             // ready to go — small gap
  relaxed: { iris: 16, pupil: 11, cy: 52 },           // content — pupil fills the iris, sits low under the droopy lid
  live: { iris: 18, pupil: 7, cy: 50 },               // reading
  stale: { iris: 17, pupil: 9, cy: 50, px: 62 },      // looked away — the verdict is old, the gaze has drifted off
};
function LensEye({ eye, size = 14 }: { eye: EyeExpr; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const clip = `le-clip-${uid}`;
  // an eye is wide-and-short: render it wide-short on a tightly-cropped viewBox
  // (y16–84) so it fills the chip and sits centered, instead of a small square
  // glyph floating with dead air above/below.
  const h = Math.round(size * 0.68);
  const VB = '0 16 100 68';
  if (eye === 'closed') {
    return (
      <svg className="lens-eye is-closed" width={size} height={h} viewBox={VB} aria-hidden>
        <path className="le-frame le-lid-bottom" d={LOWER_LID} fill="none" />
      </svg>
    );
  }
  const g = EYE_GEOM[eye];
  const frame = eye === 'relaxed' ? ALMOND_DROOPED : ALMOND;

  const topLid = eye === 'relaxed'
    ? 'M 10 51 L 29 38 L 71 38 L 90 51'
    : 'M 10 50 L 30 25 L 70 25 L 90 50';
  const bottomLid = eye === 'relaxed'
    ? 'M 10 51 L 30 75 L 70 75 L 90 51'
    : 'M 10 50 L 30 75 L 70 75 L 90 50';

  return (
    <svg className={`lens-eye is-${eye}`} width={size} height={h} viewBox={VB} aria-hidden>
      <defs>
        {/* the lids clip the eyeball — so the droopy upper lid hides the top of the iris */}
        <clipPath id={clip}><path d={frame} /></clipPath>
      </defs>
      <path className="le-frame le-lid-top" d={topLid} />
      <path className="le-frame le-lid-bottom" d={bottomLid} />
      <g className="le-saccade" clipPath={`url(#${clip})`}>
        <circle className="le-iris" cx="50" cy={g.cy} r={g.iris} />
        <circle className="le-pupil" cx={g.px ?? 50} cy={g.cy} r={g.pupil} />
      </g>
    </svg>
  );
}

/** LensReticle — viewfinder corner-brackets: "machine vision on this section".
 *  Faint + static once attached; breathing while the read is live. */
function LensReticle({ live = false }: { live?: boolean }) {
  return (
    <span
      aria-hidden
      className={live ? 'lens-reticle-live' : undefined}
      style={{ position: 'absolute', inset: -4, pointerEvents: 'none', opacity: live ? 1 : 0.5 }}
    >
      {/* corner brackets with rounded elbows (r≈12) — concentric with the chip's
          8px radius + the 4px overhang, so the corners echo the button, not sharp Ls */}
      <svg width="100%" height="100%" viewBox="0 0 38 38" fill="none" stroke="var(--lens-purple)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20 V14 Q2 2 14 2 H20" /><path d="M18 2 H24 Q36 2 36 14 V20" />
        <path d="M36 18 V24 Q36 36 24 36 H18" /><path d="M20 36 H14 Q2 36 2 24 V18" />
      </svg>
    </span>
  );
}

/** LensModeBadge — the small corner badge: plus (attach) · check (clear) · count (problems) · refresh (stale). */
function LensModeBadge({ kind, count = 2 }: { kind: 'plus' | 'check' | 'count' | 'refresh'; count?: number }) {
  const base: React.CSSProperties = {
    position: 'absolute', top: -5, right: -5, minWidth: 14, height: 14, borderRadius: 99,
    display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, lineHeight: 1,
    border: '1.5px solid #fff', fontFamily: 'var(--lens-sans)', color: '#fff',
    padding: kind === 'count' ? '0 3px' : 0,
  };
  if (kind === 'plus') return <span style={{ ...base, background: 'var(--lens-purple)', fontSize: 11 }}>+</span>;
  if (kind === 'refresh') return <span style={{ ...base, background: 'var(--lens-gold)', fontSize: 10 }}>↻</span>;
  if (kind === 'check') return <span style={{ ...base, background: 'var(--lens-green)' }}>✓</span>;
  return <span style={{ ...base, background: 'var(--lens-rust)' }}>{count}</span>;
}

type LensModeKey = 'locked' | 'add' | 'attached' | 'judging' | 'good' | 'problem' | 'stale';
const LENS_MODES: {
  key: LensModeKey; label: string; state: string; eye: EyeExpr;
  fg: string; bg: string; border: string; badge?: 'plus' | 'check' | 'count' | 'refresh'; reticle?: 'static' | 'live'; note: string;
}[] = [
    { key: 'locked', label: 'Can’t attach', state: 'section is empty', eye: 'closed', fg: 'var(--lens-muted-2)', bg: 'transparent', border: '1px solid transparent', note: 'Nothing to watch yet. Fill the section in and the lens wakes up.' },
    { key: 'add', label: 'Add a lens', state: 'ready, none attached', eye: 'ready', fg: 'var(--lens-purple)', bg: 'rgba(255,255,255,.55)', border: '1px dashed var(--lens-purple-soft)', badge: 'plus', note: 'The section has content — attach a lens to start watching.' },
    { key: 'attached', label: 'Attached', state: 'watching, idle', eye: 'ready', fg: 'var(--lens-purple)', bg: 'var(--lens-purple-wash)', border: '1px solid var(--lens-purple-soft)', reticle: 'static', note: 'A lens is on this section, waiting for the next read.' },
    { key: 'judging', label: 'Judging', state: 'reading the draft', eye: 'live', fg: 'var(--lens-purple)', bg: 'var(--lens-purple-wash)', border: '1px solid var(--lens-purple-soft)', reticle: 'live', note: 'Reading every scene right now — the lens iris darts and spins as it scans.' },
    { key: 'good', label: 'Good outcome', state: 'all clear', eye: 'relaxed', fg: 'var(--lens-green)', bg: 'var(--lens-green-wash)', border: '1px solid rgba(79,122,82,.42)', badge: 'check', note: 'Read clean — the draft holds to what you set.' },
    { key: 'problem', label: 'Problem', state: 'found something', eye: 'alert', fg: 'var(--lens-rust)', bg: 'var(--lens-rust-wash)', border: '1px solid rgba(176,87,63,.42)', badge: 'count', note: 'The lens flagged where the draft drifts. Open to see.' },
    { key: 'stale', label: 'Stale', state: 'draft changed since', eye: 'stale', fg: 'var(--lens-gold)', bg: 'var(--lens-gold-wash)', border: '1px solid rgba(176,134,47,.42)', badge: 'refresh', note: 'The draft changed since the last read — this verdict is out of date. Re-run the lens.' },
  ];

/** LensModeChip — one lens-indicator button, in a given lifecycle mode. */
function LensModeChip({ mode, count = 2, size = 30 }: { mode: LensModeKey; count?: number; size?: number }) {
  const m = LENS_MODES.find((x) => x.key === mode)!;
  const locked = mode === 'locked';
  return (
    <span style={{ position: 'relative', display: 'inline-grid' }}>
      <button
        type="button"
        className="kit-btn-secondary focusring"
        title={m.note}
        disabled={locked}
        style={{
          width: size, height: size, borderRadius: 8, display: 'grid', placeItems: 'center', padding: 0,
          // convex gradient (a top sheen over the lens wash) to match the secondary / boxed / diamond fill
          background: locked ? m.bg : `linear-gradient(180deg, color-mix(in srgb, #fff 26%, ${m.bg}) 0%, ${m.bg} 100%)`,
          color: m.fg,
          // 'add' keeps its dashed invite border; everything else uses the secondary border
          border: mode === 'add' ? '1px dashed var(--lens-purple-soft)' : undefined,
          cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.5 : 1,
        }}
      >
        <LensEye eye={m.eye} size={Math.round(size * 0.84)} />
      </button>
      {m.reticle && <LensReticle live={m.reticle === 'live'} />}
      {m.badge && <LensModeBadge kind={m.badge} count={count} />}
    </span>
  );
}

/** GhostDiamond — the Night Eyes "ghost" affordance. Unlike the solid AiDiamond
 *  tile, this is just the ✦ spark: it rests near-invisible (quiet), blooms to full
 *  strength on hover, and lights up with a gold wash + glow when open. */
function GhostDiamond({ state = 'quiet', size = 28 }: { state?: 'quiet' | 'hover' | 'open'; size?: number }) {
  return (
    <button
      type="button"
      className={`ghost-diamond focusring is-${state}`}
      title="Ask Night Eyes"
      aria-label="Ask Night Eyes"
      style={{ width: size, height: size }}
    >
      {state === 'open' && <span className="gd-halo" aria-hidden />}
      <span className="gd-spark kit-spark" style={{ fontSize: Math.round(size * 0.5) }}>✦</span>
    </button>
  );
}

/** ClickFocus — wrap a field's container so clicking ANY non-interactive
 *  whitespace inside it focuses the first field. The app rule: clicks should land
 *  on a field, not dead space. Real buttons/links/labels opt out. */
function ClickFocus({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={className}
      onMouseDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('button, a, input, textarea, select, label, [data-no-focus]')) return;
        const field = ref.current?.querySelector('input, textarea') as HTMLElement | null;
        if (field) { e.preventDefault(); field.focus(); }
      }}
    >
      {children}
    </div>
  );
}

function ThemePicker() {
  const themeName = useThemeStore((s) => s.themeName);
  const setTheme = useThemeStore((s) => s.setTheme);
  return (
    <select
      value={themeName}
      onChange={(e) => setTheme(e.target.value)}
      className="h-8 rounded-[var(--r-md)] border border-input bg-[var(--surface)] px-2 font-sans text-[12.5px] text-foreground outline-none focus:border-[var(--terra)]"
    >
      {THEME_NAMES.map((t) => (
        <option key={t} value={t}>{THEME_LABELS[t] ?? t}</option>
      ))}
    </select>
  );
}

const ASP = {
  char: 'var(--asp-characters)',
  loc: 'var(--asp-locations)',
  idea: 'var(--asp-braindumps)',
  thread: 'var(--asp-threads)',
};

/* ---- Typography system ----
 * Three families, each a named scale (defined in ui/typography.css). The level
 * `name` IS the typography's name and gets rendered AS its own example text, so
 * the catalogue is self-documenting; `example` is real copy in the same style
 * to judge it against; `cls` is the `.ty-*` class that carries the style. */
const TYPOGRAPHY: { family: string; font: string; levels: { cls: string; name: string; example: string }[] }[] = [
  {
    family: 'system', font: 'Inter · Inter Tight — the app chrome',
    levels: [
      { cls: 'ty-system-display', name: 'system display', example: 'Story integrity' },
      { cls: 'ty-system-title', name: 'system title', example: 'Welcome back' },
      { cls: 'ty-system-heading', name: 'system heading', example: 'Pending proposals' },
      { cls: 'ty-system-body', name: 'system body', example: 'Accept on any surface and all three dismiss in lockstep.' },
      { cls: 'ty-system-label', name: 'system label', example: 'Draft character' },
      { cls: 'ty-system-caption', name: 'system caption', example: '3 places · 2 rules' },
      { cls: 'ty-system-eyebrow', name: 'system eyebrow', example: 'Plan · ideas' },
    ],
  },
  {
    family: 'story', font: 'Lora — the editorial / story voice',
    levels: [
      { cls: 'ty-story-display', name: 'story display', example: 'Open with the funeral.' },
      { cls: 'ty-story-title', name: 'story title', example: 'Worldbuilding' },
      { cls: 'ty-story-heading', name: 'story heading', example: 'The Vault' },
      { cls: 'ty-story-body', name: 'story body', example: 'Mara realises the mentor has been lying the whole time — the betrayal lands in the rain.' },
      { cls: 'ty-story-quote', name: 'story quote', example: '“A vault that only opens for the dead.”' },
      { cls: 'ty-story-caption', name: 'story caption', example: 'your premise' },
    ],
  },
  {
    family: 'ai', font: 'Fraunces — the Night Eyes voice',
    levels: [
      { cls: 'ty-ai-title', name: 'ai title', example: 'Night Eyes noticed' },
      { cls: 'ty-ai-body', name: 'ai body', example: 'Mara’s age in Chapter 3 contradicts the timeline you set in the outline.' },
      { cls: 'ty-ai-label', name: 'ai label', example: 'Suggest gauges' },
      { cls: 'ty-ai-caption', name: 'ai caption', example: 'watching 4 threads' },
    ],
  },
];

const DIGITAL_EYE_CSS = `
/* Container to center the loader */
.digital-eye-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100px;
  height: 100px;
}

/* The SVG Canvas */
.digital-eye {
  width: 100%;
  height: 100%;
  overflow: visible;
  /* Digital blink effect applied to the whole eye */
  animation: digital-blink 5s infinite;
}

/* The unreal, geometric outer eye */
.vector-frame {
  fill: none;
  stroke: var(--border, #444); /* Adjust to match theme border or fallback to dark gray */
  stroke-width: 2;
  stroke-linejoin: round;
}

/* The loading spinner component */
.spinning-iris {
  fill: none;
  stroke: #00ffcc; /* Cyan high-tech glow */
  stroke-width: 3;
  stroke-dasharray: 25 15; /* Creates the dashed segments */
  stroke-linecap: round;
  transform-origin: 50px 50px;
  animation: digital-eye-spin 1.2s linear infinite;
}

/* The center pupil */
.pupil-core {
  fill: #00ffcc;
}

/* Mimics the darting movement of human eyes (saccades) */
.saccade-movement {
  transform-origin: 50px 50px;
  animation: darting-eye 4s infinite cubic-bezier(0.25, 1, 0.5, 1);
}

/* Continuous rotation for the loading aspect */
@keyframes digital-eye-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* The human-like "reading" and scanning movement */
@keyframes darting-eye {
  0%, 10% { transform: translate(0, 0); }
  15%, 25% { transform: translate(-12px, -4px); } /* Looks up-left */
  30%, 40% { transform: translate(8px, 2px); }    /* Darts right */
  45%, 55% { transform: translate(14px, -2px); }  /* Reads further right */
  60%, 75% { transform: translate(-6px, 6px); }   /* Scans down-left */
  80%, 100% { transform: translate(0, 0); }       /* Returns to center */
}

/* An unnatural, sudden mechanical blink */
@keyframes digital-blink {
  0%, 95% { transform: scaleY(1); transform-origin: center; }
  97% { transform: scaleY(0.05); transform-origin: center; }
  100% { transform: scaleY(1); transform-origin: center; }
}

/* ---- Lens indicator eye — our digital eye, tinted + state-driven ----
   Geometry is shared across modes; the iris colour follows the button's
   currentColor (purple / green / rust). Motion only appears while reading. */
.lens-eye { overflow: visible; display: block; }
/* the eye border (frame) is the DARKEST layer — full-strength currentColor */
.lens-eye .le-frame { fill: none; stroke: currentColor; stroke-width: 6; stroke-linejoin: round; }
.lens-eye .le-lid-top { opacity: 1; }
.lens-eye .le-lid-bottom { opacity: 0.65; }
/* the iris ring is a step LIGHTER than the frame */
.lens-eye .le-iris { fill: none; stroke: currentColor; stroke-width: 6; stroke-linecap: round; transform-origin: 50px 50px; opacity: .6; stroke-dasharray: 25 15; }
.lens-eye .le-pupil { fill: currentColor; opacity: .85; }
.lens-eye .le-shutter { fill: none; stroke: currentColor; stroke-width: 7; stroke-linecap: round; opacity: .55; }

/* relaxed — content / half-lidded: keep the iris clearly readable under the lid */
.lens-eye.is-relaxed .le-iris { opacity: .7; }

/* stale — the read is old: the whole eye fades, the gaze has drifted off */
.lens-eye.is-stale .le-frame { opacity: .7; }
.lens-eye.is-stale .le-iris { opacity: .4; }
.lens-eye.is-stale .le-pupil { opacity: .55; }

/* live (judging) — the full digital read: spin + saccade + mechanical blink */
.lens-eye.is-live { animation: digital-blink 5s infinite; }
.lens-eye.is-live .le-saccade { transform-origin: 50px 50px; animation: darting-eye 4s infinite cubic-bezier(0.25, 1, 0.5, 1); }
.lens-eye.is-live .le-iris { stroke-dasharray: 25 15; opacity: .9; animation: digital-eye-spin 1.2s linear infinite; }

/* the live reticle breathes while the read is on */
@keyframes lens-reticle-breathe { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
.lens-reticle-live { animation: lens-reticle-breathe 1.7s ease-in-out infinite; }

/* ---- Ghost AI diamond — the Night Eyes affordance that rests near-invisible ----
   quiet: a faint ✦; blooms to full strength on row hover; solid gold wash +
   glow halo when open. (Mirrors the design's .sl-diamond states.) */
.ghost-diamond { position: relative; display: grid; place-items: center; padding: 0; border: 0; border-radius: 999px; background: transparent; cursor: pointer; transition: opacity .18s ease, transform .18s ease, background .18s ease; }
.ghost-diamond .gd-spark { position: relative; line-height: 1; }
.ghost-diamond:hover { transform: scale(1.12); }
.ghost-diamond.is-quiet { opacity: .26; }
.ghost-diamond.is-hover { opacity: 1; transform: scale(1.12); }
.ghost-diamond.is-open { opacity: 1; background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--gold) 18%, var(--surface)), color-mix(in srgb, var(--gold) 6%, transparent) 72%); }
.ghost-diamond .gd-halo { position: absolute; width: 78%; height: 78%; border-radius: 999px; background: radial-gradient(circle, color-mix(in srgb, var(--gold) 28%, transparent), transparent 70%); pointer-events: none; }

/* a section-header row whose hover blooms its otherwise-quiet diamond */
.gd-row:hover .ghost-diamond.is-quiet { opacity: 1; }
`;

export default function ShowcaseUI() {
  // interactive specimen state
  const [seg, setSeg] = useState('stream');
  const [pipe, setPipe] = useState(true);
  const [pin, setPin] = useState(true);
  const [check, setCheck] = useState(true);
  const [filterOn, setFilterOn] = useState('a');
  const [swatch, setSwatch] = useState('#c0552f');
  const [navSel, setNavSel] = useState(0);
  const [navRow, setNavRow] = useState(1);

  return (
    <ThemeProvider>
      <style>{DIGITAL_EYE_CSS}</style>
      <div
        className="wv2-root text-foreground"
        style={{
          gap: 12,
          padding: 12,
          background:
            'radial-gradient(ellipse 120% 85% at 50% -10%, color-mix(in srgb, var(--paper) 45%, var(--surface)) 0%, var(--surface) 62%)',
        }}
      >
        {/* top bar panel */}
        <Card variant="container" className="flex shrink-0 items-center gap-3 px-4 py-2.5">
          <Spark style={{ fontSize: 16 }} />
          <span className="font-serif text-[15px] font-semibold text-foreground">UI showcase</span>
          <Label muted className="hidden sm:inline">app · shadcn kit</Label>
          <span className="flex-1" />
          <Label muted>theme</Label>
          <ThemePicker />
        </Card>

        {/* body: left margin · center · right margin */}
        <div className="flex min-h-0 flex-1 gap-3">
          {/* left margin panel — nav rail (nav button, icon layout).
              Paper base, matching the real app sidebar panel — the active
              pill's gradient (ai-bg→terra-soft) is tuned to read against paper. */}
          <Card variant="container" className="flex w-[76px] shrink-0 flex-col items-center gap-1 bg-[var(--paper)] px-1.5 py-3">
            {[
              { Icon: Lightbulb, label: 'Ideas' },
              { Icon: Layers, label: 'Threads' },
              { Icon: FileText, label: 'Write' },
              { Icon: Globe, label: 'World' },
              { Icon: Users, label: 'People' },
            ].map(({ Icon, label }, i) => (
              <NavButton
                key={label}
                layout="icon"
                active={navSel === i}
                onClick={() => setNavSel(i)}
                icon={<Icon size={19} strokeWidth={1.7} />}
              >
                {label}
              </NavButton>
            ))}
          </Card>

          {/* MIDDLE REGION — scrolls; centers the central panel with obvious
              margins. The reserved margin gutter sits in the space to the LEFT of
              the panel (between it and the sidebar) and travels with it. */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[1320px] gap-6 px-4 sm:gap-8 sm:px-8">
              {/* RESERVED margin gutter — the real world-margin-style gutter
                  (sticky glossy section marks) is built by a separate team; here we
                  only hold the space + hint at it. Sticky so it tracks scroll. (xl+) */}
              <aside className="hidden shrink-0 lg:block lg:w-[184px]">
                <div className="sticky top-1 flex flex-col gap-4 pt-1">
                  <div className="rounded-[var(--r-md)] border border-dashed border-border px-3 py-2.5">
                    <div className="ty-system-eyebrow">margin</div>
                    <div className="ty-system-caption mt-1">Reserved space — the world-margin gutter (another team) mounts here and travels with the panel.</div>
                  </div>
                  <div className="flex flex-col gap-3 opacity-60">
                    {[
                      { mark: <EntityMark kind="person" color={ASP.char} size={20} />, label: 'Characters', sub: 'the cast' },
                      { mark: <EntityMark kind="location" color={ASP.loc} size={20} />, label: 'The Vault', sub: 'a place' },
                      { mark: <EntityMark kind="thread" color={ASP.thread} size={20} />, label: 'Revenge arc', sub: 'a thread' },
                    ].map((e) => (
                      <div key={e.label} className="flex items-center gap-2">
                        {e.mark}
                        <div className="min-w-0">
                          <div className="ty-system-label truncate">{e.label}</div>
                          <div className="ty-system-caption">{e.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              {/* CENTRAL PANEL — the catalogue content */}
              <main className="min-w-0 max-w-3xl flex-1 pb-16 pt-1">
                {/* BRAND */}
                <Section title="Brand" name="logo exploration — 8 glyph candidates (W/V · checkmark · eye · constellation), judged on live tokens at icon + favicon size">
                  <BrandLogoSpecimens />
                </Section>

                {/* BUTTONS */}
                <Section title="Buttons" name="button — all button text is SYSTEM family (system label)">
                  <Spec label="ai button sm" use="Extract / Generate / Suggest — gold = AI">
                    <Button variant="ai" size="sm"><Spark /> Generate</Button>
                    <Button variant="ai" size="md"><Spark /> Suggest gauges</Button>
                    <AiDiamond />
                    <AiDiamond size={28} />

                  </Spec>
                  <Spec label="primary button" use="the main action of a cluster">
                    <Button variant="primary" size="sm">Draft character</Button>
                    <Button variant="primary"><Plus size={15} /> New storyline</Button>
                    <Button variant="secondary" size="sm">Draft thread</Button>
                    <Button variant="secondary">Cancel</Button>
                    <Button variant="primary" size="icon"><ArrowUp size={15} /></Button>
                    <Button variant="primary" size="icon" disabled><ArrowUp size={15} /></Button>
                  </Spec>
                  <Spec label="ghost button icon" use="quiet utility — close / collapse / nav">
                    <Button variant="ghost" size="icon"><X size={15} /></Button>
                    <Button variant="ghost" size="icon"><ChevronLeft size={15} /></Button>
                    <Button variant="ghost" size="sm">Save all</Button>
                    <Button variant="destructive" size="icon"><Trash2 size={14} /></Button>
                    <Button variant="dashed" size="xs">+ tag</Button>
                    <Button variant="dashed" size="sm"><Plus size={13} /> add act</Button>
                    <Button variant="link">see more</Button>
                  </Spec>
                  <Spec label="nav button" use="a SELECTABLE rail item — inactive = ghost (no button look), active = the app rail pill; hover an inactive one to preview. normal layout = inline icon + label">
                    <div className="flex w-56 flex-col gap-1 rounded-[var(--r-lg)] bg-[var(--paper)] p-2">
                      {[
                        { Icon: Lightbulb, label: 'Ideas' },
                        { Icon: Layers, label: 'Threads' },
                        { Icon: FileText, label: 'Write' },
                      ].map(({ Icon, label }, i) => (
                        <NavButton key={label} active={navRow === i} onClick={() => setNavRow(i)} icon={<Icon size={17} strokeWidth={1.7} />}>{label}</NavButton>
                      ))}
                    </div>
                  </Spec>
                  <Spec label="nav button · icon" use="the large stacked tile (glyph + caption) of the collapsed rail — same active / hover treatment">
                    <div className="flex gap-1 rounded-[var(--r-lg)] bg-[var(--paper)] p-2">
                      {[
                        { Icon: Lightbulb, label: 'Ideas' },
                        { Icon: Layers, label: 'Threads' },
                        { Icon: FileText, label: 'Write' },
                      ].map(({ Icon, label }, i) => (
                        <NavButton key={label} layout="icon" active={navRow === i} onClick={() => setNavRow(i)} icon={<Icon size={19} strokeWidth={1.7} />}>{label}</NavButton>
                      ))}
                    </div>
                  </Spec>
                </Section>

                {/* CHIPS — three distinct kinds */}
                <Section title="Chips" name="chip — entity · tag · button (distinct UI) · SYSTEM family (system caption)">
                  <Spec label="entity chip" use="a story entity — tinted pill; REAL entities show the glossy entity glyph, unresolved show a dot">
                    <Chip variant="entity" dot={ASP.char} real entityKind="person">Mara</Chip>
                    <Chip variant="entity" dot={ASP.char} real entityKind="person" onRemove={() => { }}>Jonah</Chip>
                    <Chip variant="entity" dot={ASP.loc}>The Vault</Chip>
                    <Chip variant="entity" dot={ASP.thread} pressed>Revenge arc</Chip>
                    <Chip variant="entity" dot="var(--gold)" author onRemove={() => { }}>Mentor</Chip>
                  </Spec>
                  <Spec label="tag chip" use="a passive label — faint outlined pill (no button affordance)">
                    <Chip variant="tag">betrayal</Chip>
                    <Chip variant="tag" onRemove={() => { }}>#myth</Chip>
                    <Chip variant="tag" size="xs">foreshadow</Chip>
                  </Spec>
                  <Spec label="inside tag chip" use="lives in a list/phrase — no border, just a delete; optional tiny colour dot">
                    <div className="flex flex-col items-start gap-0.5">
                      <Chip variant="inside" size="xs" onRemove={() => { }}>betrayal</Chip>
                      <Chip variant="inside" size="xs" dot={ASP.char} onRemove={() => { }}>Mara</Chip>
                      <Chip variant="inside" size="xs" dot={ASP.thread} onRemove={() => { }}>Revenge arc</Chip>
                    </div>
                  </Spec>
                  <Spec label="button chip" use="interactive facet — border + background; may carry a dot or icon">
                    <Chip variant="button" dot={ASP.idea}>Plot</Chip>
                    <Chip variant="button"><List size={12} /> Group</Chip>
                    <Chip variant="button" pressed>Selected</Chip>
                  </Spec>
                  <Spec label="filter chip" use="the braindumps filter strip — no idle border/background; active = subtle fill">
                    {(['a', 'b', 'c'] as const).map((k, i) => (
                      <Chip key={k} variant="filter" pressed={filterOn === k} count={[12, 4, 7][i]} dot={i === 2 ? ASP.idea : undefined} onClick={() => setFilterOn(k)}>
                        {['All', 'Pinned', 'Plot'][i]}
                      </Chip>
                    ))}
                  </Spec>
                  <Spec label="count badge · status badge" use="quantity / a state (colour = state)">
                    <Badge>128</Badge>
                    <Badge variant="status" tone="clay">gap</Badge>
                    <Badge variant="status" tone="teal">watching</Badge>
                    <Badge variant="status" tone="gold">pro</Badge>
                    <Badge variant="status" tone="sage">ok</Badge>
                  </Spec>
                  <Spec label="swatch" use="round colour choice — ring = selected">
                    {['#c0552f', '#3d8c8a', '#7a5ea3', '#c79a3e'].map((c) => (
                      <Swatch key={c} color={c} selected={swatch === c} onClick={() => setSwatch(c)} />
                    ))}
                  </Spec>
                </Section>

                {/* IDEA ROW — the exact braindumps stream row */}
                <Section title="Idea row" name="the braindumps stream row — STORY family (story body) · paper-tint hover, colour bar, pinned">
                  <div className="flex flex-col">
                    {[
                      { body: 'A locked vault that only opens for the dead.', tags: [['The Vault', ASP.loc]], color: undefined, pinned: false },
                      { body: 'Mara realises the mentor has been lying the whole time — the betrayal lands in the rain.', tags: [['Mara', ASP.char], ['Revenge arc', ASP.thread]], color: '#c0552f', pinned: false },
                      { body: 'Open with the funeral, not the murder.', tags: [], color: undefined, pinned: true },
                    ].map((row, i) => (
                      <div
                        key={i}
                        className={cn('kit-idea-row group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-3 py-3', row.pinned && 'pinned', row.color && 'has-color')}
                        style={row.color ? ({ ['--idea-c' as any]: row.color }) : undefined}
                      >
                        <DragHandle className="pt-1 opacity-0 transition-opacity group-hover:opacity-70" />
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <p className="kit-idea-body m-0">{row.body}</p>
                          {row.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {row.tags.map(([name, c]) => (
                                <Chip key={name} variant="entity" size="xs" dot={c}>{name}</Chip>
                              ))}
                            </div>
                          )}
                        </div>
                        <PinToggle pinned={row.pinned} onChange={() => { }} className="pt-0.5" />
                      </div>
                    ))}
                  </div>
                </Section>

                {/* HEADS */}
                <Section title="Heads" name="page · rail · container (gradient CardHead shown in Cards)">
                  <Spec label="page head" ty="eyebrow: system eyebrow · title: system title · sub: story" use="eyebrow + glyph + title + muted suffix + actions on the right">
                    <PageHead
                      eyebrow="Plan · ideas"
                      icon={<Lightbulb size={22} strokeWidth={1.7} />}
                      title="Ideas"
                      suffix="· 8"
                      actions={<Button variant="ai" size="sm"><Spark /> Extract</Button>}
                      className="w-full max-w-lg"
                    />
                  </Spec>
                  <Spec label="container head" ty="title: system title · sub: system caption" use="a lighter gradient head (icon-in-box + heading + subheading) — bordered & rounded by its container, not itself">
                    <Card variant="inner" className="w-72 overflow-hidden p-0">
                      <ContainerHead icon={<Layers size={16} strokeWidth={1.8} />} title="Idea tree" subtitle="Tags & sparks" />
                      <div className="p-3 text-[13px] text-muted-foreground">tag tree, sparks, recent…</div>
                    </Card>
                  </Spec>
                  <Spec label="rail head" ty="title: story title · sub: system caption" use="transparent (no background) — bare glossy world-rail glyph + title + subtitle + a button on the right">
                    <div className="w-72">
                      <RailHead
                        icon={<EntityMark kind="location" color="var(--asp-locations)" size={24} />}
                        title="World"
                        subtitle="your premise"
                        action={<Button variant="secondary" size="icon"><ChevronLeft size={14} /></Button>}
                      />
                    </div>
                  </Spec>
                </Section>

                {/* FORMS */}
                <Section title="Forms" name="field forms — label: system eyebrow · field / placeholder / input value: STORY (story body)">
                  <div className="flex flex-wrap gap-5">
                    <div>
                      <Eyebrow className="mb-2">simple · normal</Eyebrow>
                      <Card variant="container" className="w-64">
                        <Field label="Wants" value="To clear his father's name" />
                        <Field label="Needs" value="To forgive himself first" />
                        <Field label="Misbelieves" value="That control equals safety" className="!mb-0" />
                      </Card>
                    </div>
                    <div>
                      <Eyebrow className="mb-2">simple · suggest (green)</Eyebrow>
                      <Card variant="container" className="w-64">
                        <Field label="Wants" value="" proposed={{ value: "To clear his father's name", onAccept: () => { }, onReject: () => { } }} />
                        <Field label="Needs" value="" proposed={{ value: 'To forgive himself first', onAccept: () => { }, onReject: () => { } }} />
                        <Field label="Misbelieves" value="" proposed={{ value: 'That control equals safety', onAccept: () => { }, onReject: () => { } }} />
                        <button type="button" className="kit-acceptall">✓ Accept all · 3</button>
                      </Card>
                    </div>
                    <div>
                      <Eyebrow className="mb-2">simple · placeholder</Eyebrow>
                      <Card variant="container" className="w-64">
                        <Field label="Wants" value="" />
                        <Field label="Needs" value="" />
                        <Field label="Misbelieves" value="" className="!mb-0" />
                      </Card>
                    </div>
                  </div>
                  <Spec label="madlibs form (appearance)" ty="story body (sentence + blanks)" use="fill-in-the-blank sentence — click a blank to fill, Tab advances; one shown AI-suggested (green)">
                    <Card variant="container" className="w-full max-w-md">
                      <p className="kit-madlib">
                        <b>Maya</b> is <Field inline value="29" placeholder="how old?" />, <Field inline value="" placeholder="gender?" />, <Field inline value="lean and tall" placeholder="build?" /> in build, with <Field inline value="" placeholder="hair?" proposed={{ value: 'cropped black', onAccept: () => { }, onReject: () => { } }} /> hair and <Field inline value="grey" placeholder="eyes?" /> eyes.
                      </p>
                    </Card>
                  </Spec>
                </Section>

                {/* BEAT LIST */}
                <Section title="Beat input" name="beat-list — beat text is STORY (story body) · the “add a beat” button is SYSTEM">
                  <Spec label="beat list" use="text (solid dot) · placeholder (dashed ring) · heading (bold, no dot) — click=caret, ⠿=drag, Tab=cycle type, Enter=add; focus borders the whole row">
                    <Card variant="inner" className="w-full max-w-md">
                      <BeatList color="#b5503a" />
                    </Card>
                  </Spec>
                </Section>

                {/* BEAT MARKER */}
                <Section title="Beat marker" name="beat-marker — ONE glyph for every beat surface · COLOUR = thread · SHAPE-FILL = kind · FORM = context">
                  {/* the lifecycle morph */}
                  <Spec label="lifecycle" use="thread (circles only) → merge column (unmerged circle / merged square) → chapters rail (check)">
                    {[
                      { lbl: 'thread placeholder', el: <BeatMarker kind="placeholder" form="circle" color="#b5503a" size={20} /> },
                      { lbl: 'thread text', el: <BeatMarker kind="text" form="circle" color="#b5503a" size={20} /> },
                      { lbl: 'merge · unmerged', el: <BeatMarker kind="text" form="circle" content="number" num={3} color="#b5503a" size={20} /> },
                      { lbl: 'merge · merged', el: <BeatMarker kind="text" form="square" content="number" num={3} color="#b5503a" size={20} muted /> },
                      { lbl: 'rail · written', el: <BeatMarker kind="text" form="square" content="check" color="#b5503a" size={20} /> },
                    ].map((s, i, arr) => (
                      <div key={s.lbl} className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1.5">
                          {s.el}
                          <code className="font-sans text-[10px] text-muted-foreground whitespace-nowrap">{s.lbl}</code>
                        </div>
                        {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
                      </div>
                    ))}
                  </Spec>

                  {/* kind → fill, across every form */}
                  <Spec label="kind → fill" use="text = solid · placeholder = hollow dashed · heading = two concentric circles (bold inner dot, thin outer ring)">
                    <div className="grid grid-cols-[80px_repeat(4,1fr)] items-center gap-x-4 gap-y-3 max-w-2xl">
                      <span />
                      {['circle', 'circle + №', 'square + №', 'dash'].map((h) => (
                        <code key={h} className="font-sans text-[10px] text-muted-foreground">{h}</code>
                      ))}
                      {(['text', 'placeholder', 'heading'] as const).map((kind) => (
                        <Fragment key={kind}>
                          <code className="font-sans text-[11px] font-semibold text-foreground">{kind}</code>
                          <BeatMarker kind={kind} form="circle" color="#b5503a" size={20} />
                          <BeatMarker kind={kind} form="circle" content="number" num={2} color="#b5503a" size={20} />
                          <BeatMarker kind={kind} form="square" content="number" num={2} color="#b5503a" size={20} />
                          <BeatMarker kind={kind} form="dash" color="#b5503a" size={18} />
                        </Fragment>
                      ))}
                    </div>
                  </Spec>

                  {/* heading completeness — outer ring reads the group */}
                  <Spec label="heading ring" use="reads its group's placeholders: dashed ring while any remain → solid ring once all filled (number/check rides the inner dot)">
                    {[
                      { lbl: 'placeholders left', el: <BeatMarker kind="heading" form="circle" content="number" num={1} color="#b5503a" size={20} complete={false} /> },
                      { lbl: 'all filled', el: <BeatMarker kind="heading" form="circle" content="number" num={1} color="#b5503a" size={20} complete /> },
                      { lbl: 'rail · written', el: <BeatMarker kind="heading" form="square" content="check" color="#b5503a" size={20} complete /> },
                    ].map((s, i, arr) => (
                      <div key={s.lbl} className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1.5">
                          {s.el}
                          <code className="font-sans text-[10px] text-muted-foreground whitespace-nowrap">{s.lbl}</code>
                        </div>
                        {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
                      </div>
                    ))}
                  </Spec>

                  {/* colour = thread identity */}
                  <Spec label="colour = thread" use="the only thing colour encodes — never kind">
                    {['#b5503a', '#7a8450', '#3f7d6e', '#6b5b95', '#a23b5e'].map((c, i) => (
                      <BeatMarker key={c} kind="text" form="circle" content="number" num={i + 1} color={c} size={20} />
                    ))}
                  </Spec>

                  {/* states */}
                  <Spec label="states" use="muted (placed / unwritten dash) · flagged (a contradiction)">
                    <div className="flex flex-col items-center gap-1.5">
                      <BeatMarker kind="text" form="square" content="number" num={4} color="#b5503a" size={20} muted />
                      <code className="font-sans text-[10px] text-muted-foreground">muted</code>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <BeatMarker kind="text" form="circle" content="number" num={4} color="#b5503a" size={20} flagged />
                      <code className="font-sans text-[10px] text-muted-foreground">flagged</code>
                    </div>
                  </Spec>
                </Section>

                {/* PHRASES */}
                <Section title="Phrases" name="phrase — STORY family (story body); a half-sentence (bold lede); lists + joined paragraph, expandable tags">
                  <Spec label="grid" use="compact grid; bold first words; muted toggle reveals each one's tags">
                    <div className="grid max-w-2xl grid-cols-2 gap-x-8 gap-y-1">
                      <Phrase tags={[{ label: 'Mara', dot: ASP.char }, { label: 'betrayal' }]}>the mentor has been lying the whole time</Phrase>
                      <Phrase tags={[{ label: 'The Vault', dot: ASP.loc }]}>a locked vault that only opens for the dead</Phrase>
                      <Phrase tags={[{ label: 'grief' }]}>she keeps his coat on the hook</Phrase>
                      <Phrase>open with the funeral, not the murder</Phrase>
                    </div>
                  </Spec>
                  <Spec label="clamped list" use="compact one-line rows">
                    <div className="flex w-full max-w-md flex-col gap-0.5">
                      <Phrase clamp tags={[{ label: 'Revenge arc', dot: ASP.thread }]}>open with the funeral, not the murder — let the reader wonder who died and why it matters</Phrase>
                      <Phrase clamp tags={[{ label: 'Mara', dot: ASP.char }, { label: 'grief' }]}>she keeps his coat on the hook by the door for a year, telling herself she hasn't gotten to it</Phrase>
                      <Phrase clamp tags={[{ label: 'The Vault', dot: ASP.loc }]}>a locked vault that only opens for the dead and the keeper has been dead a long time</Phrase>
                    </div>
                  </Spec>
                  <Spec label="paragraph" use="the whole list as ONE paragraph, phrases joined by … ; each lede bold, each tag list collapsed">
                    <div className="max-w-lg">
                      <PhraseParagraph
                        phrases={[
                          { text: 'the mentor has been lying the whole time', tags: [{ label: 'Mara', dot: ASP.char }, { label: 'betrayal' }] },
                          { text: 'open with the funeral, not the murder', tags: [{ label: 'Revenge arc', dot: ASP.thread }] },
                          { text: 'she keeps his coat on the hook by the door', tags: [{ label: 'grief' }] },
                        ]}
                      />
                    </div>
                  </Spec>
                </Section>

                {/* INPUTS — we rarely use plain text inputs */}
                <Section title="Inputs" name="input — search / tag input: SYSTEM · the transparent inline +serif (braindump) input: STORY">
                  <Spec label="words input" use="custom tags · search ideas · short app-text (not story prose)">
                    <Input variant="search" placeholder="Search ideas…" wrapClassName="w-60" />
                    <Input variant="text" fieldSize="sm" placeholder="#custom-tag" wrapClassName="w-44"
                      trailingAction={<Button variant="ghost" size="icon-sm"><Plus size={14} /></Button>} />
                  </Spec>
                  <Spec label="transparent input → focus-box" use="the braindump input box: a transparent field inside a box; focusing the field borders the BOX (not the field), no background">
                    <Card variant="item" className="kit-focus-box w-full max-w-md">
                      <Input variant="inline" serif placeholder="empty the brain…" defaultValue="Mara realises the mentor has been lying." wrapClassName="w-full text-base" />
                    </Card>
                  </Spec>
                  {/* <Spec label="paper textarea" use="the dump — the main writing act">
                  <Textarea variant="paper" rows={3} placeholder="a name, a place, a what-if…" className="max-w-md" />
                </Spec> */}
                </Section>

                {/* CLICK TO FOCUS — the whitespace rule */}
                <Section title="Click to focus" name="rule: clicking anywhere in a field's container focuses the field — minimise dead space. Only labels/headings opt out (unless they toggle a section).">
                  <Spec label="click the box → focus the field" use="click the padding, the label gap, any empty space — the input focuses. Most surfaces are ‘click to type’, so a near-miss click that doesn't focus is a bug.">
                    <ClickFocus className="w-full max-w-md cursor-text rounded-[var(--r-lg)] bg-[var(--container)] p-5">
                      <Eyebrow className="mb-2">wants</Eyebrow>
                      <Input variant="inline" serif placeholder="what does she want?" wrapClassName="w-full text-base" />
                      <div className="mt-3 font-sans text-[11px] text-muted-foreground">↑ click any empty space in this card — the field takes focus.</div>
                    </ClickFocus>
                  </Spec>
                </Section>

                {/* CARDS — container + item */}
                <Section title="Cards" name="card — container · item">
                  <Spec label="container card" use="a base container — holds a section of content (often other cards)">
                    <Card variant="container" className="w-full max-w-md">
                      <SectionHeading title="Worldbuilding" sub="3 places" className="mb-3" />
                      <div className="grid grid-cols-2 gap-3">
                        <Card variant="item"><div className="font-serif text-sm text-foreground">The Vault</div><Label muted className="text-[11px]">a sealed chamber</Label></Card>
                        <Card variant="item"><div className="font-serif text-sm text-foreground">Old Pier</div><Label muted className="text-[11px]">where it began</Label></Card>
                        <Card variant="dashed" className="grid place-items-center text-muted-foreground"><span className="text-[12px]"><Plus size={14} className="mx-auto" /> add place</span></Card>
                      </div>
                    </Card>
                  </Spec>
                  <Spec label="item card" use="a single item — surface tile, hover-lifts; for entity grids/lists. +accent for identity colour">
                    <Card variant="item" className="w-52"><div className="font-serif text-base text-foreground">Mara Vance</div><Label muted className="text-[11px]">protagonist</Label></Card>
                    <Card variant="item" accent={ASP.loc} className="w-52"><div className="font-serif text-base text-foreground">The Vault</div><Label muted className="text-[11px]">location</Label></Card>
                    <Card variant="pending" className="w-52"><div className="font-serif text-base text-foreground">Hidden Library</div><Label muted className="text-[11px]">AI-extracted</Label></Card>
                  </Spec>
                  <Spec label="container (gradient head) ▸ inner container" use="outer: light shade + gradient head (avatar + title + subtitle + badge + actions); inner: slight border, no background, icon heading">
                    <Card variant="container" className="w-full max-w-md overflow-hidden p-0">
                      <CardHead
                        title="The Reader"
                        subtitle="reading along"
                        badge={<Chip variant="tag" size="xs" dot={ASP.idea}>Braindumps</Chip>}
                        actions={
                          <>
                            <Button variant="secondary" size="icon"><Pencil size={14} /></Button>
                            <Button variant="ghost" size="icon"><PanelRight size={15} /></Button>
                          </>
                        }
                      />
                      <div className="p-4">
                        <Card variant="inner">
                          <div className="mb-2 flex items-center gap-2">
                            <FileText size={13} className="text-muted-foreground" />
                            <span className="font-serif text-sm font-semibold text-foreground">Beats</span>
                          </div>
                          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                            <span>· Mara confronts the mentor</span>
                            <span>· The vault won't open</span>
                          </div>
                        </Card>
                      </div>
                    </Card>
                  </Spec>
                </Section>

                {/* HEADINGS */}
                {/* <Section title="Headings & labels" name="heading · label">
                <Spec label="page heading" use="you-are-here — serif = story voice">
                  <div><Eyebrow>Plan · ideas</Eyebrow><Heading as="h1">Ideas</Heading></div>
                </Spec>
                <Spec label="section heading" use="sub-section title (+ sub)">
                  <SectionHeading title="Idea tree" sub="Tags & sparks" />
                </Spec>
                <Spec label="eyebrow · micro label" use="wayfinding / metadata · transient">
                  <Eyebrow>Plan · outline</Eyebrow>
                  <Label>pack 1</Label>
                  <Label muted>reading…</Label>
                </Spec>
              </Section> */}

                {/* TYPOGRAPHY — the three families. Each level renders its own
                  name as the example; real copy sits beneath it, in the same style. */}
                <Section title="Typography" name="system · story · ai — each level's NAME is rendered in its own style (defined in ui/typography.css)">
                  {TYPOGRAPHY.map((fam) => (
                    <div key={fam.family} className="flex flex-col">
                      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border pb-1">
                        <span className="font-sans text-[12px] font-bold uppercase tracking-wide text-foreground">{fam.family}</span>
                        <span className="font-sans text-[11px] text-muted-foreground">{fam.font}</span>
                      </div>
                      <div className="flex flex-col">
                        {fam.levels.map((lvl) => (
                          <div key={lvl.cls} className="flex flex-col gap-1 border-b border-border/40 py-3 last:border-b-0">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                              <span className={lvl.cls}>{lvl.name}</span>
                              <code className="shrink-0 font-sans text-[10.5px] text-muted-foreground">.{lvl.cls}</code>
                            </div>
                            <span className={cn(lvl.cls, 'opacity-60')}>{lvl.example}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </Section>

                {/* ICONS & GLYPHS — the icon taxonomy: system · story · ai */}
                <Section title="Icons & glyphs" name="three icon families — system (flat line, sometimes boxed) · story (glossy 3D, NEVER boxed) · ai (Night Eyes)">
                  {/* SYSTEM ICONS */}
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border pb-1">
                      <span className="font-sans text-[12px] font-bold uppercase tracking-wide text-foreground">system icons</span>
                      <span className="font-sans text-[11px] text-muted-foreground">flat lit line glyphs (lucide) — app chrome / wayfinding. Used in the left margin, sidebar & container heads.</span>
                    </div>
                    <Spec label="boxed" use="glyph in a lit tile — sidebar tiles & container heads (the box may also carry the label)">
                      <span className="kit-head-box"><Globe size={16} strokeWidth={1.8} /></span>
                      <span className="kit-head-box"><Layers size={16} strokeWidth={1.8} /></span>
                      <span className="kit-head-box"><FileText size={16} strokeWidth={1.8} /></span>
                    </Spec>
                    <Spec label="ghost" use="bare glyph, no box — input-field icons (search) & basic utilities (add / edit / close / panel)">
                      <Plus size={16} className="text-muted-foreground" />
                      <Pencil size={15} className="text-muted-foreground" />
                      <X size={15} className="text-muted-foreground" />
                      <PanelRight size={16} className="text-muted-foreground" />
                    </Spec>
                  </div>

                  {/* STORY ICONS */}
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border pb-1">
                      <span className="font-sans text-[12px] font-bold uppercase tracking-wide text-foreground">story icons</span>
                      <span className="font-sans text-[11px] text-muted-foreground">glossy 3D glyphs, tinted by identity — NEVER a box / border / background. For things that live IN the story.</span>
                    </div>
                    <Spec label="entity marks" use="person · place · item · rule · thread, then ThreadedStoryIcon (any glyph + thread badge: story-thread, character-thread) — the glossy entity tier">
                      <EntityMark kind="person" color={ASP.char} size={30} />
                      <EntityMark kind="location" color={ASP.loc} size={30} />
                      <EntityMark kind="item" color="var(--asp-items)" size={30} />
                      <EntityMark kind="rule" color="var(--asp-rules)" size={30} />
                      <EntityMark kind="thread" color={ASP.thread} size={30} />
                      <ThreadedStoryIcon iconKey="story" size={30} />
                      <ThreadedStoryIcon iconKey="person" size={30} />
                    </Spec>
                    <Spec label="section marks" use="bespoke world-section glyphs — faction · magic · creature · history · culture · story · world">
                      <SectionMark glyph="faction" color="var(--asp-factions)" size={30} />
                      <SectionMark glyph="magic" color="var(--asp-magic)" size={30} />
                      <SectionMark glyph="creature" color="var(--asp-creatures)" size={30} />
                      <SectionMark glyph="history" color="var(--asp-history)" size={30} />
                      <SectionMark glyph="culture" color="var(--asp-culture)" size={30} />
                      <SectionMark glyph="story" color="var(--asp-story)" size={30} />
                      <SectionMark glyph="world" color="var(--asp-world)" size={30} />
                    </Spec>
                  </div>

                  {/* AI ICON */}
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border pb-1">
                      <span className="font-sans text-[12px] font-bold uppercase tracking-wide text-foreground">ai icon</span>
                      <span className="font-sans text-[11px] text-muted-foreground">the single Night Eyes mark — gold, a little 3D &amp; shiny (a diamond for now; may change).</span>
                    </div>
                    <Spec label="night eyes" use="the AI brand mark — the spark ✦ and the diamond affordance">
                      <Spark style={{ fontSize: 22 }} />
                      <AiDiamond />
                      <AiDiamond size={28} />
                    </Spec>
                    <Spec label="digital eye" use="unreal, high-tech vector eye with loading iris, saccade scanning, and mechanical blink">
                      <div className="digital-eye-container">
                        <svg className="digital-eye" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                          {/* Geometric High-Tech Frame */}
                          <path className="vector-frame" d="M 10 50 L 30 25 L 70 25 L 90 50 L 70 75 L 30 75 Z" />

                          {/* The Group that controls the darting eye movement */}
                          <g className="saccade-movement">
                            {/* The Spinner: representing the digital iris */}
                            <circle className="spinning-iris" cx="50" cy="50" r="16" />

                            {/* The Pupil: the core of the eye */}
                            <circle className="pupil-core" cx="50" cy="50" r="6" />
                          </g>
                        </svg>
                      </div>
                    </Spec>
                    <Spec label="ghost diamond · quiet → hover → open" use="the Night Eyes affordance that hides until needed — rests near-invisible, blooms to full on row hover, lights up gold when open. The whole right card below is a live row: hover it to watch the quiet diamond bloom.">
                      <div className="flex flex-wrap items-center gap-6">
                        <div className="flex flex-col items-center gap-1.5 text-center">
                          <GhostDiamond state="quiet" />
                          <span className="font-sans text-[11px] font-semibold text-foreground">quiet</span>
                          <span className="font-sans text-[10px] text-muted-foreground">at rest</span>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 text-center">
                          <GhostDiamond state="hover" />
                          <span className="font-sans text-[11px] font-semibold text-foreground">hover</span>
                          <span className="font-sans text-[10px] text-muted-foreground">row hovered</span>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 text-center">
                          <GhostDiamond state="open" />
                          <span className="font-sans text-[11px] font-semibold text-foreground">open</span>
                          <span className="font-sans text-[10px] text-muted-foreground">chat active</span>
                        </div>
                        {/* live row — hover anywhere on it to bloom the quiet diamond */}
                        <div className="gd-row flex min-w-[220px] flex-1 items-center gap-3 rounded-[var(--r-md)] border border-border bg-[color-mix(in_srgb,var(--paper)_55%,var(--surface))] px-3 py-2">
                          <span className="flex-1 font-sans text-[12px] text-muted-foreground">hover this row →</span>
                          <GhostDiamond state="quiet" size={26} />
                        </div>
                      </div>
                    </Spec>
                  </div>

                  {/* ENTITY CHIP: dot → story icon when real */}
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border pb-1">
                      <span className="font-sans text-[12px] font-bold uppercase tracking-wide text-foreground">entity chip · dot → story icon</span>
                      <span className="font-sans text-[11px] text-muted-foreground">an entity chip wears a plain dot until it becomes REAL (a character / place / item) — then the dot becomes its glossy story icon.</span>
                    </div>
                    <Spec label="unresolved → real" use="left = a dot (just a mention); right = real, so the dot is now the entity's story icon">
                      <Chip variant="entity" dot={ASP.char}>Mara</Chip>
                      <Chip variant="entity" dot={ASP.char} real entityKind="person">Mara</Chip>
                      <span className="mx-1 text-muted-foreground">·</span>
                      <Chip variant="entity" dot={ASP.loc}>The Vault</Chip>
                      <Chip variant="entity" dot={ASP.loc} real entityKind="location">The Vault</Chip>
                    </Spec>
                  </div>
                </Section>

                {/* DASHED = provisional / AI-suggested */}
                <Section title="Dashed = provisional" name="a dashed border / dashed square = NOT real yet — usually an AI suggestion. Accept → it turns solid / becomes a story glyph.">
                  <Spec label="suggested entity → real" use="a mention-only entity wears a dashed empty square; once made real (a character / place / item) the square becomes its glossy story glyph (braindumps rail)">
                    <div className="flex items-center gap-3">
                      <DashedSquare size={26} />
                      <span className="font-sans text-[11px] text-muted-foreground">accept →</span>
                      <EntityMark kind="person" color={ASP.char} size={26} />
                    </div>
                    <div className="flex items-center gap-3">
                      <DashedSquare size={26} />
                      <span className="font-sans text-[11px] text-muted-foreground">accept →</span>
                      <EntityMark kind="location" color={ASP.loc} size={26} />
                    </div>
                  </Spec>
                  <Spec label="suggested chip → real chip" use="AI suggests a tag with a dashed border; accept makes it a solid, real chip">
                    <Chip variant="tag" className="border-dashed opacity-80">betrayal</Chip>
                    <span className="font-sans text-[11px] text-muted-foreground">accept →</span>
                    <Chip variant="tag">betrayal</Chip>
                  </Spec>
                  <Spec label="suggested / add button" use="a dashed button = an AI-offered action or an empty add-slot — same language: dashed = a slot to be filled / made real">
                    <Button variant="dashed" size="sm"><Plus size={13} /> add place</Button>
                  </Spec>
                  <Spec label="square checkbox" use="the square checkbox uses the same language — dashed = unchecked / not-yet-real; (the round Checkbox is the multi-select control)">
                    <DashedSquare size={18} />
                    <Checkbox checked onChange={() => { }} />
                  </Spec>
                </Section>

                {/* MARKS */}
                <Section title="Marks & structure" name="spark · entity-dot · kbd · spinner · drag-handle · progress">
                  <Spec label="spark · entity dot" use="AI brand · entity identity">
                    <Spark className="text-lg" />
                    <EntityDot color={ASP.char} />
                    <EntityDot color={ASP.loc} />
                  </Spec>
                  <Spec label="kbd · spinner · drag-handle" use="shortcut · loading · grip">
                    <span className="flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>↵</Kbd></span>
                    <Spinner />
                    <DragHandle />
                  </Spec>
                  <Spec label="progress" use="coverage / completion">
                    <Progress value={62} className="w-48" />
                  </Spec>
                </Section>

                {/* CONTROLS */}
                <Section title="Toggles & selection" name="segmented · toggle · pin · checkbox">
                  <Spec label="segmented" use="either/or mode (Stream/Canvas, Beats/Scenes)">
                    <Segmented
                      value={seg}
                      onChange={setSeg}
                      options={[
                        { value: 'stream', label: <><List size={14} /> Stream</> },
                        { value: 'canvas', label: <><LayoutGrid size={14} /> Canvas</> },
                      ]}
                    />
                  </Spec>
                  <Spec label="toggle" use="on/off (analysis pipeline)">
                    <Toggle on={pipe} onChange={setPipe}>Pipeline</Toggle>
                  </Spec>
                  <Spec label="pin toggle · checkbox" use="keep (gold ★) · multi-select">
                    <PinToggle pinned={pin} onChange={setPin} />
                    <Checkbox checked={check} onChange={setCheck} />
                  </Spec>
                </Section>

                {/* OVERLAYS */}
                <Section title="Overlays" name="popover">
                  <Spec label="popover" use="a contextual surface card with a shadow — click to open, outside-click closes">
                    <Popover trigger={<Button variant="secondary" size="sm">Open popover</Button>} width={220}>
                      <Eyebrow className="px-2 pb-1">Actions</Eyebrow>
                      <div className="flex flex-col">
                        <button className="rounded-[var(--r-sm)] px-2 py-1.5 text-left text-sm text-foreground hover:bg-secondary">Rename</button>
                        <button className="rounded-[var(--r-sm)] px-2 py-1.5 text-left text-sm text-foreground hover:bg-secondary">Duplicate</button>
                        <button className="rounded-[var(--r-sm)] px-2 py-1.5 text-left text-sm text-[var(--clay)] hover:bg-[var(--clay-soft)]">Delete</button>
                      </div>
                    </Popover>
                  </Spec>
                </Section>

                <Section title="Lenses" name="the analysis card family — chip (S) · mini card (M) · full card (L) · invent · shaped (XL) · library deck. All Spectral (ty-ai-*) for lens names + headings; native sans (ty-system-*) for descriptions, tags, buttons.">
                  {/* ── fixtures ── */}
                  {(() => {
                    const hero: PackLens = { key: 'hero', name: 'Does the Hero Grow?', type: 'arc', walk: 'thread', desc: 'Whether your main character actually changes — from who they were to who they need to become.', templateId: 'does_hero_grow' };
                    const energy: PackLens = { key: 'energy', name: 'Scene Energy', type: 'map', walk: 'outline', desc: 'How much each scene moves the story — its energy and momentum, scene by scene.', templateId: 'scene_energy' };
                    const loose: PackLens = { key: 'loose', name: 'Loose Ends', type: 'payoff', walk: 'outline', desc: 'Whether everything you make a point of setting up actually pays off later.', templateId: 'loose_ends' };
                    return (
                      <div className="lens-root flex flex-col gap-8">
                        {/* S — chip */}
                        <Spec label="chip (S)" use="footnote ribbon — name only; tap to attach/detach">
                          <div className="flex flex-wrap items-center gap-2">
                            <LensChip lens={hero} attached={false} onToggle={() => { }} />
                            <LensChip lens={energy} attached={true} onToggle={() => { }} />
                            <LensChip lens={loose} attached={false} onToggle={() => { }} />
                          </div>
                        </Spec>

                        {/* lens indicator — six lifecycle modes, all wearing our digital eye */}
                        <Spec label="lens indicator (7 modes)" use="one section-header eye that comes alive across the lens lifecycle: dormant → invited → watching → reading → verdict → stale. The READING mode IS our digital eye (spinning iris · saccade · mechanical blink).">
                          <div className="flex flex-wrap gap-6">
                            {LENS_MODES.map((m) => (
                              <div key={m.key} className="flex w-[88px] flex-col items-center gap-1.5 text-center">
                                <LensModeChip mode={m.key} count={3} />
                                <span style={{ fontFamily: 'var(--lens-sans)', fontSize: 11, fontWeight: 600, color: 'var(--lens-ink)' }}>{m.label}</span>
                                <span style={{ fontFamily: 'var(--lens-sans)', fontSize: 10, color: 'var(--lens-muted)', lineHeight: 1.3 }}>{m.state}</span>
                              </div>
                            ))}
                          </div>
                        </Spec>

                        {/* M — mini card */}
                        <Spec label="mini card (M)" use="quiet shelf — name + desc (2-line clamp) + type/walk; click opens attach panel">
                          <div className="flex flex-wrap gap-3">
                            <MiniLensCard lens={hero} onOpen={() => { }} />
                            <MiniLensCard lens={energy} bindings={[{ binding_id: 'b1', walk: 'outline', scopeType: 'character', scopeName: 'Mara Vance' }]} onOpen={() => { }} />
                            <InventMini />
                          </div>
                        </Spec>

                        {/* L — full card */}
                        <Spec label="full card (L)" use="real section — name (ty-ai-heading) + full desc + attach button; 3 cards across on the outline page">
                          <div className="grid grid-cols-3 gap-3">
                            <FullLensCard lens={hero} attached={false} onToggle={() => { }} />
                            <FullLensCard lens={energy} attached={true} onToggle={() => { }} />
                            <FullLensCard lens={loose} attached={false} onToggle={() => { }} />
                          </div>
                        </Spec>

                        {/* Library deck */}
                        <Spec label="library deck" use="the 'N more →' stacked card-backs; always sits beside the full-card grid">
                          <div className="flex items-center gap-3">
                            <LibraryDeck count={18} label="fit the outline walk" onClick={() => { }} />
                          </div>
                        </Spec>

                        {/* XL — shaped */}
                        <Spec label="shaped lens (XL)" use="Night Eyes shaping moment — full card + mini output preview; static / display-only">
                          <div style={{ maxWidth: 560 }}>
                            <LensShaping />
                          </div>
                        </Spec>
                      </div>
                    );
                  })()}
                </Section>

                {/* PAGE SHELL — the one page layout primitive, across gutter densities */}
                <Section title="Page shell" name="PageShell — centers [gutter | body], header band flush to the body's left edge. Three densities below; the title's left edge is identical across all three and the gutter docks correctly.">
                  <PageShellDemo />
                </Section>
              </main>

              {/* RIGHT MARGIN — a page-rail container in the space to the RIGHT of
                  the panel (mirrors the left margin). FIRST to collapse. (2xl+) */}
              <aside className="hidden shrink-0 2xl:block 2xl:w-[228px]">
                <div className="sticky top-1 pt-1">
                  <Card variant="container" className="overflow-hidden p-0">
                    <ContainerHead icon={<List size={16} strokeWidth={1.8} />} title="On this page" subtitle="page rail · right margin" />
                    <div className="flex flex-col gap-1.5 p-3">
                      <Phrase tags={[{ label: 'Mara', dot: ASP.char }]}>the mentor has been lying the whole time</Phrase>
                      <Phrase tags={[{ label: 'The Vault', dot: ASP.loc }]}>a vault that only opens for the dead</Phrase>
                      <Phrase>open with the funeral, not the murder</Phrase>
                    </div>
                  </Card>
                </div>
              </aside>
            </div>
          </div>

          {/* NIGHT EYES — the AI chat dock, far right (xl+). SECOND to collapse;
              in the app it becomes a toggleable overlay on smaller widths. */}
          <aside className="hidden shrink-0 xl:flex xl:w-[336px] 2xl:w-[360px]">
            <Card variant="container" className="flex h-full w-full flex-col overflow-hidden p-0">
              {/* header — the AI mark is BARE (no system box) */}
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                <Spark style={{ fontSize: 18 }} />
                <div className="min-w-0">
                  <div className="ty-ai-title" style={{ fontSize: 15, lineHeight: 1.1 }}>Night Eyes</div>
                  <div className="ty-system-caption">watching 4 threads</div>
                </div>
                <span className="flex-1" />
                <Button variant="ghost" size="icon"><PanelRight size={15} /></Button>
              </div>
              {/* messages — AI in Fraunces (ai body), the author in Inter (system body) */}
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                <div className="max-w-[85%] self-start rounded-[var(--r-lg)] bg-[var(--surface)] px-3 py-2 shadow-[var(--sh-1)]">
                  <p className="ty-ai-body m-0">Mara's age in Chapter 3 contradicts the timeline you set in the outline. Want me to reconcile it?</p>
                </div>
                <div className="max-w-[85%] self-end rounded-[var(--r-lg)] bg-secondary px-3 py-2">
                  <p className="ty-system-body m-0">Yes — keep the outline version.</p>
                </div>
                <div className="max-w-[85%] self-start rounded-[var(--r-lg)] bg-[var(--surface)] px-3 py-2 shadow-[var(--sh-1)]">
                  <p className="ty-ai-body m-0">Done. I updated her age in the scene and flagged one more mention to check.</p>
                </div>
              </div>
              {/* composer — click anywhere in it focuses the field (the whitespace rule) */}
              <ClickFocus className="cursor-text border-t border-border p-3">
                <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-input bg-[var(--surface)] px-2.5 py-1.5">
                  <Input variant="inline" placeholder="Ask Night Eyes…" wrapClassName="flex-1" />
                  <Button variant="primary" size="icon"><ArrowUp size={15} /></Button>
                </div>
              </ClickFocus>
            </Card>
          </aside>
        </div>
      </div>
    </ThemeProvider>
  );
}
