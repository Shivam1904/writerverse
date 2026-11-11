import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gauge, Eye } from 'lucide-react';
import './watching.css';
import '../story-so-far/story-so-far.css';
import { PageHeader } from '../../components/PageHeader';
import { PageShell } from '../../components/PageShell';
import { MarginBlock, MarginOverlay, type MarginItem } from '../../modules/margin';
import { WorldSectionEntry } from '../world/components/WorldMargin';
import { Icon } from '../../ui';
import { unbindGauge, analyseGauge } from './api';
import { useActionCost, withCost } from '../../lib/actionCost';
import { glyphFor } from './components/glyphs';
import { formatWelcomeHeadline, useWelcomeBack } from './outlineSnapshot';
import { GaugesInit } from './GaugesInit';
import { deriveVerdict } from './verdict';
import { queries } from '../../queries';

/**
 * GaugesWatching — FORKED from `watching/WatchingPage` and rewired to the gauge
 * board. It's the non-bank ORCHESTRATOR (3 stages, mirroring how the lenses route
 * splits them so each extends separately):
 *   · nothing bound  → <GaugesInit>     (onboarding)
 *   · a card clicked → <GaugesCharts>    (single-chart detail, drill-in)
 *   · otherwise      → the watching dashboard (welcome-back banner + grid + catches)
 * Reads the live board (get_gauge_board); the mini-charts read the same
 * data_points/coverage fields normalizeChart already provides.
 */


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

function Card({ chart, isDescrip0, onOpen, onRemoved }: { chart: any; isDescrip0?: boolean; onOpen: (id: string) => void; onRemoved?: () => void }) {
  const { projectId } = useParams();
  const [scanning, setScanning] = useState(false);
  const scanCost = useActionCost('analyse_gauge');   // SA-270: cost label on the button
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

  // Run (or re-run) analysis straight from the watching card — without this a
  // freshly-bound gauge sits "not scanned" with no way to act from where you land.
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
            {scanning ? 'Scanning…' : withCost(scanned ? 'Re-scan' : 'Scan', scanCost)}
          </button>
          <span className="wtch-arr">&rarr;</span>
        </div>
      </div>
    </div>
  );
}

const EMPTY_BOARD = { charts: [] as any[], scenes: [] as any[] };

export function GaugesWatching() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = String(projectId);
  const { data: board = EMPTY_BOARD, refetch } = useQuery({ ...queries.gaugesBoardView(projectId), enabled: !!projectId });
  const charts = board.charts;

  const gutterAnchorRef = useRef<HTMLDivElement>(null);

  // welcome-back banner — diffs the shared outline cache against the last visit
  const { welcomeCopy, isFirstVisit } = useWelcomeBack(projectId);

  const consistency = useMemo(() => charts.filter((c: any) => c.mode !== 'descriptive'), [charts]);
  const descriptive = useMemo(() => charts.filter((c: any) => c.mode === 'descriptive'), [charts]);
  const totalBound = charts.length;
  const attention = useMemo(() => charts.filter((c: any) => { const v = deriveVerdict(c).verdict; return v === 'warn' || v === 'open'; }), [charts]);
  const attentionCount = attention.length;

  const subText = useMemo(() => (
    <>
      <b>{totalBound} gauges</b> on your story right now
      <span className="wtch-sl">&middot;</span>
      <span><b>{attentionCount}</b> thing{attentionCount !== 1 ? 's' : ''} to look at</span>
    </>
  ), [totalBound, attentionCount]);

  const openBank = () => navigate(`/project/${pid}/gauges/bank`);
  const bankBtn = (
    <button type="button" className="wv2-btn wv2-btn-primary wv2-btn-sm" onClick={openBank}>
      Lens bank
    </button>
  );

  // STAGE 1 — nothing bound → the onboarding takeover.
  if (charts.length === 0) {
    return (
      <div className="wv2-init-page">
        <div className="wv2-init-stage">
          <GaugesInit onBound={refetch} />
        </div>
      </div>
    );
  }

  // STAGE 2 — the watching dashboard (overview). A card opens the redesigned
  // /lens/<id> detail (the old /gauges/<id> route stays reachable by direct URL).
  const openChart = (id: string) => navigate(`/project/${pid}/lens/${id}`);

  const pageHeader = (
    <PageHeader
      section="gauges"
      eyebrow="Plan · watching"
      title="Watching"
      suffix={<span className="wtch-live-dot" />}
      actions={bankBtn}
      caption={<span className="wtch-sub">{subText}</span>}
    />
  );

  // Two natural groups already present in the data: consistency (mode !==
  // 'descriptive', "Active gauges") and descriptive (mode === 'descriptive',
  // "Just noting"). Each becomes a MarginBlock with a docking gutter entry; the
  // overlay tracks whichever groups are present.
  const SECTION_META: Record<string, { icon: ReactNode; label: string; count: number }> = {
    active: { icon: <Icon as={Gauge} size={17} />, label: 'Active gauges', count: consistency.length },
    noting: { icon: <Icon as={Eye} size={17} />, label: 'Just noting', count: descriptive.length },
  };
  const sectionEntry = (id: string, onClick?: () => void): ReactNode => {
    const m = SECTION_META[id];
    return <WorldSectionEntry icon={m.icon} label={m.label} sub={`${m.count}`} onClick={onClick} />;
  };
  const presentSections = (['active', 'noting'] as const).filter((id) =>
    id === 'active' ? consistency.length > 0 : descriptive.length > 0,
  );
  const overlayItems: MarginItem[] = presentSections.map((id) => ({
    id, render: (s: () => void) => sectionEntry(id, s),
  }));

  return (
    <PageShell
      header={pageHeader}
      overlay={presentSections.length > 1 ? <MarginOverlay items={overlayItems} anchorRef={gutterAnchorRef} /> : undefined}
    >
      {/* welcome-back banner + catches strip (preserve current visual order;
          the header itself now lives in PageShell.header) */}
      <div>
        {/* welcome-back banner */}
        <div className="wtch-wb">
          <div className="wtch-wb-row">
            <div className="wtch-wb-icon"><svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-6h4v6" /></svg></div>
            <div className="wtch-wb-body">
              <div className="wtch-wb-lbl">&#10022; welcome back</div>
              <div className="wtch-wb-h">
                {welcomeCopy ? <span dangerouslySetInnerHTML={{ __html: formatWelcomeHeadline(welcomeCopy.headline) }} />
                  : isFirstVisit ? <>First time here &mdash; your outline is being snapshot for next time.</>
                    : <>Loading&hellip;</>}
              </div>
              <div className="wtch-wb-deltas">
                {(welcomeCopy?.addedCount ?? 0) > 0 && (
                  <span className="wtch-wb-delta is-new"><svg viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></svg><b>{welcomeCopy!.addedCount} scene{welcomeCopy!.addedCount !== 1 ? 's' : ''} added</b></span>
                )}
                {(welcomeCopy?.editedCount ?? 0) > 0 && (
                  <span className="wtch-wb-delta"><svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg><b>{welcomeCopy!.editedCount} edited</b></span>
                )}
                <span className="wtch-wb-delta"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg><b>{consistency.filter((c: any) => deriveVerdict(c).verdict === 'holds').length} gauges</b> still holding</span>
                {attentionCount > 0 && (
                  <span className="wtch-wb-delta is-catch"><svg viewBox="0 0 24 24"><path d="M12 4.5l8.5 15h-17l8.5-15z" /><path d="M12 10v4.5" /></svg><b>{attentionCount} catch{attentionCount !== 1 ? 'es' : ''}</b></span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* catches strip */}
        {attentionCount > 0 && (
          <div className="wtch-catches">
            <div className="wtch-catch-icon"><svg viewBox="0 0 24 24"><path d="M12 4.5l8.5 15h-17l8.5-15z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.5" r=".7" fill="currentColor" /></svg></div>
            <span className="wtch-catch-tag">to look at &middot; {attentionCount}</span>
            <div className="wtch-catch-msg">{attentionCount === 1 ? 'One gauge needs attention.' : `${attentionCount} gauges need attention.`}</div>
            <button className="wtch-catch-go" onClick={() => openChart(attention[0].id)}>Open<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></button>
          </div>
        )}
      </div>

      {/* Active (consistency) gauges — anchors the overlay gutter column */}
      {consistency.length > 0 && (
        <MarginBlock
          id="active"
          gutter={<div ref={gutterAnchorRef}>{sectionEntry('active')}</div>}
        >
          <div className="wtch-sec">
            <div className="wtch-sec-t">Active gauges</div>
            <div className="wtch-sec-cap"><b>{consistency.length}</b> consistency gauge{consistency.length !== 1 ? 's' : ''} &middot; <b>{consistency.filter((c: any) => deriveVerdict(c).verdict === 'holds').length} hold</b></div>
          </div>
          <div className="wtch-grid">
            {consistency.map((c: any) => <Card key={c.id} chart={c} onOpen={openChart} onRemoved={refetch} />)}
          </div>
        </MarginBlock>
      )}

      {/* Descriptive (just noting) gauges */}
      {descriptive.length > 0 && (
        <MarginBlock id="noting" gutter={sectionEntry('noting')}>
          <div className="wtch-sec">
            <div className="wtch-sec-t">Just noting</div>
            <div className="wtch-sec-cap"><b>{descriptive.length}</b> descriptive gauge{descriptive.length !== 1 ? 's' : ''} &middot; no verdict, just the shape</div>
          </div>
          <div className="wtch-grid">
            {descriptive.map((c: any) => <Card key={c.id} chart={c} isDescrip0 onOpen={openChart} onRemoved={refetch} />)}
          </div>
        </MarginBlock>
      )}
    </PageShell>
  );
}
