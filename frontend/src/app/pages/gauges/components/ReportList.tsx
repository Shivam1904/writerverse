import { AlertTriangle } from 'lucide-react';
import type { ChartInstance } from '../data';

/**
 * ReportList — the NON-CHART form (`report` visual). A story-integrity engine's
 * findings are first-class, so this is a real form, not a fallback: rows of
 * clashing lines with their scene refs. No plot. Makes the "display is an open
 * set — a lens output need not be a chart shape" point concrete.
 */
export function ReportList({ chart }: { chart: ChartInstance }) {
  const findings: any[] = chart.findings || [];
  if (!findings.length) {
    return <div className="cv-chart-card"><div className="cv-chart-empty">All clear — nothing flagged.</div></div>;
  }
  return (
    <div className="cv-chart-card">
      <div className="gz-report">
        {findings.map((f: any, i: number) => (
          <div className="gz-report-row" key={i}>
            <div className="gz-report-title">
              <AlertTriangle size={14} color="var(--clay)" />
              {f.title}
              {f.clash && <span className="gz-report-clash">⟂ {f.clash}</span>}
            </div>
            {(f.evidence || []).map((e: any, k: number) => (
              <div className="gz-report-ev" key={k}>sc {e.scene} — “{e.text}”</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
