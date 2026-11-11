import type { ChartInstance } from '../data';

function valueTone(value: string, items: string[]): string {
  const idx = items.findIndex((it) => it.toLowerCase() === value.toLowerCase());
  if (idx < 0) return 'neutral';
  const ratio = items.length > 1 ? idx / (items.length - 1) : 0.5;
  if (ratio <= 0.2) return 'warm';
  if (ratio <= 0.4) return 'neutral';
  if (ratio <= 0.6) return 'cool';
  if (ratio <= 0.8) return 'cold';
  return 'cruel';
}

export function EvidenceStrip({ chart, staleScenes }: { chart: ChartInstance; staleScenes: Set<string> }) {
  const points = chart.data_points || [];
  if (!points.length) return null;

  // Detect wobbles for trajectory charts
  const wobbles = new Set<number>();
  if (chart.math_rule === 'rising' || chart.math_rule === 'falling') {
    const dir = chart.math_rule === 'rising' ? 1 : -1;
    for (let i = 1; i < points.length; i++) {
      const prevIdx = chart.y_items.findIndex((it) => it.toLowerCase() === (points[i - 1].value || '').toLowerCase());
      const curIdx = chart.y_items.findIndex((it) => it.toLowerCase() === (points[i].value || '').toLowerCase());
      if (prevIdx >= 0 && curIdx >= 0) {
        if (dir > 0 && curIdx < prevIdx) wobbles.add(i);
        if (dir < 0 && curIdx > prevIdx) wobbles.add(i);
      }
    }
  }

  return (
    <div className="cv-evid-section">
      <div className="cv-evid-head">
        <span className="cv-evid-title">Where each scene sits on the axis</span>
        <span className="cv-evid-sub">{points.length} scenes</span>
      </div>
      <div className="cv-evid-scroll">
        {points.map((p, i) => {
          const tone = p.value ? valueTone(p.value, chart.y_items) : 'neutral';
          const isWobble = wobbles.has(i);
          const isStale = staleScenes.has(p.scene_id);
          return (
            <div key={i} className={`cv-evid${isWobble ? ' wobble' : ''}${isStale ? ' cv-evid--stale' : ''}`}>
              <div className="cv-evid-top">
                <span className="cv-evid-sc">SC {String(i + 1).padStart(2, '0')}</span>
                <span className={`cv-evid-val cv-v-${tone}`}>
                  <span className="cv-evid-vd" />
                  {p.value || '—'}
                </span>
              </div>
              {p.reasoning && <div className="cv-evid-q">{p.reasoning}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
