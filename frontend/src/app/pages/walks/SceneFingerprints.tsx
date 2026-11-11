/* SceneFingerprints — the 4th walk on WalksPage. Unlike the gauge-board walks
 * (one ordinal value per scene), this reads the RICH multi-dimensional
 * `scene.analysis.scene_properties` (pacing · mood · intensity · characters) the
 * scene-pipeline stores per scene. Each dimension becomes a synthetic "chart" run
 * through the SAME chartToVerdict → VerdictSnapshot used everywhere else, so the
 * bars/legend/hover read identically to the rest of the verdict boxes — only the
 * underlying results model differs. */

import { useMemo, type ReactNode } from 'react';
import { VerdictSnapshot } from '../../modules/lens/LensVerdict';
import { chartToVerdict } from '../../modules/lensKit/verdict';

export interface SceneFP {
  id: string;
  label: string;
  pacing_type?: string;
  mood?: string;
  intensity?: number;
  characters_present?: string[];
  rationale?: string;
}

// mirrors outline.ai.scene_analysis SCENE_PACING / SCENE_MOOD + intensity 1-5.
const PACING = ['action', 'dialogue', 'introspection', 'exposition'];
const MOOD = ['dark', 'somber', 'neutral', 'hopeful', 'light']; // ordered low→high
const INTENSITY = ['1', '2', '3', '4', '5'];
// mirrors the tracker STATE_COLORS (LensVerdict) so a pacing chip's dot matches
// its colour in the pacing strip above.
const PACE_COLORS = ['var(--lens-purple)', 'var(--lens-gold)', 'var(--lens-green)', '#5f86bf'];

/* one dimension → a synthetic gauge-board chart chartToVerdict() can read.
 * `kind` picks the visual: tracker (categorical colour, no order) for pacing,
 * arc (ordered height bars) for mood + intensity. */
function dimChart(
  scenes: SceneFP[],
  type: 'tracker' | 'arc',
  ladder: string[],
  valueOf: (s: SceneFP) => string | null,
  verdict: string,
) {
  return {
    type,
    analysed_at: 'done', // scanned → tone reads ok (these are descriptive, no rule)
    axis: { tick: 'scene' },
    y_items: ladder.map((v) => ({ value: v })),
    ticks: scenes.map((s) => ({ id: s.id, label: s.label })),
    data_points: scenes.map((s) => ({ tick_id: s.id, value: valueOf(s), reasoning: s.rationale || '' })),
    offending: [],
    verdict,
  };
}

function modeOf(vals: string[]): { value: string; count: number } {
  const tally = new Map<string, number>();
  for (const v of vals) tally.set(v, (tally.get(v) || 0) + 1);
  let best = { value: vals[0] || '', count: 0 };
  for (const [value, count] of tally) if (count > best.count) best = { value, count };
  return best;
}

/* a row: the dimension name + its snapshot, separated by a hairline (the same
 * --lens-line the conflict rows use), so the three stack as one card. */
function DimRow({ name, chart, type }: { name: string; chart: any; type: 'tracker' | 'arc' }) {
  return (
    <div style={{ borderTop: '1px solid var(--lens-line)', paddingTop: 12 }}>
      <div className="ui" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--lens-muted)', marginBottom: 8 }}>{name}</div>
      <VerdictSnapshot verdict={chartToVerdict(chart)} type={type} unit="scenes" />
    </div>
  );
}

/* a labelled pill (a dimension value) — neutral chrome, optional leading colour dot. */
function Chip({ children, dot }: { children: ReactNode; dot?: string }) {
  return (
    <span className="ui" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99,
      fontSize: 11.5, border: '1px solid var(--lens-line)', color: 'var(--lens-ink-soft)', whiteSpace: 'nowrap',
    }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: 99, background: dot, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

/* the RICH per-scene fingerprint: all FOUR dimensions for one scene shown together
 * (pacing · mood · intensity · who's present) + the rationale as visible evidence —
 * the correlated read the three at-a-glance strips above can't show. Styled like the
 * verdict box's conflict rows (kicker + serif body) so it stays native. */
function FingerprintRow({ s }: { s: SceneFP }) {
  const pIdx = PACING.indexOf(s.pacing_type || '');
  const chars = s.characters_present || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '11px 0', borderTop: '1px solid var(--lens-line)' }}>
      <div className="kicker" style={{ color: 'var(--lens-ink)' }}>{s.label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <Chip dot={pIdx >= 0 ? PACE_COLORS[pIdx % PACE_COLORS.length] : undefined}>{s.pacing_type}</Chip>
        <Chip>{s.mood}</Chip>
        <span className="ui" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--lens-muted)' }}>
          intensity
          <span style={{ display: 'inline-flex', gap: 3 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} style={{ width: 6, height: 6, borderRadius: 99, background: i <= (s.intensity || 0) ? 'var(--lens-ink-soft)' : 'var(--lens-line-2)' }} />
            ))}
          </span>
        </span>
        {chars.length === 0
          ? <span className="ui" style={{ fontSize: 11, color: 'var(--lens-muted)' }}>· no named characters</span>
          : chars.map((c) => <Chip key={c} dot="var(--lens-muted-2)">{c}</Chip>)}
      </div>
      {s.rationale && (
        <p style={{ margin: 0, fontFamily: 'var(--lens-serif)', fontSize: 13.5, lineHeight: 1.5, color: 'var(--lens-ink-soft)' }}>{s.rationale}</p>
      )}
    </div>
  );
}

export function SceneFingerprints({ scenes, onAnalyse, onBrowse }: {
  scenes: SceneFP[]; projectId?: string; onAnalyse: () => void; onBrowse: () => void;
}) {
  const read = useMemo(() => scenes.filter((s) => !!s.pacing_type), [scenes]);

  const charts = useMemo(() => {
    if (read.length === 0) return null;
    const pace = modeOf(read.map((s) => s.pacing_type!).filter(Boolean));
    const moods = read.map((s) => s.mood!).filter(Boolean);
    const moodMode = modeOf(moods);
    const moodIdx = moods.map((m) => MOOD.indexOf(m)).filter((i) => i >= 0);
    const lo = MOOD[Math.min(...moodIdx)] ?? '—';
    const hi = MOOD[Math.max(...moodIdx)] ?? '—';
    const ints = read.map((s) => Number(s.intensity)).filter((n) => n >= 1 && n <= 5);
    const avg = ints.length ? (ints.reduce((a, b) => a + b, 0) / ints.length) : 0;
    const peak = ints.length ? Math.max(...ints) : 0;
    return {
      pacing: dimChart(read, 'tracker', PACING, (s) => s.pacing_type ?? null,
        `Mostly ${pace.value} — ${pace.count} of ${read.length} scenes.`),
      mood: dimChart(read, 'arc', MOOD, (s) => s.mood ?? null,
        `Ranges ${lo}→${hi} · most often ${moodMode.value}.`),
      intensity: dimChart(read, 'arc', INTENSITY, (s) => (s.intensity ? String(s.intensity) : null),
        `Averages ${avg.toFixed(1)}/5 · peaks at ${peak}.`),
    };
  }, [read]);

  if (!charts) {
    return (
      <div className="flex items-center gap-3 py-5">
        <span className="cst-sec-desc">— no scene fingerprints yet</span>
        <span className="flex-1" />
        <button type="button" className="wv2-btn wv2-btn-sm" onClick={onBrowse}>
          Lens bank
        </button>
        <button type="button" className="wv2-btn wv2-btn-primary wv2-btn-sm" onClick={onAnalyse}>
          Analyse scenes
        </button>
      </div>
    );
  }

  return (
    <div className="lens-root py-2">
      <div className="sl-box-card sl-verdict">
        <div className="sl-box-head">
          <span className="sl-verdict-dot" style={{ background: 'var(--lens-muted-2)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sl-box-title">Scene fingerprints</div>
            <div className="ui sl-box-sub">pacing · mood · intensity · who's present, scene by scene · {read.length} read</div>
          </div>
          <button type="button" className="ui focusring sl-box-x" onClick={onAnalyse} title="Re-analyse scenes">↻</button>
        </div>
        {/* the at-a-glance SHAPE — each dimension as its own strip across the book. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <DimRow name="pacing" chart={charts.pacing} type="tracker" />
          <DimRow name="mood" chart={charts.mood} type="arc" />
          <DimRow name="intensity" chart={charts.intensity} type="arc" />
        </div>
        {/* the rich DETAIL — the full correlated 4D fingerprint per scene + evidence. */}
        <div style={{ marginTop: 16 }}>
          <div className="ui" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--lens-muted)' }}>per scene · the full fingerprint</div>
          {read.map((s) => <FingerprintRow key={s.id} s={s} />)}
        </div>
      </div>
    </div>
  );
}
