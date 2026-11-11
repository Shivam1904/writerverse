import { Check, Minus } from 'lucide-react';
import type { ChartInstance } from '../data';
import { descFor } from '../data';

/**
 * TickedList — checklist visual `checklist` (the default per the menu). A
 * vertical list of items, each hit/miss with its evidence scene. The row-list
 * form from the crude sketches; `CoverageChart` (beats_timeline) is the columnar
 * alternate — same data, a visual switch.
 */
export function TickedList({ chart }: { chart: ChartInstance }) {
  const rows: any[] = chart.coverage?.length
    ? chart.coverage
    : (chart.y_items || []).map((v: string) => ({ y_item: v, covered: false, evidence: null }));
  // offending items (the rule's break) → flagged red, with the reason.
  const offMap = new Map<string, string>(((chart.offending || []) as any[]).map((o: any) => [(o?.y_item || '').toLowerCase(), o?.detail || 'breaks the rule'] as [string, string]).filter((e) => e[0]));

  return (
    <div className="cv-chart-card">
      <div className="gz-ticked">
        {rows.map((b: any, i: number) => {
          const d = b.description || descFor(chart, b.y_item);
          const breach = offMap.get((b.y_item || '').toLowerCase());
          return (
            <div key={i} className={`gz-ticked-row${b.covered ? '' : ' is-miss'}${breach ? ' gz-ticked-row--breach' : ''}`}>
              <span className={`gz-ticked-mark ${b.covered ? 'hit' : 'miss'}`}>
                {b.covered ? <Check size={13} strokeWidth={2.6} /> : <Minus size={13} strokeWidth={2.4} />}
              </span>
              <div className="gz-ticked-body">
                <div className="gz-ticked-name">{b.y_item}</div>
                {d && <div className="gz-ticked-desc">{d}</div>}
              </div>
              <span className={`gz-ticked-where${b.covered && !breach ? '' : ' miss'}`}>
                {breach ? `⚑ ${breach}` : b.covered ? (b.evidence ? String(b.evidence).replace('sc-', 'sc ') : '✓') : 'not yet'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
