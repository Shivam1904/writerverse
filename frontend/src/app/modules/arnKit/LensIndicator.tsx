import { useId } from 'react';
import { Tooltip } from '../../ui';
import './arnKit.css';
import '../lens/lens.css';

/* LensIndicator — the digital-eye lens chip, promoted verbatim from the UI Kit
 * showcase (ShowcaseUIKit) so the app reuses the EXACT specimen, not a copy that
 * drifts. One eye, seven lifecycle modes, all wearing our digital eye (hexagonal
 * vector frame + iris ring + pupil). Dormant when there's nothing to watch
 * (`locked`), parks open while attached/idle, comes fully alive — spinning iris +
 * saccade + mechanical blink — only while reading (`judging`). Colour / border /
 * badge / reticle per mode follow the lens design language (--lens-* tokens).
 *
 * Visual-only: the parent passes the resolved `mode` (derived from real state) and
 * an onClick. Styling lives in arnKit.css (moved out of the showcase's injected
 * <style> so it's shareable). */

/** Our digital eye, in one of several lifecycle expressions.
 *  The hexagon IS the eyelids — its top 3 lines are the upper lid, its bottom 3
 *  the lower lid. The eye emotes by where those lids sit + the iris↔pupil gap. */
export type EyeExpr = 'closed' | 'ready' | 'alert' | 'relaxed' | 'live' | 'stale';
const ALMOND = 'M 10 50 L 30 25 L 70 25 L 90 50 L 70 75 L 30 75 Z';
const ALMOND_DROOPED = 'M 10 51 L 29 38 L 71 38 L 90 51 L 70 75 L 30 75 Z';
const LOWER_LID = 'M 10 50 L 30 75 L 70 75 L 90 50';
const EYE_GEOM: Record<Exclude<EyeExpr, 'closed'>, { iris: number; pupil: number; cy: number; px?: number }> = {
  alert: { iris: 18, pupil: 7, cy: 50 },
  ready: { iris: 18, pupil: 11, cy: 50 },
  relaxed: { iris: 16, pupil: 11, cy: 52 },
  live: { iris: 18, pupil: 7, cy: 50 },
  stale: { iris: 17, pupil: 9, cy: 50, px: 62 },
};

export function LensEye({ eye, size = 14 }: { eye: EyeExpr; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const clip = `le-clip-${uid}`;
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
  const topLid = eye === 'relaxed' ? 'M 10 51 L 29 38 L 71 38 L 90 51' : 'M 10 50 L 30 25 L 70 25 L 90 50';
  const bottomLid = eye === 'relaxed' ? 'M 10 51 L 30 75 L 70 75 L 90 51' : 'M 10 50 L 30 75 L 70 75 L 90 50';
  return (
    <svg className={`lens-eye is-${eye}`} width={size} height={h} viewBox={VB} aria-hidden>
      <defs>
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

/** Viewfinder corner-brackets: "machine vision on this section". Faint + static
 *  once attached; breathing while the read is live. */
function LensReticle({ live = false }: { live?: boolean }) {
  return (
    <span
      aria-hidden
      className={live ? 'lens-reticle-live' : undefined}
      style={{ position: 'absolute', inset: -4, pointerEvents: 'none', opacity: live ? 1 : 0.5 }}
    >
      <svg width="100%" height="100%" viewBox="0 0 38 38" fill="none" stroke="var(--lens-purple)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20 V14 Q2 2 14 2 H20" /><path d="M18 2 H24 Q36 2 36 14 V20" />
        <path d="M36 18 V24 Q36 36 24 36 H18" /><path d="M20 36 H14 Q2 36 2 24 V18" />
      </svg>
    </span>
  );
}

/** The small corner badge: plus (attach) · check (clear) · count (problems) · refresh (stale). */
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

export type LensModeKey = 'locked' | 'add' | 'attached' | 'judging' | 'good' | 'problem' | 'stale';
interface LensModeDef {
  key: LensModeKey; label: string; state: string; eye: EyeExpr;
  fg: string; bg: string; border: string;
  badge?: 'plus' | 'check' | 'count' | 'refresh'; reticle?: 'static' | 'live'; note: string;
}
export const LENS_MODES: LensModeDef[] = [
  { key: 'locked', label: 'Can’t attach', state: 'section is empty', eye: 'closed', fg: 'var(--lens-muted-2)', bg: 'transparent', border: '1px solid transparent', note: 'Nothing to watch yet. Fill the section in and the lens wakes up.' },
  { key: 'add', label: 'Add a lens', state: 'ready, none attached', eye: 'ready', fg: 'var(--lens-purple)', bg: 'rgba(255,255,255,.55)', border: '1px dashed var(--lens-purple-soft)', badge: 'plus', note: 'The section has content — attach a lens to start watching.' },
  { key: 'attached', label: 'Attached', state: 'watching, idle', eye: 'ready', fg: 'var(--lens-purple)', bg: 'var(--lens-purple-wash)', border: '1px solid var(--lens-purple-soft)', reticle: 'static', note: 'A lens is on this section, waiting for the next read.' },
  { key: 'judging', label: 'Judging', state: 'reading the draft', eye: 'live', fg: 'var(--lens-purple)', bg: 'var(--lens-purple-wash)', border: '1px solid var(--lens-purple-soft)', reticle: 'live', note: 'Reading every scene right now — the lens iris darts and spins as it scans.' },
  { key: 'good', label: 'Good outcome', state: 'all clear', eye: 'relaxed', fg: 'var(--lens-green)', bg: 'var(--lens-green-wash)', border: '1px solid rgba(79,122,82,.42)', badge: 'check', note: 'Read clean — the draft holds to what you set.' },
  { key: 'problem', label: 'Problem', state: 'found something', eye: 'alert', fg: 'var(--lens-rust)', bg: 'var(--lens-rust-wash)', border: '1px solid rgba(176,87,63,.42)', badge: 'count', note: 'The lens flagged where the draft drifts. Open to see.' },
  { key: 'stale', label: 'Stale', state: 'draft changed since', eye: 'stale', fg: 'var(--lens-gold)', bg: 'var(--lens-gold-wash)', border: '1px solid rgba(176,134,47,.42)', badge: 'refresh', note: 'The draft changed since the last read — this verdict is out of date. Re-run the lens.' },
];

/** LensIndicator — one lens-indicator button, in a given lifecycle mode. Copied
 *  EXACTLY from the UI Kit showcase's LensModeChip; `title` (default = the mode's
 *  note) and `onClick` are the only call-site additions. */
export function LensIndicator({
  mode, count = 2, size = 30, title, onClick,
}: {
  mode: LensModeKey; count?: number; size?: number;
  title?: string; onClick?: (e: React.MouseEvent) => void;
}) {
  const m = LENS_MODES.find((x) => x.key === mode)!;
  const locked = mode === 'locked';
  // The tooltip explains what this lifecycle mode means. Default = the mode's
  // label (lead) + its note (what it's telling you); `title` overrides.
  const tip = title ?? (
    <span className="block">
      <span className="font-semibold" style={{ color: m.fg }}>{m.label}</span>
      <span className="block opacity-80">{m.note}</span>
    </span>
  );
  // self-rooting: the chip's colours come from the --lens-* tokens, which lens.css
  // scopes to `.lens-root`. The showcase had a lens-root ancestor; carry our own so
  // the chip renders with its exact colours wherever a parent drops it.
  // The Tooltip wraps the outer span (not the button) so hover still explains the
  // disabled `locked` mode, whose <button> would swallow pointer events.
  return (
    <Tooltip content={tip}>
      <span className="lens-root" style={{ position: 'relative', display: 'inline-grid' }}>
        <button
          type="button"
          className="kit-btn-secondary focusring"
          aria-label={m.label}
          disabled={locked}
          onClick={onClick}
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
    </Tooltip>
  );
}
