import type { ChartInstance } from '../data';

interface Props {
  chart: ChartInstance;
  active: boolean;
  onClick: () => void;
}

// ONE status vocabulary — must match the chart's own verdict (no contradictions).
function statusLabel(chart: ChartInstance): { text: string; cls: string } {
  if (chart.mode === 'descriptive') return { text: 'just a map', cls: '' };
  if (chart.backend === 'report') {
    const count = chart.verdict?.count ?? (chart.findings?.length || 0);
    return count > 0 ? { text: `${count} found`, cls: 'warn' } : { text: 'all clear', cls: 'pass' };
  }
  if (chart.shape?.ok) return { text: 'holds', cls: 'pass' };
  if (chart.shape?.ok === false) return { text: 'needs a look', cls: 'warn' };
  if (chart.verdict?.ok === true) return { text: 'holds', cls: 'pass' };
  if (chart.verdict?.ok === false) return { text: 'needs a look', cls: 'warn' };
  if (chart.missing_count && chart.missing_count > 0) return { text: `${chart.missing_count} to fix`, cls: 'gap' };
  if (!chart.analysed_at) return { text: 'not scanned', cls: '' };
  return { text: 'holds', cls: 'pass' };
}

function backendIcon(backend: string) {
  switch (backend) {
    case 'trajectory':
      return <svg viewBox="0 0 24 24"><path d="M4 19l4-4 4-1 4-4 4-3" /><circle cx="20" cy="7" r="2" /></svg>;
    case 'coverage':
      return <svg viewBox="0 0 24 24"><path d="M4 6h16" /><path d="M4 12h12" /><path d="M4 18h8" /></svg>;
    case 'ledger':
      return <svg viewBox="0 0 24 24"><path d="M3 7.5l9-4 9 4v9l-9 4-9-4v-9z" /><path d="M3 7.5l9 4 9-4" /></svg>;
    case 'dependency':
      return <svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.4" /><circle cx="18" cy="12" r="2.4" /><path d="M8.5 12h7" strokeDasharray="2 2.5" /></svg>;
    default:
      return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /></svg>;
  }
}

const BACKEND_CLASS: Record<string, string> = {
  trajectory: 'teal',
  coverage: 'sage',
  ledger: 'terra',
  dependency: 'mauve',
};

export function MiniCard({ chart, active, onClick }: Props) {
  const st = statusLabel(chart);
  const cls = BACKEND_CLASS[chart.backend] || '';

  return (
    <button
      className={`cv-mini cv-mini--${cls}${active ? ' cv-mini--active' : ''}${chart.mode === 'descriptive' ? ' cv-mini--descrip' : ''}`}
      onClick={onClick}
      type="button"
    >
      <div className="cv-mini-head">
        <span className={`cv-mini-ig cv-mini-ig--${cls}`}>
          {backendIcon(chart.backend)}
        </span>
        <span className="cv-mini-nm">{chart.label}</span>
        <span className={`cv-mini-ok${st.cls ? ` cv-mini-ok--${st.cls}` : ''}`}>{st.text}</span>
      </div>
      <div className="cv-mini-scope">{chart.scope_label || chart.scope.name}</div>
    </button>
  );
}
