import type { ChartInstance, ChartScene } from '../data';

interface Props {
  chart: ChartInstance;
  scenes: ChartScene[];
  staleScenes: Set<string>;
}

export function DependencyChart({ chart, scenes, staleScenes }: Props) {
  const pairs = chart.coverage || [];
  const n = scenes.length || 15;

  if (!pairs.length) {
    if (!scenes.length) {
      return <div className="cv-chart-empty">No scenes in the outline yet.</div>;
    }
    const w = 720, h = 200;
    const padL = 40, padR = 40;
    const plotW = w - padL - padR;
    const baseline = 160;
    return (
      <div className="cv-chart-card">
        <div className="cv-chart-head">
          <span className="cv-chart-lbl">
            Setups & payoffs · <b>linked across scenes</b>
          </span>
        </div>
        <div className="cv-dep-big">
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="cv-dep-svg">
            <line x1={padL} y1={baseline} x2={padL + plotW} y2={baseline} stroke="var(--line-2, #ccc)" strokeWidth="1" />
            {Array.from({ length: n }, (_, i) => {
              const x = padL + (i / (n - 1)) * plotW;
              return (
                <g key={i}>
                  <circle cx={x} cy={baseline} r="3.5" className="cv-dot cv-dot--ghost" />
                  <text x={x} y={baseline + 18} textAnchor="middle" className="cv-dep-sc">{i + 1}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  }

  const isArcShape = pairs[0]?.setup_scene !== undefined;

  if (!isArcShape) {
    // Real backend shape: {y_item, covered, evidence, confidence}
    return (
      <div className="cv-chart-card">
        <div className="cv-chart-head">
          <span className="cv-chart-lbl">
            Dependencies · <b>coverage check</b>
          </span>
          <span className="cv-chart-rule">
            <span style={{ color: 'var(--mauve)', fontWeight: 600 }}>&#x25CF;</span> covered ·{' '}
            <span style={{ color: 'var(--terra)', fontWeight: 600 }}>&#x25CB;</span> missing
          </span>
        </div>
        <div className="cv-dep-big cv-dep-list">
          {pairs.map((p: any, i: number) => (
            <div key={i} className={`cv-dep-item${p.covered ? ' cv-dep-item--covered' : ' cv-dep-item--open'}`}>
              <span className={`cv-dep-pip${p.covered ? ' cv-dep-pip--closed' : ' cv-dep-pip--open'}`} />
              <span className="cv-dep-item-name">{p.y_item}</span>
              {p.evidence && <span className="cv-dep-item-evidence">{p.evidence}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fixture/arc shape: {name, setup_scene, payoff_scene, closed}
  const w = 720, h = 200;
  const padL = 40, padR = 40;
  const plotW = w - padL - padR;
  const baseline = 160;

  // scene ids can arrive as numbers (the config preview's sample data) — compare
  // and parse as strings so a numeric id never crashes the page.
  const sceneX = (sceneId: string | number) => {
    const idx = scenes.findIndex((s) => String(s.id) === String(sceneId));
    if (idx < 0) {
      const num = parseInt(String(sceneId ?? '').replace(/\D/g, ''), 10);
      return Number.isNaN(num) ? padL : padL + ((num - 1) / (n - 1)) * plotW;
    }
    return padL + (idx / (n - 1)) * plotW;
  };

  return (
    <div className="cv-chart-card">
      <div className="cv-chart-head">
        <span className="cv-chart-lbl">
          Setups & payoffs · <b>linked across scenes</b>
        </span>
        <span className="cv-chart-rule">
          <span style={{ color: 'var(--mauve)', fontWeight: 600 }}>•</span> closed ·{' '}
          <span style={{ color: 'var(--terra)', fontWeight: 600 }}>···</span> open
        </span>
      </div>
      <div className="cv-dep-big">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="cv-dep-svg">
          {/* scene axis */}
          <line x1={padL} y1={baseline} x2={padL + plotW} y2={baseline} stroke="var(--line-2, #ccc)" strokeWidth="1" />

          {/* lane hints */}
          {Array.from({ length: n }, (_, i) => {
            const x = padL + (i / (n - 1)) * plotW;
            return <line key={i} x1={x} y1={40} x2={x} y2={baseline} stroke="var(--line, #eee)" strokeWidth=".6" strokeDasharray="2 3" />;
          })}

          {/* arcs */}
          {pairs.map((p: any, i: number) => {
            const x1 = sceneX(p.setup_scene);
            const x2 = p.payoff_scene ? sceneX(p.payoff_scene) : padL + plotW - 20;
            const midX = (x1 + x2) / 2;
            const arcH = baseline - 30 - i * 20;
            const closed = p.closed;
            const setupStale = staleScenes.has(p.setup_scene);
            const payoffStale = p.payoff_scene && staleScenes.has(p.payoff_scene);
            const arcStale = setupStale || payoffStale;
            return (
              <g key={i} opacity={arcStale ? 0.35 : 1}>
                <path
                  d={`M ${x1},${baseline} Q ${midX},${arcH} ${x2},${baseline}`}
                  fill="none"
                  stroke={closed ? 'var(--mauve, #6f4f5f)' : 'var(--terra, #b5651d)'}
                  strokeWidth="1.8"
                  strokeDasharray={closed ? 'none' : '3 4'}
                  opacity={closed ? 0.85 : 0.9}
                />
                <circle cx={x1} cy={baseline} r="5" fill="var(--surface, #fff)" stroke={closed ? 'var(--mauve)' : 'var(--terra)'} strokeWidth="2" />
                {closed && <circle cx={x2} cy={baseline} r="5" fill="var(--surface, #fff)" stroke="var(--mauve)" strokeWidth="2" />}
                <text
                  x={midX}
                  y={arcH - 6}
                  textAnchor="middle"
                  className={`cv-dep-lbl${closed ? '' : ' open'}`}
                >
                  {p.name}
                </text>
              </g>
            );
          })}

          {/* x-axis ticks */}
          {Array.from({ length: n }, (_, i) => {
            const x = padL + (i / (n - 1)) * plotW;
            return <text key={i} x={x} y={baseline + 18} textAnchor="middle" className="cv-dep-sc">{i + 1}</text>;
          })}
        </svg>
      </div>
      {(() => {
        const open = pairs.filter((p: any) => !p.closed);
        if (!open.length) return null;
        return (
          <div className="gz-hanging">
            Still hanging:{' '}
            {open.map((p: any, i: number) => (
              <span key={i}><b>“{p.name}”</b> (planted sc {p.setup_scene}){i < open.length - 1 ? ' · ' : ''}</span>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
