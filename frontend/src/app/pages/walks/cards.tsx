import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { unbindGauge, analyseGauge } from '../gauges/api';
import { glyphFor } from '../gauges/components/glyphs';
import { deriveVerdict } from '../gauges/verdict';

/* cards.tsx — the watching-board binding TILE, COPIED verbatim from
 * pages/gauges/GaugesWatching.tsx (the `Card` + its mini-chart thumbnails +
 * derive* helpers were private there). This is SEPARATE code from that file:
 * the two copies will NOT move together. Flagged for dedup — extract to a shared
 * pages/gauges/components/WatchingCard.tsx once the Walks layout settles.
 * deriveVerdict already lives in ../gauges/verdict.ts. */

function deriveMetric(c: any): { big: string; unit?: string; sub: string } {
  switch (c.backend) {
    case 'trajectory': {
      const score = c.verdict?.score ?? c.score;
      if (score != null) return { big: String(Math.round(score * 100)), unit: '%', sub: c.rule ?? c.math_rule ?? 'trend' };
      return { big: '—', sub: 'pending' };
    }
    case 'coverage': {
      const cov = c.coverage ?? [];
      const total = (c.y_items?.length) || cov.length;
      const hit = cov.filter((b: any) => b.covered).length;
      return { big: `${hit}`, unit: `/${total}`, sub: 'beats' };
    }
    case 'ledger': {
      const holders = new Set((c.data_points ?? []).map((d: any) => d.value).filter(Boolean));
      return { big: String(holders.size), sub: 'holders' };
    }
    case 'dependency': {
      const deps = c.coverage ?? [];
      return { big: `${deps.filter((d: any) => d.closed).length}`, unit: `/${deps.length}`, sub: 'paid off' };
    }
    default:
      return { big: '—', sub: '' };
  }
}

function deriveScopeLabel(c: any): string {
  if (c.scope?.name && c.scope.name !== 'the whole story') return c.scope.name;
  if (c.backend === 'coverage') return 'structure';
  return c.scope?.type ?? 'story';
}

function scannedAgo(c: any): string {
  if (!c.analysed_at) return 'not scanned';
  const ms = Date.now() - new Date(c.analysed_at).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

const BACKEND_COLOR: Record<string, string> = { trajectory: 'var(--teal)', coverage: 'var(--sage)', ledger: 'var(--terra)', dependency: 'var(--mauve)' };
const BACKEND_KIND: Record<string, string> = { trajectory: 'arc', coverage: 'cover', ledger: 'track', dependency: 'promise' };

/* ---- mini-chart thumbnails (read the gauge board's data_points/coverage) ---- */

function MiniTrajectory({ chart, isDescrip }: { chart: any; isDescrip?: boolean }) {
  const pts = chart.data_points ?? [];
  if (!pts.length) return null;
  const levels = chart.y_items ?? [];
  const n = pts.length, w = 156, h = 32;
  const gradColor = isDescrip ? 'var(--ink-3)' : 'var(--teal)';
  const safeId = String(chart.id).replace(/[^a-zA-Z0-9]/g, '_');
  const valToY = (val: string | null) => {
    const idx = levels.indexOf(val ?? '');
    if (idx < 0) return h / 2;
    return 4 + ((levels.length - 1 - idx) / Math.max(levels.length - 1, 1)) * (h - 8);
  };
  const points = pts.map((p: any, i: number) => ({ x: 2 + (i / Math.max(n - 1, 1)) * w, y: valToY(p.value), val: p.value }));
  const polyStr = points.map((p: any) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} ${points.map((p: any) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L${points[n - 1].x.toFixed(1)},${h + 4} L${points[0].x.toFixed(1)},${h + 4} Z`;
  const isRising = (chart.rule ?? chart.math_rule) === 'rising';
  const wobbles = isRising ? points.filter((p: any, i: number) => i > 0 && p.y > points[i - 1].y + 2) : [];
  return (
    <svg viewBox="0 0 160 36" preserveAspectRatio="none">
      <defs><linearGradient id={`wtch-area-${safeId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={gradColor} stopOpacity=".30" /><stop offset="100%" stopColor={gradColor} stopOpacity="0" /></linearGradient></defs>
      <path className="wtch-ch-area" fill={`url(#wtch-area-${safeId})`} d={areaPath} />
      <polyline className="wtch-ch-line" points={polyStr} />
      {wobbles.map((w: any, i: number) => <circle key={i} className="wtch-ch-dot is-wob" cx={w.x} cy={w.y} r={2} />)}
      <circle className="wtch-ch-dot" cx={points[n - 1].x} cy={points[n - 1].y} r={2.4} />
    </svg>
  );
}

function MiniCoverage({ chart }: { chart: any }) {
  const beats = chart.coverage ?? [];
  if (!beats.length) return null;
  const n = beats.length, totalW = 148, gap = 4;
  const cellW = Math.max(4, (totalW - (n - 1) * gap) / n);
  return (
    <svg viewBox="0 0 160 36" preserveAspectRatio="none">
      <line x1="2" y1="18" x2="158" y2="18" stroke="var(--line-2)" strokeWidth=".8" strokeDasharray="2 3" />
      {beats.map((b: any, i: number) => <rect key={i} className={b.covered ? 'wtch-cov-hit' : 'wtch-cov-miss'} x={6 + i * (cellW + gap)} y={8} width={cellW} height={20} rx={1.5} />)}
    </svg>
  );
}

function MiniLedger({ chart }: { chart: any }) {
  const pts = chart.data_points ?? [];
  if (!pts.length) return null;
  const holders = [...new Set(pts.map((p: any) => p.value).filter(Boolean))];
  const colorMap: Record<string, string> = {};
  const colors = ['l', 'm', 'x'];
  holders.forEach((h: any, i: number) => { colorMap[h] = colors[i % colors.length]; });
  const n = pts.length, totalW = 152, gap = 2;
  const cellW = Math.max(4, (totalW - (n - 1) * gap) / n);
  return (
    <svg viewBox="0 0 160 36" preserveAspectRatio="none">
      {pts.map((p: any, i: number) => <rect key={i} className={p.value ? `wtch-led wtch-led-${colorMap[p.value] ?? 'e'}` : 'wtch-led wtch-led-e'} x={4 + i * (cellW + gap)} y={10} width={cellW} height={16} rx={1} />)}
    </svg>
  );
}

function MiniDependency({ chart }: { chart: any }) {
  const deps = chart.coverage ?? [];
  if (!deps.length) return null;
  const sceneIds = [...new Set([...deps.map((d: any) => d.setup_scene).filter(Boolean), ...deps.map((d: any) => d.payoff_scene).filter(Boolean)])].sort();
  const sceneX = (id: any) => {
    const idx = sceneIds.indexOf(id);
    if (idx < 0) return 80;
    return 14 + (idx / Math.max(sceneIds.length - 1, 1)) * 130;
  };
  return (
    <svg viewBox="0 0 160 36" preserveAspectRatio="none" overflow="visible">
      <line x1="2" y1="28" x2="158" y2="28" stroke="var(--line-2)" strokeWidth=".8" />
      {deps.map((d: any, i: number) => {
        const sx = sceneX(d.setup_scene), px = d.payoff_scene ? sceneX(d.payoff_scene) : 158;
        const midX = (sx + px) / 2, span = Math.abs(px - sx);
        const arcH = Math.max(10, Math.min(24, span * 0.3 + 6));
        const py = d.closed ? 28 : 12;
        return (
          <g key={i}>
            <path className={d.closed ? 'wtch-dep-arc' : 'wtch-dep-arc-open'} d={`M ${sx},28 Q ${midX},${28 - arcH} ${px},${py}`} />
            <circle className="wtch-dep-pt wtch-dep-closed" cx={sx} cy={28} r={2.6} />
            {d.closed && <circle className="wtch-dep-pt wtch-dep-closed" cx={px} cy={28} r={2.6} />}
            {!d.closed && <circle className="wtch-dep-pt wtch-dep-open" cx={px} cy={py} r={2.8} />}
          </g>
        );
      })}
    </svg>
  );
}

function MiniChart({ chart, isDescrip }: { chart: any; isDescrip?: boolean }) {
  switch (chart.backend) {
    case 'trajectory': return <MiniTrajectory chart={chart} isDescrip={isDescrip} />;
    case 'coverage': return <MiniCoverage chart={chart} />;
    case 'ledger': return <MiniLedger chart={chart} />;
    case 'dependency': return <MiniDependency chart={chart} />;
    default: return null;
  }
}

function BackendGlyph({ backend, color }: { backend: string; color: string }) {
  const style = { width: 14, height: 14, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (backend) {
    case 'trajectory': return <svg viewBox="0 0 24 24" style={style}><path d="M4 19l4-4 4-1 4-4 4-3" /><circle cx="20" cy="7" r="2" /></svg>;
    case 'coverage': return <svg viewBox="0 0 24 24" style={style}><path d="M4 6h16" /><path d="M4 12h12" /><path d="M4 18h8" /></svg>;
    case 'ledger': return <svg viewBox="0 0 24 24" style={style}><path d="M3 7.5l9-4 9 4v9l-9 4-9-4v-9z" /><path d="M3 7.5l9 4 9-4" /><path d="M12 11.5v9" /></svg>;
    case 'dependency': return <svg viewBox="0 0 24 24" style={style}><circle cx="6" cy="12" r="2.4" /><circle cx="18" cy="12" r="2.4" /><path d="M8.5 12h7" strokeDasharray="2 2.5" /></svg>;
    default: return null;
  }
}

export function Card({ chart, isDescrip0, onOpen, onRemoved }: { chart: any; isDescrip0?: boolean; onOpen: (id: string) => void; onRemoved?: () => void }) {
  const { projectId } = useParams();
  const [scanning, setScanning] = useState(false);
  const { verdict } = deriveVerdict(chart);
  const metric = deriveMetric(chart);
  const isDescrip = chart.mode === 'descriptive';
  const kindCls = isDescrip ? 'is-descrip' : `k-${BACKEND_KIND[chart.backend] ?? 'arc'}`;
  const attn = verdict === 'warn' ? 'warn' : verdict === 'open' ? 'open' : undefined;
  const holdersColor = isDescrip ? 'var(--ink-4)' : (BACKEND_COLOR[chart.backend] ?? 'var(--ink-4)');
  const scanned = !!chart.analysed_at;

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!projectId) return;
    const scopeName = chart.scope?.name || 'the whole story';
    if (!confirm(`Stop watching "${chart.name || chart.label}" on ${scopeName}?`)) return;
    try {
      await unbindGauge(projectId, chart.binding_id || chart.id);
      onRemoved?.();
    } catch (err) { console.error('gauge remove from watching card failed', err); }
  }

  // Run (or re-run) analysis straight from the card — without this a freshly-bound
  // gauge sits "not scanned" with no way to act from where you land.
  async function handleScan(e: React.MouseEvent) {
    e.stopPropagation();
    if (!projectId || scanning) return;
    setScanning(true);
    try {
      await analyseGauge(projectId, chart.binding_id || chart.id);
      onRemoved?.();   // shared refetch — pulls the new data_points/verdict onto the board
    } catch (err) { console.error('gauge scan from watching card failed', err); }
    finally { setScanning(false); }
  }

  return (
    <div className={`wtch-card ${kindCls}`} data-attn={attn} onClick={() => onOpen(chart.id)}>
      <button type="button" className="wtch-card-rm" title="Stop watching this gauge" aria-label="Stop watching this gauge" onClick={handleRemove}>
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
      </button>
      <div className="wtch-card-head">
        <span className="wtch-glyph"><svg viewBox="0 0 24 24">{glyphFor(chart.glyph_id || chart.lens_id || chart.id)}</svg></span>
        <div className="wtch-card-body">
          <div className="wtch-card-nm">{chart.question || chart.name || chart.label}</div>
          <div className="wtch-card-ask">{chart.scope?.type} &middot; {chart.scope?.name}</div>
        </div>
      </div>
      <div className="wtch-chart">
        <div className="wtch-chart-vis"><MiniChart chart={chart} isDescrip={isDescrip || isDescrip0} /></div>
        <div className="wtch-chart-metric">
          <div className="wtch-chart-big">{metric.big}{metric.unit && <small>{metric.unit}</small>}</div>
          <div className="wtch-chart-label">{metric.sub}</div>
        </div>
      </div>
      <div className="wtch-foot">
        <div className="wtch-foot-left">
          <span className={`wtch-scan wtch-scan-${verdict}`}>{scannedAgo(chart)}</span>
          <span className="wtch-holders"><BackendGlyph backend={chart.backend} color={holdersColor} />{deriveScopeLabel(chart)}</span>
        </div>
        <div className="wtch-foot-right">
          <button
            type="button"
            className={`wtch-scan-btn${!scanned ? ' is-fresh' : ''}`}
            title={scanned ? 'Re-scan this gauge' : 'Scan now'}
            onClick={handleScan}
            disabled={scanning}
          >
            <svg viewBox="0 0 24 24" className={scanning ? 'is-spin' : undefined}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v5h-5" /></svg>
            {scanning ? 'Scanning…' : scanned ? 'Re-scan' : 'Scan'}
          </button>
          <span className="wtch-arr">&rarr;</span>
        </div>
      </div>
    </div>
  );
}
