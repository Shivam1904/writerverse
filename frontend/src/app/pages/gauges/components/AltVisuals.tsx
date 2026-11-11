import type { ChartInstance } from '../data';
import { descFor } from '../data';

/**
 * AltVisuals — the alternate chart visuals from each type's `visuals` menu, so
 * the "Show as ▾" switch is real for every type (the open-set point). Each reads
 * the same loose chart data; the registry keys on the visual id.
 *   map:          bars · heat_strip
 *   arc:          gauge
 *   tracker:      transition_list   (step_line is a TrajectoryChart mode)
 *   setup_payoff: planted_paid_board · hanging_list
 */

const PALETTE = ['var(--terra)', 'var(--mauve)', 'var(--teal)', 'var(--sage)', 'var(--gold)', 'var(--clay)'];
const idxOf = (chart: ChartInstance, v: any) =>
  (chart.y_items || []).findIndex((it) => it.toLowerCase() === String(v ?? '').toLowerCase());

// ── map · bars (categorical / per-scene columns) ──────────────────────────
export function BarsChart({ chart }: { chart: ChartInstance }) {
  const items = chart.y_items || [];
  const points = chart.data_points || [];
  const max = Math.max(items.length, 1);
  return (
    <div className="cv-chart-card">
      <div className="gz-bars">
        {points.map((p, i) => {
          const k = idxOf(chart, p.value);
          const h = k >= 0 ? ((k + 1) / max) * 100 : 4;
          const color = k >= 0 ? PALETTE[k % PALETTE.length] : 'var(--surface-3)';
          return (
            <div key={i} className="gz-bar-col" title={p.value ? `${p.value}${descFor(chart, p.value) ? ' — ' + descFor(chart, p.value) : ''}` : ''}>
              <div className="gz-bar" style={{ height: `${h}%`, background: color }} />
              <span className="gz-bar-x">{i + 1}</span>
            </div>
          );
        })}
      </div>
      <div className="gz-bars-legend">
        {items.map((it, k) => (
          <span key={k} className="gz-bars-key"><i style={{ background: PALETTE[k % PALETTE.length] }} />{it}</span>
        ))}
      </div>
    </div>
  );
}

// ── map · heat_strip (a colour band) ──────────────────────────────────────
export function HeatStrip({ chart }: { chart: ChartInstance }) {
  const items = chart.y_items || [];
  const points = chart.data_points || [];
  const max = Math.max(items.length - 1, 1);
  return (
    <div className="cv-chart-card">
      <div className="gz-heat">
        {points.map((p, i) => {
          const k = idxOf(chart, p.value);
          const t = k >= 0 ? k / max : 0;
          return (
            <div key={i} className="gz-heat-cell" title={p.value || ''}
              style={{ background: `color-mix(in srgb, var(--terra) ${Math.round(t * 85) + 6}%, var(--surface-2))` }}>
              <span>{i + 1}</span>
            </div>
          );
        })}
      </div>
      {items.length > 0 && <div className="gz-heat-scale"><span>{items[0]}</span><span>{items[items.length - 1]}</span></div>}
    </div>
  );
}

// ── arc · gauge (end-state dial) ──────────────────────────────────────────
export function GaugeDial({ chart }: { chart: ChartInstance }) {
  const items = chart.y_items || [];
  const last = [...(chart.data_points || [])].reverse().find((p) => p.value);
  const k = last ? idxOf(chart, last.value) : -1;
  const frac = items.length > 1 && k >= 0 ? k / (items.length - 1) : 0;
  const a = Math.PI - frac * Math.PI;            // 180°(left) → 0°(right)
  const nx = 100 + 64 * Math.cos(a), ny = 100 - 64 * Math.sin(a);
  const ex = 100 + 80 * Math.cos(a), ey = 100 - 80 * Math.sin(a);
  return (
    <div className="cv-chart-card gz-gauge-card">
      <svg viewBox="0 0 200 120" className="gz-gauge">
        <path className="gz-gauge-track" d="M 20 100 A 80 80 0 0 1 180 100" />
        <path className="gz-gauge-fill" d={`M 20 100 A 80 80 0 0 1 ${ex} ${ey}`} />
        <line className="gz-gauge-needle" x1="100" y1="100" x2={nx} y2={ny} />
        <circle className="gz-gauge-hub" cx="100" cy="100" r="4" />
      </svg>
      <div className="gz-gauge-read">
        <div className="gz-gauge-val">{last?.value || '—'}</div>
        <div className="gz-gauge-sub">where it ends · low → high: {items[0]} → {items[items.length - 1]}</div>
      </div>
    </div>
  );
}

// ── tracker · transition_list (just the hand-offs) ────────────────────────
export function TransitionList({ chart }: { chart: ChartInstance }) {
  const points = chart.data_points || [];
  const rows: { at: number; from: string; to: string }[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].value && points[i - 1].value && points[i].value !== points[i - 1].value) {
      rows.push({ at: i + 1, from: points[i - 1].value!, to: points[i].value! });
    }
  }
  return (
    <div className="cv-chart-card">
      {rows.length === 0 ? (
        <div className="cv-chart-empty">No changes — it stays put the whole way.</div>
      ) : (
        <div className="gz-trans-list">
          {rows.map((t, i) => (
            <div key={i} className="gz-trans-line">
              <span className="gz-trans-sc">sc {t.at - 1} → {t.at}</span>
              <b>{t.from}</b> → <b>{t.to}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── setup→payoff · planted_paid_board (two columns) ───────────────────────
export function PlantedPaidBoard({ chart }: { chart: ChartInstance }) {
  const pairs: any[] = chart.coverage || [];
  return (
    <div className="cv-chart-card">
      <div className="gz-board">
        <div className="gz-board-col">
          <div className="gz-board-h">Planted</div>
          {pairs.map((p, i) => <div key={i} className="gz-board-cell">{p.name} <span className="gz-board-sc">sc {p.setup_scene}</span></div>)}
        </div>
        <div className="gz-board-col">
          <div className="gz-board-h">Paid off</div>
          {pairs.map((p, i) => (
            <div key={i} className={`gz-board-cell${p.closed ? ' paid' : ' open'}`}>
              {p.closed ? <>✓ <span className="gz-board-sc">sc {p.payoff_scene}</span></> : <span className="gz-board-open">— still open</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── setup→payoff · hanging_list (only what's open) ────────────────────────
export function HangingList({ chart }: { chart: ChartInstance }) {
  const open = (chart.coverage || []).filter((p: any) => !p.closed);
  return (
    <div className="cv-chart-card">
      {open.length === 0 ? (
        <div className="cv-chart-empty">All clear — every setup pays off.</div>
      ) : (
        <div className="gz-hang">
          {open.map((p: any, i: number) => (
            <div key={i} className="gz-hang-row"><b>“{p.name}”</b><span className="gz-hang-sc">planted sc {p.setup_scene} · never paid off</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
