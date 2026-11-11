/**
 * CellsPreview — the "cells" state-tracker preview for the config modal: the
 * classic grid where each y-item is a row and each scene a column, and the cell
 * is FILLED (in that lane's colour) for the scene the subject is in. Reads the
 * exact same synthetic journey as LanesPreview (trackerSample), so the lanes ↔
 * cells switch shows one story two ways. The selected rule's break is shown the
 * grid's way: one-at-a-time lights TWO cells in a column (red); a teleport jump
 * reds the destination cell; a backslide/repeat reds the offending cell.
 * Theme tokens only.
 */
import { SAMPLE, N, LANE_COLORS, journeyFor, captionFor, isCleanRule } from './trackerSample';

export function CellsPreview({ items, rule }: { items: string[]; rule: string }) {
  const states = items.length >= 2 ? items : SAMPLE;
  const R = states.length;
  const aiOrNone = isCleanRule(rule);
  const { seq, second, secondCol, teleport, breaks } = journeyFor(aiOrNone ? '' : rule, R);

  // layout: R rows × N cols. Row for state s sits high→top to match the rail.
  const W = 480, padL = 8, padR = 8, padT = 12, rowH = 30, gap = 4;
  const H = padT + R * rowH;
  const plotW = W - padL - padR;
  const colW = plotW / N;
  const cellW = colW - gap;
  const rowFor = (s: number) => padT + (R - 1 - s) * rowH;       // top y of the row
  const colX = (i: number) => padL + i * colW;

  // lit cells: one per scene at seq[i], plus the contested 2nd cell.
  const lit: { i: number; s: number; broken: boolean }[] = seq.map((s, i) => ({ i, s, broken: breaks.has(i) || teleport === i }));
  if (secondCol >= 0 && second >= 0) lit.push({ i: secondCol, s: second, broken: true });

  return (
    <div className="gz-cells">
      <svg viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="xMidYMid meet" className="gz-cells-svg">
        {/* faint full grid so empty cells read as "not here" */}
        {states.map((_, s) => Array.from({ length: N }, (_, i) => (
          <rect key={`g-${s}-${i}`} className="gz-cell-empty" x={colX(i) + gap / 2} y={rowFor(s) + gap / 2} width={cellW} height={rowH - gap} rx={3} />
        )))}

        {/* lit cells — coloured by lane; broken ones go red */}
        {lit.map((c, k) => (
          <rect
            key={`l-${k}`}
            className={`gz-cell${c.broken ? ' is-break' : ''}`}
            x={colX(c.i) + gap / 2}
            y={rowFor(c.s) + gap / 2}
            width={cellW}
            height={rowH - gap}
            rx={3}
            style={c.broken ? undefined : { fill: LANE_COLORS[c.s % LANE_COLORS.length] }}
          />
        ))}

        {/* ⚑ over each break column */}
        {[...breaks].map((bi) => (
          <text key={`f-${bi}`} className="gz-cell-flag" x={colX(bi) + colW / 2} y={padT - 2} textAnchor="middle">⚑</text>
        ))}

        {/* scene ticks */}
        {Array.from({ length: N }, (_, i) => (
          <text key={`t-${i}`} className="gz-cell-tick" x={colX(i) + colW / 2} y={H + 12} textAnchor="middle">{i + 1}</text>
        ))}
      </svg>
      {aiOrNone
        ? <div className="gz-lanes-cap">A clean run — the engine reads which lane each scene, no rule is checked.</div>
        : <div className="gz-lanes-cap gz-lanes-cap-break">⚑ a catch — {captionFor(rule)}</div>}
    </div>
  );
}
