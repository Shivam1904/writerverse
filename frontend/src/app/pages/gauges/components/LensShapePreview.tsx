import '../lenses.css';

/**
 * LensShapePreview — a read-only twin of the ConfigureLensModal's "how should
 * it go?" chart (§3), used by <LensSuggestionsSurface> to show, on a suggested
 * lens, BOTH the shape it should hold and "what a wobble looks like".
 *
 * It deliberately reuses the modal's `lens-drawsvg` / `lens-rule-line` /
 * `lens-guide` / `lens-ylab` classes (scoped to `.wv2-root`, app-global) so the
 * visual is identical — minus the drag interaction. The two lines:
 *   · the IDEAL (solid, lens-kind colour) — synthesised from `math_rule`,
 *     exactly as the modal seeds its starting shape (rising/falling/flat).
 *   · the WOBBLE (dashed warning) — a synthesised violation of that rule (a dip
 *     for rising, a bump for falling, a spike for flat), with a marker on the
 *     offending point. This is the "what wrong looks like" the author asked for.
 *
 * We have no pre-authored example data per template (verified 2026-06-01), so
 * the wobble is synthesised from `math_rule` — which is real config signal, the
 * same field the modal already trusts to seed its shape. Only meaningful for
 * trajectory lenses that carry a rule; the parent gates on that.
 */

// viewBox geometry — mirrors ConfigureLensModal so the chart reads identically.
const VBOX_W = 384;
const VBOX_H = 200;
const VL = 104;
const VR = 362;
const VT = 18;
const VB = 168;

const px = (i: number, n: number) => VL + (i * (VR - VL)) / Math.max(1, n - 1);
const py = (v: number) => VB - v * (VB - VT);
const ptsStr = (vals: number[]) => vals.map((v, i) => `${px(i, vals.length).toFixed(1)},${py(v).toFixed(1)}`).join(' ');

const N = 6;
const LO = 0.14;
const HI = 0.9;

function idealRule(mathRule: string): number[] {
  if (mathRule === 'falling') return Array.from({ length: N }, (_, i) => HI - (HI - LO) * (i / (N - 1)));
  if (mathRule === 'rising') return Array.from({ length: N }, (_, i) => LO + (HI - LO) * (i / (N - 1)));
  return Array.from({ length: N }, () => 0.5); // flat
}

// The synthesised violation + the index of the point that breaks the rule.
function wrongRule(mathRule: string): { vals: number[]; wobble: number } {
  if (mathRule === 'rising') return { vals: [0.14, 0.34, 0.55, 0.3, 0.6, 0.88], wobble: 3 }; // a dip mid-story
  if (mathRule === 'falling') return { vals: [0.88, 0.66, 0.46, 0.72, 0.34, 0.14], wobble: 3 }; // a bump back up
  return { vals: [0.5, 0.52, 0.5, 0.84, 0.5, 0.5], wobble: 3 }; // a spike for flat
}

export function LensShapePreview({
  kind,
  items,
  mathRule,
}: {
  kind: string;
  items: string[];
  mathRule: string;
}) {
  const M = Math.max(items.length, 1);
  const ideal = idealRule(mathRule);
  const { vals: wrong, wobble } = wrongRule(mathRule);

  return (
    <svg className={`lens-drawsvg lens-c-${kind} li-sugg-svg`} viewBox={`0 0 ${VBOX_W} ${VBOX_H}`}>
      {/* y-item guides + labels — the scale this lens measures */}
      {items.map((t, j) => {
        const cy = py(1 - (j + 0.5) / M);
        return (
          <g key={j}>
            <line className="lens-guide" x1={VL} y1={cy} x2={VR} y2={cy} />
            <text className="lens-ylab" x={VL - 8} y={cy + 3} textAnchor="end">{t}</text>
          </g>
        );
      })}
      <line className="lens-axis" x1={VL} y1={VT} x2={VL} y2={VB} />
      <line className="lens-axis" x1={VL} y1={VB} x2={VR} y2={VB} />
      <text className="lens-xlab" x={VL} y={VB + 14} textAnchor="start">the start</text>
      <text className="lens-xlab" x={(VL + VR) / 2} y={VB + 14} textAnchor="middle">scene by scene →</text>
      <text className="lens-xlab" x={VR} y={VB + 14} textAnchor="end">the end</text>

      {/* the shape it SHOULD hold */}
      <polygon className="lens-rule-area" points={`${VL},${VB} ${ptsStr(ideal)} ${VR},${VB}`} />
      <polyline className="lens-rule-line" points={ptsStr(ideal)} />

      {/* what a WOBBLE looks like — the rule broken once */}
      <polyline className="li-sugg-wrong" points={ptsStr(wrong)} />
      <circle className="li-sugg-wrong-pt" cx={px(wobble, N)} cy={py(wrong[wobble])} r={4.4} />
    </svg>
  );
}
