import type { ChartInstance } from '../data';
import { descFor } from '../data';

export function CoverageChart({ chart, staleScenes }: { chart: ChartInstance; staleScenes: Set<string> }) {
  const beats = chart.coverage || [];
  const items = chart.y_items || [];

  const rows = beats.length > 0 ? beats : items.map((name: string) => ({ y_item: name, covered: false, evidence: null }));
  const covered = rows.filter((r: any) => r.covered).length;
  const offMap = new Map<string, string>(((chart.offending || []) as any[]).map((o: any) => [(o?.y_item || '').toLowerCase(), o?.detail || 'breaks the rule'] as [string, string]).filter((e) => e[0]));

  if (!rows.length) {
    return (
      <div className="cv-chart-card">
        <div className="cv-chart-head">
          <span className="cv-chart-lbl">
            Beat-by-beat · <b>{chart.template_id || 'scaffold'}</b>
          </span>
        </div>
        <div className="cv-chart-empty">No beats defined — run Extract to pull them from the story.</div>
      </div>
    );
  }

  return (
    <div className="cv-chart-card">
      <div className="cv-chart-head">
        <span className="cv-chart-lbl">
          {chart.scope_label || chart.scope.name} · <b>covered {covered} of {rows.length}</b>
        </span>
        <span className="cv-chart-rule gz-map-note">each should land somewhere — a miss is a hole to fill</span>
      </div>
      <div className="cv-cov-big">
        {rows.map((b: any, i: number) => {
          const isStale = b.evidence && staleScenes.has(b.evidence);
          const d = b.description || descFor(chart, b.y_item);
          const breach = offMap.get((b.y_item || '').toLowerCase());
          return (
            <div key={i} className={`cv-cov-col${isStale ? ' cv-cov-col--stale' : ''}${breach ? ' cv-cov-col--breach' : ''}`} title={breach || d || undefined}>
              <div className="cv-cov-num">{i + 1}</div>
              <div className={`cv-cov-bar${b.covered && !breach ? ' hit' : ' miss'}${breach ? ' cv-cov-bar--breach' : ''}${isStale ? ' cv-cov-bar--stale' : ''}`}>
                {b.covered && b.evidence && !breach && (
                  <span className="cv-cov-pin">{String(b.evidence).replace('sc-', 'sc ')}</span>
                )}
                {breach && <span className="cv-cov-pin cv-cov-pin--breach">⚑</span>}
              </div>
              <div className={`cv-cov-name${b.covered && !breach ? '' : ' missing'}`}>{b.y_item}</div>
              {d && <div className="gz-cov-desc">{d}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
