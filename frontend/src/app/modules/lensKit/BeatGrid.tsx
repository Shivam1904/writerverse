import type { ChartInstance } from '../../pages/gauges/data';

/* BeatGrid — the per-beat cards under the chart, on the lens design language.
 * Reads the SAME array the chart draws from (chart.data_points): one card per
 * tick, its value rendered as a level tag (colored by position on the y-axis),
 * the engine's reasoning as the sentence, and an off-trend "wobble" flag. Cards
 * are clickable to mark a beat "changed" (controlled by the page, which counts
 * them on the Re-scan button). Only rendered when data_points exist. */

// the level color ramp — for a 5-item arc this is exactly the handoff palette
// (unchanged→muted, shaken→gold-deep, trying→teal, committing→purple,
// transformed→green); other scales sample the ramp by position.
const RAMP = ['var(--lens-muted)', '#876020', '#3f8a7d', 'var(--lens-purple)', 'var(--lens-green)'];

function levelIndex(chart: ChartInstance, value?: string | null): number {
  if (!value) return -1;
  return chart.y_items.findIndex((it) => it.toLowerCase() === value.toLowerCase());
}
function levelColor(idx: number, len: number): string {
  if (idx < 0) return 'var(--lens-muted)';
  const ratio = len > 1 ? idx / (len - 1) : 0.5;
  return RAMP[Math.round(ratio * (RAMP.length - 1))];
}

/** off-trend ticks for a rising/falling arc — the same wobble math the EvidenceStrip uses. */
function wobbleSet(chart: ChartInstance): Set<number> {
  const out = new Set<number>();
  const points = chart.data_points || [];
  if (chart.math_rule !== 'rising' && chart.math_rule !== 'falling') return out;
  const dir = chart.math_rule === 'rising' ? 1 : -1;
  for (let i = 1; i < points.length; i++) {
    const prev = levelIndex(chart, points[i - 1].value);
    const cur = levelIndex(chart, points[i].value);
    if (prev >= 0 && cur >= 0) {
      if (dir > 0 && cur < prev) out.add(i);
      if (dir < 0 && cur > prev) out.add(i);
    }
  }
  return out;
}

function PencilMark() {
  return (
    <span style={{
      position: 'absolute', top: 9, right: 10, display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--lens-purple-deep)',
    }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      edited
    </span>
  );
}

export function BeatGrid({ chart, changed, onToggle }: {
  chart: ChartInstance; changed: Set<number>; onToggle: (i: number) => void;
}) {
  const points = chart.data_points || [];
  if (!points.length) return null;
  const wobbles = wobbleSet(chart);
  const len = chart.y_items.length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
      {points.map((p, i) => {
        const idx = levelIndex(chart, p.value);
        const col = levelColor(idx, len);
        const isFlag = wobbles.has(i);
        const isChanged = changed.has(i);
        return (
          <button
            key={i}
            type="button"
            className="ld-beat focusring"
            onClick={() => onToggle(i)}
            style={{
              position: 'relative', textAlign: 'left', border: '1px solid var(--lens-line)', borderRadius: 12,
              background: 'var(--lens-paper)', padding: '11px 12px', cursor: 'pointer',
              boxShadow: isChanged ? '0 0 0 2px color-mix(in srgb,var(--lens-purple) 16%,transparent)' : '0 1px 2px rgba(40,28,70,.04)',
              borderColor: isChanged ? 'var(--lens-purple-soft)'
                : isFlag ? 'color-mix(in srgb,var(--lens-rust) 40%,var(--lens-line))' : 'var(--lens-line)',
            }}>
            {isChanged && <PencilMark />}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--lens-muted)', fontVariantNumeric: 'tabular-nums' }}>
                Beat {String(i + 1).padStart(2, '0')}
              </span>
              {!isChanged && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 99,
                  background: `color-mix(in srgb,${col} 13%,#fff)`, color: col,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: col }} />
                  {p.value || '—'}
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--lens-serif)', fontSize: 12.5, lineHeight: 1.42, color: 'var(--lens-ink-soft)' }}>
              {p.reasoning || '—'}
            </div>
            {isFlag && (
              <div style={{ marginTop: 8, fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8a4230', display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                wobble
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
