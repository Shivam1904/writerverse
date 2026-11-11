import type { ChartInstance, ChartScene } from '../data';
import { descFor } from '../data';

interface Props {
  chart: ChartInstance;
  scenes: ChartScene[];
  staleScenes: Set<string>;
}

// States that mean "nobody holds it" — a jump OUT of one of these back to a real
// holder is the teleport/no-hand-off pattern the invariant guards against.
const ABSENT = new Set(['lost', 'absent', 'gone', 'nobody', 'hidden', 'unknown']);

export function LedgerChart({ chart, scenes, staleScenes }: Props) {
  const holders = chart.y_items || [];
  const points = chart.data_points || [];
  const hasHolders = holders.length > 0;
  const hasPoints = points.length > 0;
  const xCount = hasPoints ? points.length : scenes.length;

  if (!xCount) {
    return <div className="cv-chart-empty">No scenes in the outline yet.</div>;
  }

  const HOLDER_COLORS = ['var(--terra)', 'var(--mauve)', 'var(--ink-3)', 'var(--teal)', 'var(--sage)'];

  const transitions: { from: string; to: string; atScene: number; suspicious: boolean }[] = [];
  if (hasPoints) {
    for (let i = 1; i < points.length; i++) {
      if (points[i].value && points[i - 1].value && points[i].value !== points[i - 1].value) {
        const from = points[i - 1].value!;
        const to = points[i].value!;
        // a jump out of "nobody" back to a holder = the no-hand-off breach
        const suspicious = ABSENT.has(from.toLowerCase()) && !ABSENT.has(to.toLowerCase());
        transitions.push({ from, to, atScene: i + 1, suspicious });
      }
    }
  }

  const rows = hasHolders ? holders : ['?'];
  // offending scenes (the rule's break) → red breach column + a chip naming it.
  const offMap = new Map<string, string>(((chart.offending || []) as any[]).map((o: any) => [o?.scene_id, o?.detail || 'breaks the rule'] as [string, string]).filter((e) => e[0]));

  return (
    <div className="cv-chart-card">
      <div className="cv-chart-head">
        <span className="cv-chart-lbl">
          {chart.scope_label || chart.scope.name} · <b>scene by scene</b>
        </span>
        {chart.invariant && (
          <span className="cv-chart-rule gz-invariant" title="the rule that should hold">{chart.invariant}</span>
        )}
      </div>
      <div className="cv-led-big">
        {rows.map((holder, hi) => (
          <div key={hi} className="cv-led-row">
            <span className={`cv-led-who${!hasHolders ? ' cv-led-who--ghost' : ''}`} title={descFor(chart, holder)}>{holder}</span>
            <div className="cv-led-lane">
              {hasPoints ? points.map((p, si) => {
                const isOn = p.value?.toLowerCase() === holder.toLowerCase();
                const isStale = staleScenes.has(p.scene_id);
                const breach = offMap.has(p.scene_id);
                return (
                  <span
                    key={si}
                    className={`cv-led-cell${isOn ? ' on' : ''}${isStale ? ' cv-led-cell--stale' : ''}${breach ? ' cv-led-cell--breach' : ''}`}
                    style={isOn && !isStale ? { background: HOLDER_COLORS[hi % HOLDER_COLORS.length] } : isOn && isStale ? { background: HOLDER_COLORS[hi % HOLDER_COLORS.length], opacity: 0.35 } : undefined}
                  />
                );
              }) : Array.from({ length: xCount }, (_, si) => (
                <span key={si} className="cv-led-cell cv-led-cell--ghost" />
              ))}
            </div>
          </div>
        ))}
        <div className="cv-led-xax">
          <span className="cv-led-who" />
          <div className="cv-led-lane cv-led-lane--labels">
            {Array.from({ length: xCount }, (_, i) => (
              <span key={i} className="cv-led-xlabel">{i + 1}</span>
            ))}
          </div>
        </div>
      </div>
      {(transitions.length > 0 || offMap.size > 0) && (
        <div className="cv-led-trans">
          {[...offMap.entries()].map(([sid, detail], i) => {
            const n = points.findIndex((p) => p.scene_id === sid) + 1;
            return (
              <span key={`b-${i}`} className="cv-led-trans-chip gz-trans-breach" title="this scene breaks the rule">
                <b>sc {n || '?'}</b><span className="cv-led-arr">·</span>{detail}
              </span>
            );
          })}
          {transitions.map((t, i) => (
            <span key={i} className={`cv-led-trans-chip${t.suspicious ? ' gz-trans-breach' : ''}`} title={t.suspicious ? 'no hand-off on the page — a breach of the rule' : undefined}>
              <b>sc {t.atScene - 1} → {t.atScene}</b>
              <span className="cv-led-arr">→</span>
              {t.suspicious ? <>{t.to} reappears with no hand-off</> : <>{t.from} hands to {t.to}</>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
