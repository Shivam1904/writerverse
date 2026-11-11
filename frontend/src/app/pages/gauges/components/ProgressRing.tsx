import type { ChartInstance } from '../data';

/**
 * ProgressRing — checklist visual `progress_ring`. The covered-N-of-M at a
 * glance (a ring) + compact chips. Same coverage data as the ticked list and the
 * columnar beats_timeline — purely a visual switch.
 */
export function ProgressRing({ chart }: { chart: ChartInstance }) {
  const rows: any[] = chart.coverage?.length
    ? chart.coverage
    : (chart.y_items || []).map((v: string) => ({ y_item: v, covered: false }));
  const total = rows.length || 1;
  const covered = rows.filter((r) => r.covered).length;
  const pct = covered / total;
  const R = 40;
  const C = 2 * Math.PI * R;

  return (
    <div className="cv-chart-card gz-ring-card">
      <svg viewBox="0 0 108 108" className="gz-ring">
        <circle className="gz-ring-track" cx="54" cy="54" r={R} />
        <circle className="gz-ring-fill" cx="54" cy="54" r={R}
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 54 54)" />
        <text className="gz-ring-num" x="54" y="52" textAnchor="middle">{covered}/{total}</text>
        <text className="gz-ring-lbl" x="54" y="70" textAnchor="middle">present</text>
      </svg>
      <div className="gz-ring-list">
        {rows.map((b: any, i: number) => (
          <span key={i} className={`gz-ring-chip ${b.covered ? 'hit' : 'miss'}`}>
            {b.covered ? '✓' : '○'} {b.y_item}
          </span>
        ))}
      </div>
    </div>
  );
}
