/**
 * LanesPreview — the "lanes" (line) state-tracker preview for the config modal.
 * The y-items are the lanes; a single subject's JOURNEY threads between them
 * scene by scene, and the selected rule's break is shown vividly (one-at-a-time
 * → a contested scene lights TWO lanes + red band; no-teleport → a red dashed
 * jump; only-grows/worsens → a red backward node; each-once → a red repeat).
 * Shares its sample movement with CellsPreview via trackerSample, so toggling
 * lanes ↔ cells shows the SAME story two ways. Theme tokens only.
 */
import { SAMPLE, N, journeyFor, captionFor, isCleanRule } from './trackerSample';

export function LanesPreview({ items, rule }: { items: string[]; rule: string }) {
  const states = items.length >= 2 ? items : SAMPLE;
  const R = states.length;
  const aiOrNone = isCleanRule(rule);
  const { seq, second, secondCol, teleport, breaks } = journeyFor(aiOrNone ? '' : rule, R);

  // layout (fixed coords; SVG scales). Lane for state s: higher index → higher up.
  const W = 480, padL = 14, padR = 16, padT = 16, laneH = 34;
  const H = padT * 2 + (R - 1) * laneH;
  const plotW = W - padL - padR;
  const x = (i: number) => padL + (i / (N - 1)) * plotW;
  const y = (s: number) => padT + (R - 1 - s) * laneH;

  const nodes = seq.map((s, i) => ({ x: x(i), y: y(s), s, i, broken: breaks.has(i) }));
  const path = nodes.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="gz-lanes">
      <svg viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="xMidYMid meet" className="gz-lanes-svg">
        {/* lane rails */}
        {states.map((_, s) => (
          <line key={s} className="gz-lane-rail" x1={padL} y1={y(s)} x2={padL + plotW} y2={y(s)} />
        ))}

        {/* journey segments — red + dashed for the teleport break */}
        {nodes.slice(1).map((p, i) => {
          const a = nodes[i];
          const isTeleport = teleport === p.i;
          return <line key={i} className={`gz-lane-seg${isTeleport ? ' is-break' : ''}`} x1={a.x} y1={a.y} x2={p.x} y2={p.y} />;
        })}
        {/* the smooth-ish journey line under the segments for body */}
        <path className="gz-lane-path" d={path} fill="none" />

        {/* contested scene (one-at-a-time): a red band + the second lit lane */}
        {secondCol >= 0 && (
          <>
            <line className="gz-lane-band" x1={x(secondCol)} y1={y(Math.max(seq[secondCol], second)) - 9} x2={x(secondCol)} y2={y(Math.min(seq[secondCol], second)) + 9} />
            <circle className="gz-lane-node is-break" cx={x(secondCol)} cy={y(second)} r={5} />
          </>
        )}

        {/* journey nodes */}
        {nodes.map((p, i) => (
          <circle key={i} className={`gz-lane-node${p.broken ? ' is-break' : ''}`} cx={p.x} cy={p.y} r={p.broken ? 5 : 3.6} />
        ))}

        {/* a small "⚑" over the break scene */}
        {[...breaks].map((bi) => (
          <text key={bi} className="gz-lane-flag" x={x(bi)} y={padT - 5} textAnchor="middle">⚑</text>
        ))}

        {/* scene ticks */}
        {Array.from({ length: N }, (_, i) => (
          <text key={i} className="gz-lane-tick" x={x(i)} y={H + 12} textAnchor="middle">{i + 1}</text>
        ))}
      </svg>
      {aiOrNone
        ? <div className="gz-lanes-cap">A clean journey — the engine reads it, no rule is checked.</div>
        : <div className="gz-lanes-cap gz-lanes-cap-break">⚑ a catch — {captionFor(rule)}</div>}
    </div>
  );
}
