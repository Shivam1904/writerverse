/**
 * ShowcaseBrandLogos — brand/logo exploration for WriterVerse.
 *
 * 8 glyph candidates built from the brand's raw material:
 *   - W/V letterform play (V is literally half of W; verse completes write)
 *   - V as checkmark ("your story checks out" — the integrity engine)
 *   - the eye (Night Eyes / lenses — the mark that watches your story)
 *   - verse = universe (constellation — the nocturnal angle)
 *
 * Every candidate renders on live theme tokens (--ink / --terra / --gold /
 * --paper) so it can be judged across all 17 themes, at app-icon size AND
 * favicon size, and paired with the wordmark. Design-only: nothing here ships
 * until a winner is promoted into ui/BrandMark.tsx + public/favicon.svg.
 */

/* ---------------------------------------------------------------- tiles ---- */

function Tile({
  bg = 'var(--paper)',
  size = 64,
  children,
}: {
  bg?: string;
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center shadow-[inset_0_0_0_1px_var(--line-2)]"
      style={{ width: size, height: size, background: bg, borderRadius: Math.round(size * 0.22) }}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- glyphs ---- */
/* All drawn on a 64×64 grid, stroke-based, round caps — favicon-safe. */

/** 1 · The Half-W — the V is literally half the W. Write (ink) + Verse (terra). */
export function GlyphHalfW({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polyline points="10,18 20,46 32,22" stroke={ink} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="32,22 44,46 54,18" stroke={accent} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 2 · The Check-W — the W's second half bursts out as a bold checkmark. */
export function GlyphCheckW({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polyline points="8,20 17,44 26,26" stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="26,26 36,48 56,10" stroke={accent} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 3 · The Watchful W — an eye opens in the W's own valleys. */
export function GlyphEyeW({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polyline points="6,14 14,38 32,20 50,38 58,14" stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 14 38 Q 32 54 50 38" stroke={ink} strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="32" cy="36" r="5.5" fill={accent} />
    </svg>
  );
}

/** 4 · Night Eye — the hexagonal digital eye (the lens family's own eye), gold on ink. */
export function GlyphNightEye({ size = 40, stroke = 'var(--gold)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M 12 32 L 23 19 H 41 L 52 32 L 41 45 H 23 Z" stroke={stroke} strokeWidth="4" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="8.5" stroke={stroke} strokeWidth="3" />
      <circle cx="32" cy="32" r="3" fill={stroke} />
    </svg>
  );
}

/** 5 · The Nib — a pen nib whose silhouette is the V; the point lands like a check's tip. */
export function GlyphNib({ size = 40, ink = 'var(--terra)', fill = 'var(--terra-soft)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M 32 54 L 19 32 C 17 18 23 10 32 10 C 41 10 47 18 45 32 Z" stroke={ink} strokeWidth="4.5" strokeLinejoin="round" fill={fill} />
      <path d="M 32 52 L 32 36" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="32" cy="30" r="3.5" stroke={ink} strokeWidth="3" />
    </svg>
  );
}

/** 6 · The Constellation — the W traced in stars: your verse is a universe. */
export function GlyphConstellationW({ size = 40, star = 'var(--paper)', bright = 'var(--gold)' }: any) {
  const pts = [
    [10, 20],
    [20, 44],
    [32, 24],
    [44, 44],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polyline points="10,20 20,44 32,24 44,44 54,16" stroke={star} strokeWidth="1.5" opacity="0.55" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill={star} />
      ))}
      {/* the brightest star sits on the checkmark's tip */}
      <path d="M 54 8 C 55 13 57 15 62 16 C 57 17 55 19 54 24 C 53 19 51 17 46 16 C 51 15 53 13 54 8 Z" fill={bright} />
      <circle cx="16" cy="11" r="1.1" fill={star} opacity="0.6" />
      <circle cx="45" cy="9" r="1.3" fill={star} opacity="0.5" />
      <circle cx="26" cy="55" r="1.1" fill={star} opacity="0.5" />
      <circle cx="56" cy="42" r="1.2" fill={star} opacity="0.6" />
    </svg>
  );
}

/** 7 · The Lattice — W over V; their crossing encloses the AI diamond. */
export function GlyphWVDiamond({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polyline points="10,18 20,46 32,24 44,46 54,18" stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="20,16 32,42 44,16" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

/** 8 · The Seal — the Check-W knocked out of a solid terra tile: the app-store-bold treatment. */
export function GlyphSeal({ size = 40, knockout = 'var(--paper)' }: any) {
  return <GlyphCheckW size={size} ink={knockout} accent={knockout} />;
}

/* ------------------------------------------------- wave 2 · deeper cuts ---- */

/** W2·1 The Night Watch — the lens family's iris ring, mounted inside the W. Nocturnal. */
export function GlyphNightWatchW({ size = 40, ink = 'var(--paper)', accent = 'var(--gold)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polyline points="6,14 14,38 32,20 50,38 58,14" stroke={ink} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 14 38 Q 32 54 50 38" stroke={ink} strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <circle cx="32" cy="36" r="7" stroke={accent} strokeWidth="2.5" />
      <circle cx="32" cy="36" r="2.8" fill={accent} />
    </svg>
  );
}

/** W2·2 The Dreaming W — the watchful eye, but its pupil is the AI spark. */
export function GlyphDreamingW({ size = 40, ink = 'var(--ink)', accent = 'var(--gold)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polyline points="6,14 14,38 32,20 50,38 58,14" stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 14 38 Q 32 54 50 38" stroke={ink} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M 32 28.5 C 33 33 34.8 34.8 39.5 36 C 34.8 37.2 33 39 32 43.5 C 31 39 29.2 37.2 24.5 36 C 29.2 34.8 31 33 32 28.5 Z" fill={accent} />
    </svg>
  );
}

/** W2·3 The Twin Eyes — a rounded w whose two cups each hold a pupil: Night EYES, plural. */
export function GlyphTwinEyesW({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M 8 22 C 8 42 14 47 19 47 C 25 47 30 40 32 26 C 34 40 39 47 45 47 C 50 47 56 42 56 22" stroke={ink} strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="33" r="4" fill={accent} />
      <circle cx="44" cy="33" r="4" fill={accent} />
    </svg>
  );
}

/** N2·1 The Watchful Nib — the nib's vent hole opens into an eye. Pen + eye, one body. */
export function GlyphWatchfulNib({ size = 40, ink = 'var(--terra)', fill = 'var(--terra-soft)', pupil = 'var(--ink)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M 32 54 L 19 32 C 17 18 23 10 32 10 C 41 10 47 18 45 32 Z" stroke={ink} strokeWidth="4.5" strokeLinejoin="round" fill={fill} />
      <path d="M 23 27 Q 32 20 41 27 Q 32 34 23 27 Z" stroke={ink} strokeWidth="3" fill="none" strokeLinejoin="round" />
      <circle cx="32" cy="27" r="3" fill={pupil} />
      <path d="M 32 52 L 32 36" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** N2·2 The Twin Nibs — two pens (author + Night Eyes) standing together ARE the W. */
export function GlyphTwinNibs({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)', fill = 'var(--terra-soft)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M 20 52 L 11 32 C 9.5 19 14.5 12 20 12 C 25.5 12 30.5 19 29 32 Z" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
      <path d="M 20 50 L 20 38" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      <circle cx="20" cy="33" r="2.5" stroke={ink} strokeWidth="2.5" />
      <path d="M 44 52 L 35 32 C 33.5 19 38.5 12 44 12 C 49.5 12 54.5 19 53 32 Z" stroke={accent} strokeWidth="4" strokeLinejoin="round" fill={fill} />
      <path d="M 44 50 L 44 38" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      <circle cx="44" cy="33" r="2.5" stroke={accent} strokeWidth="2.5" />
    </svg>
  );
}

/** N2·3 The Inkcheck — the nib caught mid-stroke, drawing its own checkmark. */
export function GlyphInkcheck({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polyline points="12,38 24,50 36,33" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(38,30) rotate(35)">
        <path d="M 0 0 L -6.5 -13 C -8 -21 -4 -26 0 -26 C 4 -26 8 -21 6.5 -13 Z" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
        <path d="M 0 -2.5 L 0 -11" stroke={ink} strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="0" cy="-14.5" r="2.3" stroke={ink} strokeWidth="2.3" />
      </g>
    </svg>
  );
}

/** L2·1 The Weave — THE CHOSEN DIRECTION. W and V truly interlaced (over-under), nothing else. */
export function GlyphWeave({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* V first — one continuous thread */}
      <path d="M 20 16 L 32 42 L 44 16" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* W on top — continuous over the thread on the right; its real gap on the
          Λ-left stroke lets the thread surface there. Over-under, no visual cuts. */}
      <path d="M 10 18 L 20 46 L 25.3 36.2 M 29.7 28.3 L 32 24 L 44 46 L 54 18" stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** L2·2 The Braid — two zigzags in counter-phase: plot threads braided into a chain of diamonds. */
export function GlyphBraid({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)', spark = 'var(--gold)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polyline points="8,24 17,40 26,24 35,40 44,24 53,40" stroke={ink} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="8,40 17,24 26,40 35,24 44,40 53,24" stroke={accent} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <polygon points="30.5,27.5 34,32 30.5,36.5 27,32" fill={spark} />
    </svg>
  );
}

/** L2·3 The Night Lattice — the lattice gone nocturnal: paper W, gold V, gold spark. */
export function GlyphNightLattice({ size = 40, ink = 'var(--paper)', accent = 'var(--gold)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polyline points="10,18 20,46 32,24 44,46 54,18" stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="20,16 32,42 44,16" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
      <polygon points="32,27.5 35.3,32.25 32,37 28.7,32.25" fill={accent} />
    </svg>
  );
}

/* ---------------------------------------- wave 3 · the weave, explored ---- */

/** V3·1 The Loose Thread — the V's ends relax into loose curls at the top; the
 *  weave holds tight in the middle. "From chaos to story", drawn. */
export function GlyphLooseThread({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* the V thread first, its tails easing into S-curls before the weave grips */}
      <path d="M 13 7 C 19 7.5 16 12 20 16 L 32 42 L 44 16 C 47.5 12 45.5 7.5 51 7" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 10 18 L 20 46 L 25.3 36.2 M 29.7 28.3 L 32 24 L 44 46 L 54 18" stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** V3·2 The Loom — the W as warp, a single story-thread as weft, passing
 *  over-under-over-under through all four strokes. */
export function GlyphLoom({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* W — gapped where the weft passes OVER (strokes 1 and 3) */}
      <path d="M 10 18 L 13.5 27.8 M 16.5 36.2 L 20 46 L 32 24 L 34.2 28 M 38.6 36 L 44 46 L 54 18" stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* weft — gapped where it passes UNDER (strokes 2 and 4) */}
      <path d="M 5 32 H 23.6 M 31.6 32 H 45 M 53 32 H 59" stroke={accent} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** V3·3 The Soft Weave — same interlacing, but the threads bend like real
 *  thread: curved, calligraphic, textile. */
export function GlyphSoftWeave({ size = 40, ink = 'var(--ink)', accent = 'var(--terra)' }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M 20 14 C 24 24 28 35 32 42 C 36 35 40 24 44 14" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 8 16 C 12 36 16 46 20 46 C 22.5 46 24.3 41.5 25.6 36.6 M 29.4 29 C 30.2 27.2 31.1 25.5 32 24 C 36 31 39 46 44 46 C 49 46 52 36 56 16" stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------- wordmark ---- */

function Wordmark({ className = 'text-[19px]' }: { className?: string }) {
  return (
    <span className={`font-serif font-semibold leading-none tracking-[-0.01em] text-[var(--ink)] ${className}`}>
      Writer<span className="italic text-[var(--terra)]">Verse</span>
    </span>
  );
}

/* ------------------------------------------------------------ catalogue ---- */

type Candidate = {
  name: string;
  motif: string;
  story: string;
  tileBg?: string;
  glyph: (size: number) => React.ReactNode;
};

const CANDIDATES: Candidate[] = [
  {
    name: '1 · The Half-W',
    motif: 'W/V split',
    story: 'The V is literally half the W — Write in ink, Verse in terra. The name explains the mark; the mark explains the name.',
    glyph: (s) => <GlyphHalfW size={s} />,
  },
  {
    name: '2 · The Check-W',
    motif: 'V = checkmark',
    story: 'The W resolves into a checkmark bursting past its own top line: the story checks out. The integrity engine, made visual.',
    glyph: (s) => <GlyphCheckW size={s} />,
  },
  {
    name: '3 · The Watchful W',
    motif: 'eye in the letterform',
    story: 'An eye opens between the W’s valleys — the angular lids echo the lens family’s digital eye. The mark literally watches your story.',
    glyph: (s) => <GlyphEyeW size={s} />,
  },
  {
    name: '4 · Night Eye',
    motif: 'the eye, nocturnal',
    story: 'The hexagonal digital eye already living in the lens kit, promoted to the front door — gold iris in deep ink. The guardian that reads while you sleep.',
    tileBg: 'var(--ink)',
    glyph: (s) => <GlyphNightEye size={s} />,
  },
  {
    name: '5 · The Nib',
    motif: 'writing tool as V',
    story: 'A pen nib whose silhouette is the V — the writer’s point, landing like the tip of a check. Warm, literary, craftsman’s tool.',
    glyph: (s) => <GlyphNib size={s} />,
  },
  {
    name: '6 · The Constellation',
    motif: 'verse = universe',
    story: 'The W traced as a constellation, its brightest star on the checkmark’s tip. Verse as in universe; night as in Night Eyes.',
    tileBg: 'var(--ink)',
    glyph: (s) => <GlyphConstellationW size={s} />,
  },
  {
    name: '7 · The Lattice',
    motif: 'W × V monogram',
    story: 'W over V — and their crossing encloses a diamond: the AI spark (AiDiamond) hiding inside the name itself.',
    glyph: (s) => <GlyphWVDiamond size={s} />,
  },
  {
    name: '8 · The Seal',
    motif: 'solid-tile bold',
    story: 'The Check-W knocked out of solid terra — maximum punch at 16px. The app-icon treatment; any stroke candidate can wear this coat.',
    tileBg: 'var(--terra)',
    glyph: (s) => <GlyphSeal size={s} />,
  },
];

const CANDIDATES_2: Candidate[] = [
  {
    name: 'W·1 The Night Watch',
    motif: 'watchful, nocturnal',
    story: 'The lens family’s gold iris ring mounted inside the W — the digital eye on duty after dark. Feature and brand share one anatomy.',
    tileBg: 'var(--ink)',
    glyph: (s) => <GlyphNightWatchW size={s} />,
  },
  {
    name: 'W·2 The Dreaming W',
    motif: 'watchful × AI spark',
    story: 'The watchful eye again — but its pupil is the four-point AI spark. The eye doesn’t just watch your story; it imagines with you.',
    glyph: (s) => <GlyphDreamingW size={s} />,
  },
  {
    name: 'W·3 The Twin Eyes',
    motif: 'watchful, plural',
    story: 'A rounded w whose two cups each cradle a pupil — Night EYES, plural, peeking over the lower lids. Soft, alive, a little mischievous.',
    glyph: (s) => <GlyphTwinEyesW size={s} />,
  },
  {
    name: 'N·1 The Watchful Nib',
    motif: 'nib × eye',
    story: 'The nib’s vent hole opens into an eye: the pen that watches what it writes. Both brand ideas fused into one body.',
    glyph: (s) => <GlyphWatchfulNib size={s} />,
  },
  {
    name: 'N·2 The Twin Nibs',
    motif: 'nib × W/V',
    story: 'Two pens standing together — author in ink, Night Eyes in terra — and their two Vs literally form the W. Writing as a duet.',
    glyph: (s) => <GlyphTwinNibs size={s} />,
  },
  {
    name: 'N·3 The Inkcheck',
    motif: 'nib × checkmark',
    story: 'The nib caught mid-stroke, drawing its own checkmark — writing IS the verification. The most narrative mark of the set.',
    glyph: (s) => <GlyphInkcheck size={s} />,
  },
  {
    name: 'L·1 The Weave ★ chosen',
    motif: 'lattice, interlaced',
    story: 'W and V truly woven — over, under — like plot threads on a loom. Integrity as fabric. Chosen direction; explorations in wave 3 below.',
    glyph: (s) => <GlyphWeave size={s} />,
  },
  {
    name: 'L·2 The Braid',
    motif: 'lattice, extended',
    story: 'Two threads in counter-phase braiding a chain of diamonds — the story’s timeline, its threads crossing and holding. Reads as fabric, DNA, waveform.',
    glyph: (s) => <GlyphBraid size={s} />,
  },
  {
    name: 'L·3 The Night Lattice',
    motif: 'lattice, nocturnal',
    story: 'The lattice after dark — paper W, gold V, the spark glowing in the crossing. The quiet-luxury treatment of №7.',
    tileBg: 'var(--ink)',
    glyph: (s) => <GlyphNightLattice size={s} />,
  },
];

const CANDIDATES_3: Candidate[] = [
  {
    name: '★ The Weave',
    motif: 'the chosen mark',
    story: 'The base mark: W in ink, V in terra — the thread dips under the W’s left arm and rides over its right. One clean pass-under; don’t lose it at small sizes.',
    glyph: (s) => <GlyphWeave size={s} />,
  },
  {
    name: 'V·1 The Loose Thread',
    motif: 'weave × tagline',
    story: '“From chaos to story”, drawn: the terra thread’s ends hang loose and curled at the top — then the weave grips, and it becomes structure.',
    glyph: (s) => <GlyphLooseThread size={s} />,
  },
  {
    name: 'V·2 The Loom',
    motif: 'weave × warp/weft',
    story: 'The W as warp, one story-thread as weft, passing over-under-over-under through all four strokes. The most textile of the set — and the most stable at 16px.',
    glyph: (s) => <GlyphLoom size={s} />,
  },
  {
    name: 'V·3 The Soft Weave',
    motif: 'weave, calligraphic',
    story: 'Same interlacing, but the threads bend like real thread — curved valleys, a hand-drawn warmth. Closer to a literary imprint than a tech mark.',
    glyph: (s) => <GlyphSoftWeave size={s} />,
  },
  {
    name: 'V·4 The Night Weave',
    motif: 'weave, nocturnal',
    story: 'The weave after dark — paper W, gold V on deep ink. The Night Eyes coat for the chosen mark.',
    tileBg: 'var(--ink)',
    glyph: (s) => <GlyphWeave size={s} ink="var(--paper)" accent="var(--gold)" />,
  },
  {
    name: 'V·5 The Monoline',
    motif: 'weave, one color',
    story: 'Both threads in ink — the weave carried by the gaps alone. The brand-survival test: stamp, emboss, watermark, loading spinner. It passes.',
    glyph: (s) => <GlyphWeave size={s} accent="var(--ink)" />,
  },
  {
    name: 'V·6 The Seal Weave',
    motif: 'weave, solid tile',
    story: 'The weave knocked out of solid terra — paper warp, gold weft. The app-icon coat: maximum punch on a phone screen.',
    tileBg: 'var(--terra)',
    glyph: (s) => <GlyphWeave size={s} ink="var(--paper)" accent="var(--gold-soft)" />,
  },
];

function CandidateGrid({ items }: { items: Candidate[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map((c) => (
        <div key={c.name} className="flex flex-col gap-3 rounded-[var(--r-lg)] border border-border p-4">
          <div className="flex items-start gap-4">
            <Tile bg={c.tileBg} size={64}>{c.glyph(46)}</Tile>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="ty-system-label">{c.name}</span>
                <span className="rounded-[var(--r-sm)] bg-secondary px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">{c.motif}</span>
              </div>
              <div className="ty-system-caption mt-1">{c.story}</div>
            </div>
          </div>
          {/* size + lockup test: favicon-size tile · topbar lockup */}
          <div className="flex items-center gap-4">
            <Tile bg={c.tileBg} size={24}>{c.glyph(17)}</Tile>
            <span className="inline-flex items-center gap-2">
              <Tile bg={c.tileBg} size={30}>{c.glyph(21)}</Tile>
              <Wordmark />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BrandLogoSpecimens() {
  return (
    <div className="flex flex-col gap-5">
      {/* current mark, for reference */}
      <div className="flex items-center gap-3">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--terra-soft)] text-[var(--terra)] shadow-[inset_0_0_0_1px_var(--line-2)]">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="ty-system-label">current — lucide Book</div>
          <div className="ty-system-caption">the incumbent, shown for comparison. Generic: says “reading app”, not “story integrity engine”.</div>
        </div>
      </div>

      <div className="ty-system-eyebrow">wave 1 — the field</div>
      <CandidateGrid items={CANDIDATES} />

      <div className="ty-system-eyebrow mt-2">wave 2 — deeper cuts · watchful eye / nib / lattice</div>
      <CandidateGrid items={CANDIDATES_2} />

      <div className="ty-system-eyebrow mt-2">wave 3 — the weave, chosen direction · explorations</div>
      <CandidateGrid items={CANDIDATES_3} />
    </div>
  );
}
