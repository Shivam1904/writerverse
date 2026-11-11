import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import './charts-view.css';
import './gauges.css';
import { PageHeader, Segmented } from '../../components/PageHeader';
import { type ChartInstance, visualOptions, effectiveVisual } from './data';
import { setGaugeView, analyseGauge } from './api';
import { useActionCost, withCost } from '../../lib/actionCost';
import { Verdict } from './components/Verdict';
import { ChartBody } from './components/ChartBody';
import { EvidenceStrip } from './components/EvidenceStrip';
import { MiniCard } from './components/MiniCard';
import { LensGlyph } from './components/LensGlyph';
import { ConfigPresetModal } from './components/ConfigPresetModal';
import { BindingsModal } from './components/BindingsModal';
import { PresetSettings } from './components/PresetSettings';
import { PageRail } from '../../components/PageRail';
import { queries } from '../../queries';

const EMPTY_SET = new Set<string>();
const EMPTY_BOARD = { charts: [] as any[], scenes: [] as any[] };

// Friendly header — the ONE canonical name + plain scope + what this binding
// walks (the attached thread, else the outline) + the bespoke glyph.
function ChartHeader({ chart }: { chart: any }) {
  // coverage lenses (checklist / setup→payoff) don't walk an axis — no "walks …".
  const isPerTick = (chart.data_style
    || (['coverage', 'dependency'].includes(chart.backend) ? 'coverage' : 'scene_mapped')) === 'scene_mapped';
  const walk = chart.axis?.walk || 'outline';
  const attached = walk === 'thread'
    ? (chart.thread_label ? `the “${chart.thread_label}” thread` : 'a thread')
    : walk === 'story' ? 'the story' : 'the outline';
  return (
    <div className="gz-chead">
      <LensGlyph id={chart.glyph_id || chart.lens_id || chart.id} kind={chart.kind || 'feeling'} />
      <div className="gz-chead-body">
        <div className="gz-chead-name">{chart.question || chart.name || chart.label}</div>
        <div className="gz-chead-scope">
          {chart.kind_word} · {chart.scope_label || chart.scope?.name}
          {isPerTick && <span className="gz-chead-walk"> · walks {attached}</span>}
        </div>
      </div>
    </div>
  );
}

// A board chart (a resolved preset + binding + analysis) → the lens shape the
// ConfigPresetModal reads. Spread the already-normalized chart so EVERY preset
// field reaches the modal — analyse_body / extract_body / axis / good / off /
// y_items_hint / scope prompt — then override only the chart→lens renames. An
// allowlist here silently drops preset settings: the modal opens blank AND a
// save (buildConfig reads those same fields) wipes whatever was dropped.
function chartToLens(chart: any): any {
  return {
    ...chart,
    id: chart.lens_id || chart.id,   // lens identity = the referenced preset, not the binding
    term: chart.lens_id, template_id: chart.lens_id, chart_def_id: chart.lens_id,
    name: chart.name || chart.label,
    ask: chart.read_as || chart.look_for || '',
    mode: chart.backend === 'ledger' ? 'discrete' : 'continuous',
    items: (chart.y_items || []).slice(), items_meta: chart.y_items_meta || [],
    visual: chart.display,
    scope_type: chart.scope?.type, scope_name: chart.scope?.name,
    state: 'watching',
  };
}

export function GaugesCharts({ focusId }: any) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const onBack = () => navigate(`/project/${projectId}/gauges`);
  const { data = EMPTY_BOARD } = useQuery({ ...queries.gaugesBoardView(projectId), enabled: !!projectId });

  const [activeIdx, setActiveIdx] = useState(0);
  const [configuring, setConfiguring] = useState<any>(null);      // step 1 · try-on + config → preset
  const [bindingPreset, setBindingPreset] = useState<any>(null);  // step 2 · preset → bindings
  const [visualPicks, setVisualPicks] = useState<Record<string, string>>({}); // optimistic "Show as"
  const [scanning, setScanning] = useState('');
  const scanCost = useActionCost('analyse_gauge');   // SA-270: cost label on the button

  const charts = data.charts;

  // When drilled in from the watching overview, focus that chart (then the rail
  // controls activeIdx normally so you can switch without going back).
  useEffect(() => {
    if (focusId == null) return;
    const i = charts.findIndex((c: any) => c.id === focusId);
    if (i >= 0) setActiveIdx(i);
  }, [focusId, charts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = Math.min(activeIdx, Math.max(0, charts.length - 1));
  const active = charts[idx] || null;
  const empty = charts.length === 0;
  // other bindings of the SAME preset (same config, different scope)
  const presetId = active ? (active.preset_id || active.lens_id) : null;
  const siblings = active
    ? charts.filter((c: any) => (c.preset_id || c.lens_id) === presetId && (c.binding_id || c.id) !== (active.binding_id || active.id))
    : [];
  const shown = active ? { ...active, visual: visualPicks[active.id] ?? active.visual } : null;
  const vOpts = active ? visualOptions(active) : [];

  const onShowAs = async (v: string) => {
    if (!active) return;
    setVisualPicks((p) => ({ ...p, [active.id]: v }));   // flip instantly
    try { await setGaugeView(projectId, active.id, { visual: v }); } catch (e) { console.error('set view failed', e); }
  };
  const onRescan = async () => {
    if (!active || scanning) return;
    setScanning(active.id);
    try { await analyseGauge(projectId, active.id); } catch (e) { console.error('analyse failed', e); } finally { setScanning(''); }
  };

  return (
    <div className="wv2-page cv-page">
      <div className="wv2-page-main cv-main">
        <PageHeader
          section="gauges"
          eyebrow="Plan · lenses"
          title="Lenses"
          suffix={<>· {charts.length} watching</>}
          actions={
            <>
              <button type="button" className="wv2-btn wv2-btn-ghost wv2-btn-sm" onClick={onBack}>← Watching</button>
              <button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={() => navigate(`/project/${projectId}/gauges/bank`)}>Bank</button>
            </>
          }
        />

        {empty ? (
          <div className="cv-empty"><p>No gauges watching yet. Add one from the Bank, then run a scan to see it here.</p></div>
        ) : shown ? (
          <div className="cv-detail">
            <ChartHeader chart={shown} />
            <Verdict chart={shown as ChartInstance} />
            {vOpts.length > 1 && (
              <div className="gz-showas">
                <span className="gz-showas-lbl">Show as</span>
                <Segmented value={effectiveVisual(shown)} onChange={onShowAs} ariaLabel="chart visual"
                  options={vOpts.map((o) => ({ value: o.id, label: o.label }))} />
              </div>
            )}
            {shown.analysed_at ? (
              <ChartBody chart={shown} scenes={shown.ticks?.length ? shown.ticks : data.scenes} />
            ) : (
              <div className="cv-chart-card"><div className="gz-empty">
                <div className="t">Ready to scan</div>
                <div className="s">{shown.empty_state || 'Run a scan to see this across your scenes.'}</div>
              </div></div>
            )}
            <div className="cv-chart-actions gz-chart-actions">
              <div className="cv-actions">
                <button className="wv2-btn wv2-btn-subtle wv2-btn-sm" type="button" onClick={() => setConfiguring(chartToLens(active))}>
                  Tune this gauge
                </button>
                <button className="wv2-btn wv2-btn-sm" type="button" onClick={onRescan} disabled={!!scanning}>
                  {scanning ? 'Scanning…' : withCost(shown.analysed_at ? 'Re-scan' : 'Scan', scanCost)}
                </button>
              </div>
            </div>
            {shown.backend === 'trajectory' && shown.mode !== 'descriptive' && shown.analysed_at && (
              <EvidenceStrip chart={shown as ChartInstance} staleScenes={EMPTY_SET} />
            )}
            <PresetSettings chart={shown} siblings={siblings} />
          </div>
        ) : null}
      </div>

      {!empty && (
        <PageRail resizeKey="panel-gauges-charts" width={300}>
          <div className="cv-rail">
            <div className="cv-rail-head"><span>Watching</span><span className="cv-rail-ct">{charts.length}</span></div>
            <div className="cv-rail-list">
              {charts.map((c: any, i: number) => (
                <MiniCard key={c.id} chart={c} active={i === idx} onClick={() => setActiveIdx(i)} />
              ))}
            </div>
          </div>
        </PageRail>
      )}

      {/* STEP 1 — same merged try-on + config preset modal as the bank. The
          gauge may be bound to several scopes; pass them so the modal can warn
          that tuning edits the shared config for all of them. */}
      <ConfigPresetModal
        lens={configuring}
        bindings={configuring
          ? charts.filter((c: any) => (c.lens_id || c.id) === configuring.id).map((c: any) => ({ binding_id: c.binding_id, type: c.scope?.type, name: c.scope?.name }))
          : []}
        onClose={() => setConfiguring(null)}
        onShowBindings={(lens: any) => { setConfiguring(null); setBindingPreset(lens); }}
        onSaved={(preset: any) => { setConfiguring(null); setBindingPreset(preset); }}
      />

      {/* STEP 2 — preset → bindings (attach / detach scopes). */}
      {bindingPreset && (
        <BindingsModal preset={bindingPreset} onClose={() => setBindingPreset(null)} onChanged={() => {}} />
      )}
    </div>
  );
}
