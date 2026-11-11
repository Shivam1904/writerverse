import type { ChartInstance, ChartScene } from '../data';
import { descFor, TICK_LABELS } from '../data';

interface Props {
  chart: ChartInstance;
  scenes: ChartScene[];
  staleScenes: Set<string>;
  smooth?: boolean;   // contour visual (maps) — a smooth curve instead of segments
  step?: boolean;     // step_line visual (ordered trackers) — hold then jump
  ideal?: boolean;    // line_with_ideal visual (arcs) — overlay the rule's ideal line
  bareAxis?: boolean; // config preview — the y-items live in an external editable rail, so skip the SVG labels
}

// A stepped path — holds the value then jumps (ordered-state trackers).
function stepPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x},${pts[i - 1].y} L ${pts[i].x},${pts[i].y}`;
  return d;
}

// Catmull-Rom → Bézier smoothing for the contour visual.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x},${pts[0].y}` : '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function TrajectoryChart({ chart, scenes, staleScenes, smooth = false, step = false, ideal = false, bareAxis = false }: Props) {
  const items = chart.y_items || [];
  const points = chart.data_points || [];
  const hasItems = items.length > 0;
  const hasPoints = points.length > 0;

  // the tick grain (scene / beat / act …) + per-tick labels for the x-axis.
  const tk = TICK_LABELS[(chart as any).axis?.tick || 'scene'] || 'tick';
  const tickById: Record<string, any> = {};
  for (const s of scenes) tickById[(s as any).id] = s;
  const tickLabelAt = (i: number) => {
    const t: any = hasPoints ? tickById[(points[i] as any)?.scene_id] : scenes[i];
    return t?.label || `#${i + 1}`;
  };

  const xCount = hasPoints ? points.length : scenes.length;
  if (!xCount) {
    return <div className="cv-chart-empty">No scenes in the outline yet.</div>;
  }

  const levels = hasItems ? items.length : 3;
  const padL = bareAxis ? 28 : (hasItems ? 100 : 40), padR = 30, padT = 30, padB = 50;
  const w = 720, h = 280;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xStep = xCount > 1 ? plotW / (xCount - 1) : 0;
  const yStep = levels > 1 ? plotH / (levels - 1) : 0;

  const idx = (val: string | null) => {
    if (!val || !hasItems) return null;
    const i = items.findIndex((it) => it.toLowerCase() === val.toLowerCase());
    return i >= 0 ? i : null;
  };

  // offending scenes (the verdict's breaks) → marked red, like a wobble.
  const offSet = new Set((chart.offending || []).map((o: any) => o?.scene_id).filter(Boolean));

  const coords = hasPoints ? points.map((p, i) => {
    const yi = idx(p.value);
    if (yi == null) return null;
    const x = padL + i * xStep;
    const y = padT + plotH - yi * yStep;
    const stale = staleScenes.has(p.scene_id);
    return { x, y, yi, wobble: false, broken: offSet.has(p.scene_id), stale };
  }) : [];

  if (hasPoints && (chart.math_rule === 'rising' || chart.math_rule === 'falling')) {
    const dir = chart.math_rule === 'rising' ? 1 : -1;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const cur = coords[i];
      if (!prev || !cur) continue;
      if (dir > 0 && cur.yi < prev.yi) cur.wobble = true;
      if (dir < 0 && cur.yi > prev.yi) cur.wobble = true;
    }
  }

  const present = coords.filter(Boolean) as { x: number; y: number }[];
  const baseY = padT + plotH;
  const curved = smooth || step;   // both draw via a <path> rather than a polyline
  const linePts = present.map((c) => `${c.x},${c.y}`).join(' ');
  const lineD = step ? stepPath(present) : smooth ? smoothPath(present) : '';
  const fillD = step ? stepPath(present) : smoothPath(present);
  const areaPath = present.length > 1
    ? (curved
        ? `${fillD} L ${present.at(-1)!.x},${baseY} L ${present[0]!.x},${baseY} Z`
        : `M ${present[0]!.x},${baseY} ` + present.map((c) => `L ${c.x},${c.y}`).join(' ') + ` L ${present.at(-1)!.x},${baseY} Z`)
    : '';

  // line_with_ideal — the ghosted "ideal" the rule wants (rising/falling/flat).
  const idealPts = (ideal && hasItems && present.length > 1)
    ? present.map((c, i) => {
        const t = present.length > 1 ? i / (present.length - 1) : 0.5;
        const r = levels - 1;
        const yi = chart.math_rule === 'falling' ? r * (1 - t) : chart.math_rule === 'flat' ? r / 2 : r * t;
        return `${c.x},${padT + plotH - yi * yStep}`;
      }).join(' ')
    : '';

  // Plain words, never "rule: rising". The map (descriptive) shows no judging cue.
  const isMap = chart.verdict_style === 'caption' || chart.mode === 'descriptive';

  return (
    <div className="cv-chart-card">
      <div className="cv-chart-head">
        <span className="cv-chart-lbl">
          {chart.scope_label || chart.scope.name} · <b>{tk} by {tk}</b>
        </span>
        {!isMap && chart.direction && hasItems && (
          <span className="cv-chart-rule" title="the shape it should hold">
            should go <b>{chart.direction}</b>
          </span>
        )}
        {isMap && (
          <span className="cv-chart-rule gz-map-note">a map — read the shape, no right answer</span>
        )}
      </div>
      <div className="cv-chart-svg-wrap">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="cv-svg">
          <defs>
            <linearGradient id="cv-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--teal, #306e69)" stopOpacity=".22" />
              <stop offset="100%" stopColor="var(--teal, #306e69)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* gridlines */}
          {hasItems && items.map((_, i) => {
            const y = padT + plotH - i * yStep;
            return <line key={i} className="cv-grid" x1={padL} y1={y} x2={padL + plotW} y2={y} />;
          })}

          {/* y-axis labels — description on hover (the enrichment). Skipped in
              bareAxis (config preview): the editable rail IS the axis. */}
          {!bareAxis && (hasItems ? items.map((label, i) => {
            const y = padT + plotH - i * yStep;
            const d = descFor(chart, label);
            return (
              <text key={i} className="cv-ylevel gz-ylevel" x={padL - 8} y={y + 4} textAnchor="end">
                {d && <title>{label} — {d}</title>}
                {label}
              </text>
            );
          }) : (
            <text className="cv-ylevel cv-ylevel--ghost" x={padL - 8} y={padT + plotH / 2 + 4} textAnchor="end">?</text>
          ))}

          {/* y-axis line */}
          <line className="cv-axis" x1={padL} y1={padT - 4} x2={padL} y2={padT + plotH + 4} />

          {/* area + line (only when we have real data) */}
          {areaPath && <path className="cv-area" d={areaPath} fill="url(#cv-area-grad)" />}
          {idealPts && <polyline className="gz-ideal-line" points={idealPts} />}
          {hasPoints && (curved
            ? <path className="cv-line" d={lineD} fill="none" />
            : <polyline className="cv-line" points={linePts} />)}

          {/* dots — real or ghost. wobble (rising/falling drift) OR an offending
              scene (any rule's break) renders red. */}
          {hasPoints ? coords.map((c, i) => c && (
            <circle
              key={i}
              className={`cv-dot${(c.wobble || c.broken) ? ' cv-dot--wobble' : ''}${c.stale ? ' cv-dot--stale' : ''}`}
              cx={c.x}
              cy={c.y}
              r={(c.wobble || c.broken) ? 5.5 : 4.5}
            />
          )) : Array.from({ length: xCount }, (_, i) => (
            <circle
              key={i}
              className="cv-dot cv-dot--ghost"
              cx={padL + i * xStep}
              cy={padT + plotH}
              r={3.5}
            />
          ))}

          {/* break labels — drift reads "↓ wobble", an explicit offending scene "⚑ breaks" */}
          {coords.map((c, i) => c && (c.wobble || c.broken) && (
            <text key={`w-${i}`} className="cv-wobble-lbl" x={c.x} y={c.y + 18} textAnchor="middle">{c.wobble ? '↓ wobble' : '⚑ breaks'}</text>
          ))}

          {/* x-axis ticks — number visible, the tick's own label on hover */}
          {Array.from({ length: xCount }, (_, i) => {
            const x = padL + i * xStep;
            return (
              <text key={i} className="cv-xticklbl" x={x} y={padT + plotH + 22} textAnchor="middle">
                <title>{tickLabelAt(i)}</title>{i + 1}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
