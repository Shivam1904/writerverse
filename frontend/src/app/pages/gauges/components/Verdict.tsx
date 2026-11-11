import type { ChartInstance } from '../data';

export type VerdictVariant = 'holds' | 'warn' | 'open' | 'descriptive';

export function resolveVariant(chart: ChartInstance): VerdictVariant {
  if (chart.mode === 'descriptive') return 'descriptive';
  if (chart.shape?.ok === true) return 'holds';
  if (chart.shape?.ok === false) return 'warn';
  if (chart.verdict?.ok === true) return 'holds';
  if (chart.verdict?.ok === false) return 'warn';
  if (chart.missing_count && chart.missing_count > 0) return 'open';
  // live trajectory board — no `shape`/boolean verdict, just a numeric score + an
  // offending report. Any offending tick breaks the shape; a clean analysed arc holds.
  if (chart.backend === 'trajectory' && (chart.score != null || (chart.offending?.length ?? 0) > 0)) {
    return (chart.offending?.length ?? 0) > 0 ? 'warn' : 'holds';
  }
  const hasRealData = (chart.data_points?.length > 0) || (chart.coverage?.length > 0);
  if (typeof chart.verdict === 'string' && !hasRealData) return 'open';
  return 'descriptive';
}

export function verdictCopy(chart: ChartInstance, variant: VerdictVariant) {
  if (variant === 'descriptive') {
    // A map — never "holds". Lead with what to look for.
    return { lead: 'A map, not a score.', sub: chart.look_for || '', score: 'a map' };
  }
  // ledger / tracker — state the breach (or the hold) in the chart's OWN words.
  if (chart.backend === 'ledger') {
    if (chart.verdict?.ok === false) {
      return { lead: 'A breach in the chain.', sub: chart.verdict.detail || chart.invariant || '', score: 'needs a look' };
    }
    return { lead: 'It holds.', sub: chart.invariant || '', score: 'holds' };
  }
  // report — a count of findings, never "holds".
  if (chart.backend === 'report') {
    const count = chart.verdict?.count ?? (chart.findings?.length || 0);
    if (count === 0) return { lead: 'All clear — nothing flagged.', sub: '', score: 'all clear' };
    return { lead: `${count} contradiction${count > 1 ? 's' : ''} found.`, sub: chart.verdict?.detail || '', score: `${count} found` };
  }
  // trajectory (arc) — fixtures carry `chart.shape`; the live board carries the
  // same numbers at the top level (`score` + `math_rule` + a verdict-text string).
  // Read whichever is present and put "<pct>% <trend>" in the score chip (matching
  // the dashboard card), with the chart's own verdict sentence as the statement.
  if ((variant === 'holds' || variant === 'warn') && (chart.shape || chart.backend === 'trajectory')) {
    const s = chart.shape;
    const rawScore = s?.score ?? chart.score;
    const trend = s?.rule || chart.rule || chart.math_rule || '';
    const pct = rawScore != null ? `${Math.round(rawScore * 100)}%` : '—';
    const chip = trend ? `${pct} ${trend}` : pct;
    const stmt = (typeof chart.verdict === 'string' ? chart.verdict : chart.verdict?.detail) || s?.detail || '';
    if (variant === 'holds') {
      return { lead: trend ? `It holds — ${trend} as intended.` : 'It holds — the shape matches.', sub: stmt, score: chip };
    }
    return { lead: trend ? `Shape violated — should be ${trend}.` : 'Shape violated.', sub: stmt, score: chip };
  }
  if (chart.backend === 'coverage') {
    const total = chart.coverage?.length || chart.y_items.length;
    const covered = chart.coverage?.filter((c: any) => c.covered).length ?? 0;
    const missing = total - covered;
    if (missing === 0) return { lead: 'All beats present.', sub: `${total} of ${total} covered.`, score: `${covered}/${total}` };
    return { lead: `${missing} structural beat${missing > 1 ? 's' : ''} missing.`, sub: `${covered} of ${total} covered.`, score: `${covered}/${total}` };
  }
  if (chart.backend === 'dependency') {
    const pairs = chart.coverage || [];
    // Handle both fixture shape (p.closed) and real backend shape (p.covered)
    const closed = pairs.filter((p: any) => p.closed ?? p.covered).length;
    const open = pairs.length - closed;
    if (open === 0) return { lead: 'All setups paid off.', sub: `${pairs.length} pair${pairs.length !== 1 ? 's' : ''} resolved.`, score: `${closed}/${pairs.length}` };
    return { lead: `${open} setup${open > 1 ? 's' : ''} still hanging.`, sub: `${closed} of ${pairs.length} paid off.`, score: `${closed}/${pairs.length}` };
  }
  if (typeof chart.verdict === 'string') {
    return { lead: chart.verdict, sub: '', score: '·' };
  }
  if (chart.verdict) {
    return { lead: chart.verdict.ok ? 'It holds.' : 'Issue found.', sub: chart.verdict.detail || '', score: chart.verdict.ok ? '✓' : '!' };
  }
  return { lead: 'Not yet analysed.', sub: 'Run the analyse pass from the pipeline.', score: '—' };
}

export function Verdict({ chart }: { chart: ChartInstance }) {
  const variant = resolveVariant(chart);
  const copy = verdictCopy(chart, variant);

  return (
    <div className={`cv-verdict cv-verdict--${variant}`}>
      <div className="cv-verdict-icon">
        {variant === 'holds' && (
          <svg viewBox="0 0 24 24"><path d="M5 12l4.5 4.5L19 7" /></svg>
        )}
        {variant === 'warn' && (
          <svg viewBox="0 0 24 24"><path d="M12 7v6" /><circle cx="12" cy="17" r=".8" fill="currentColor" /></svg>
        )}
        {variant === 'open' && (
          <svg viewBox="0 0 24 24"><path d="M12 7v6" /><circle cx="12" cy="17" r=".8" fill="currentColor" /></svg>
        )}
        {variant === 'descriptive' && (
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><circle cx="12" cy="16" r=".7" fill="currentColor" /></svg>
        )}
      </div>
      <div className="cv-verdict-copy">
        <div className="cv-verdict-lead">{copy.lead}</div>
        {copy.sub && <div className="cv-verdict-sub">{copy.sub}</div>}
        {variant !== 'descriptive' && chart.read_as && (
          <div className="cv-verdict-readas">{chart.read_as}</div>
        )}
      </div>
      <div className="cv-verdict-score">{copy.score}</div>
    </div>
  );
}
