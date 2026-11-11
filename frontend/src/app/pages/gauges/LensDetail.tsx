import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import './charts-view.css';
import './gauges.css';
import '../../modules/lens/lens.css';
import '../../modules/lensKit/lensKit.css';
import '../../modules/lensKit/lensDetail.css';
import { type ChartInstance, visualOptions, effectiveVisual } from './data';
import { setGaugeView, analyseGauge } from './api';
import { useActionCost, withCost } from '../../lib/actionCost';
import { ChartBody } from './components/ChartBody';
import { MiniCard } from './components/MiniCard';
import { LensGlyph } from './components/LensGlyph';
import { ConfigPresetModal } from './components/ConfigPresetModal';
import { BindingsModal } from './components/BindingsModal';
import { GaugeSettingsMenu } from './components/GaugeSettingsMenu';
import { PageRail } from '../../components/PageRail';
import { VerdictBanner } from '../../modules/lensKit/VerdictBanner';
import { BeatGrid } from '../../modules/lensKit/BeatGrid';
import { queries } from '../../queries';

const EMPTY_BOARD = { charts: [] as any[], scenes: [] as any[] };

// A board chart → the lens shape the ConfigPresetModal reads (verbatim from
// GaugesCharts — same Tune-this-gauge flow). Spread the normalized chart so
// EVERY preset field reaches the modal, then override only the renames.
function chartToLens(chart: any): any {
  return {
    ...chart,
    id: chart.lens_id || chart.id,
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

// ── the always-reachable Re-scan / Scan button. Stays ENABLED at all times
// (the prototype's "Up to date" disabled state is intentionally dropped); when
// beats are marked "changed" it gains a count + a pulsing gold dot. ────────────
function RescanButton({ analysed, scanning, changedCount, onClick }: {
  analysed: boolean; scanning: boolean; changedCount: number; onClick: () => void;
}) {
  const ready = changedCount > 0;
  const cost = useActionCost('analyse_gauge');   // SA-270: show the cost label before the click
  const label = scanning ? 'Scanning…'
    : ready ? withCost(`Re-scan · ${changedCount} beat${changedCount > 1 ? 's' : ''} changed`, cost)
    : withCost(analysed ? 'Re-scan' : 'Scan', cost);
  return (
    <button type="button" className={`ui focusring ld-rescan${ready ? ' is-ready' : ''}`}
      onClick={onClick} disabled={scanning}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600,
        padding: '8px 14px', borderRadius: 9, border: '1px solid',
        background: ready ? 'var(--lens-purple-wash)' : 'color-mix(in srgb,var(--lens-paper) 55%,transparent)',
        borderColor: ready ? 'var(--lens-purple-soft)' : 'var(--lens-line)',
        color: ready ? 'var(--lens-purple-deep)' : 'var(--lens-ink-soft)',
        cursor: scanning ? 'default' : 'pointer',
      }}>
      <span className={`ld-rdot${ready ? ' ld-rdot--pulse' : ''}`}
        style={{ width: 7, height: 7, borderRadius: '50%', background: ready ? 'var(--lens-gold)' : 'currentColor', opacity: ready ? 1 : 0.4 }} />
      {label}
    </button>
  );
}

export function LensDetail({ focusId }: any) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const onBack = () => navigate(`/project/${projectId}/gauges`);
  const { data = EMPTY_BOARD } = useQuery({ ...queries.gaugesBoardView(projectId), enabled: !!projectId });

  const [activeIdx, setActiveIdx] = useState(0);
  const [configuring, setConfiguring] = useState<any>(null);      // step 1 · try-on + config → preset
  const [bindingPreset, setBindingPreset] = useState<any>(null);  // step 2 · preset → bindings
  const [visualPicks, setVisualPicks] = useState<Record<string, string>>({}); // optimistic "Show as"
  const [scanning, setScanning] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changed, setChanged] = useState<Set<number>>(new Set());  // beats marked "changed" (per active chart)

  const charts = data.charts;
  const rightRef = useRef<HTMLDivElement>(null);

  // When drilled in from the watching overview, focus that chart (then the rail
  // controls activeIdx so you can switch in place without going back).
  useEffect(() => {
    if (focusId == null) return;
    const i = charts.findIndex((c: any) => c.id === focusId);
    if (i >= 0) setActiveIdx(i);
  }, [focusId, charts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = Math.min(activeIdx, Math.max(0, charts.length - 1));
  const active = charts[idx] || null;
  const empty = charts.length === 0;

  // the "changed" set is per-chart — clear it when the active chart changes.
  useEffect(() => { setChanged(new Set()); setSettingsOpen(false); }, [idx]);

  // close the settings dropdown on outside-click.
  useEffect(() => {
    if (!settingsOpen) return;
    const h = (e: MouseEvent) => { if (rightRef.current && !rightRef.current.contains(e.target as Node)) setSettingsOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [settingsOpen]);

  // other bindings of the SAME preset (same config, different scope)
  const presetId = active ? (active.preset_id || active.lens_id) : null;
  const siblings = active
    ? charts.filter((c: any) => (c.preset_id || c.lens_id) === presetId && (c.binding_id || c.id) !== (active.binding_id || active.id))
    : [];
  const shown: any = active ? { ...active, visual: visualPicks[active.id] ?? active.visual } : null;
  const vOpts = active ? visualOptions(active) : [];

  const onShowAs = async (v: string) => {
    if (!active) return;
    setVisualPicks((p) => ({ ...p, [active.id]: v }));   // flip instantly
    try { await setGaugeView(projectId, active.id, { visual: v }); } catch (e) { console.error('set view failed', e); }
  };
  const onRescan = async () => {
    if (!active || scanning) return;
    setScanning(active.id);
    try { await analyseGauge(projectId, active.id); setChanged(new Set()); }
    catch (e) { console.error('analyse failed', e); }
    finally { setScanning(''); }
  };
  const toggleBeat = (i: number) => setChanged((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });
  const onTune = () => { if (active) setConfiguring(chartToLens(active)); setSettingsOpen(false); };

  // what this binding walks + tick grain — for the x-axis caption.
  const vis = shown ? effectiveVisual(shown) : '';
  const dataStyle = shown ? (shown.data_style || (['coverage', 'dependency'].includes(shown.backend) ? 'coverage' : 'scene_mapped')) : '';
  const isScene = dataStyle === 'scene_mapped';
  const walk = shown?.axis?.walk || 'outline';
  const attached = walk === 'thread'
    ? (shown?.thread_label ? `the “${shown.thread_label}” thread` : 'a thread')
    : walk === 'story' ? 'the story' : 'the outline';
  const nTicks = (shown?.ticks?.length || shown?.data_points?.length || 0);
  const rubric = shown ? (shown.read_as || shown.look_for || shown.math_rule_explain || shown.invariant || '') : '';
  const hasBeats = !!(shown?.data_points?.length);

  const scopeName = shown ? (shown.scope_label || shown.scope?.name || '') : '';
  const isStory = shown?.scope?.type === 'story';
  const avatar = isStory ? '✦' : ((scopeName.trim()[0] || '?').toUpperCase());

  return (
    <div className="wv2-page cv-page">
      <div className="wv2-page-main cv-main">
        <div className="lens-root" style={{ maxWidth: 1020, width: '100%', margin: '0 auto', paddingBottom: 60 }}>

          {/* ── top bar ── */}
          <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div className="kicker">See · Gauges</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 9, color: 'var(--lens-purple)', background: 'var(--lens-purple-wash)' }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 13a8 8 0 1 0-8-8" /><path d="M12 13l4-4" /><path d="M4 20h16" /></svg>
                </span>
                <h1 style={{ margin: 0, fontFamily: 'var(--lens-serif)', fontSize: 24, fontWeight: 600, letterSpacing: '-.01em' }}>Gauges</h1>
                <span className="ui" style={{ fontSize: 13, color: 'var(--lens-muted)' }}>· {charts.length} watching</span>
              </div>
            </div>
            <div ref={rightRef} style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              <button type="button" className="ui focusring ld-ghostlink" onClick={onBack}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, background: 'transparent', fontSize: 13, color: 'var(--lens-ink-soft)', padding: '7px 6px', borderRadius: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg> Watching
              </button>
              <button type="button" className="ui focusring ld-btn" onClick={() => navigate(`/project/${projectId}/gauges/bank`)}
                style={{ border: '1px solid var(--lens-line-2)', background: 'var(--lens-paper)', color: 'var(--lens-ink-soft)', fontSize: 13, fontWeight: 600, padding: '8px 15px', borderRadius: 9 }}>
                Bank
              </button>
              {!empty && shown && (
                <button type="button" className={`ui focusring ld-iconbtn${settingsOpen ? ' is-on' : ''}`}
                  title="Gauge settings" aria-label="Gauge settings"
                  onClick={(e) => { e.stopPropagation(); setSettingsOpen((o) => !o); }}
                  style={{
                    width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 9,
                    border: `1px solid ${settingsOpen ? 'var(--lens-purple-soft)' : 'var(--lens-line)'}`,
                    background: settingsOpen ? 'var(--lens-purple-wash)' : 'color-mix(in srgb,var(--lens-paper) 55%,transparent)',
                    color: settingsOpen ? 'var(--lens-purple-deep)' : 'var(--lens-muted)',
                  }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                </button>
              )}
              {settingsOpen && shown && (
                <GaugeSettingsMenu chart={shown} siblings={siblings} onTune={onTune} />
              )}
            </div>
          </header>

          {empty ? (
            <div className="cv-empty" style={{ marginTop: 40 }}><p>No gauges watching yet. Add one from the Bank, then run a scan to see it here.</p></div>
          ) : shown ? (
            <>
              {/* ── gauge identity ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '30px 0 16px' }}>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <LensGlyph id={shown.glyph_id || shown.lens_id || shown.id} kind={shown.kind || 'feeling'} />
                  <span style={{ position: 'absolute', top: -4, right: -4, color: 'var(--lens-gold)', fontSize: 13 }}>✦</span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontFamily: 'var(--lens-serif)', fontSize: 27, fontWeight: 600, letterSpacing: '-.015em' }}>{shown.question || shown.name || shown.label}</h2>
                  <p className="ui" style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--lens-muted)' }}>{shown.kind_word || ''}</p>
                </div>
                <span title="who this gauge judges"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 7px', border: '1px solid var(--lens-line-2)', borderRadius: 99, background: 'color-mix(in srgb,var(--lens-paper) 70%,transparent)' }}>
                  <span style={{ width: 24, height: 24, flex: '0 0 auto', borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: 'var(--lens-serif)', fontSize: 12, fontWeight: 600, color: '#fff', background: 'linear-gradient(150deg,#a44e72,#7f3a57)' }}>{avatar}</span>
                  <span style={{ lineHeight: 1.05 }}>
                    <span className="ui" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--lens-muted)' }}>{isStory ? 'watching' : 'judging'}</span><br />
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lens-ink)' }}>{scopeName}</span>
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lens-muted-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </span>
              </div>

              {/* ── chart card: verdict is its header ── */}
              <section style={{
                border: '1px solid var(--lens-line)', borderRadius: 18, overflow: 'hidden',
                background: 'color-mix(in srgb,var(--lens-paper) 84%,transparent)',
                boxShadow: '0 1px 0 #fff inset, 0 22px 50px rgba(40,28,70,.07)',
              }}>
                <VerdictBanner chart={shown as ChartInstance} rubric={rubric} />

                {vOpts.length > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 18px 0' }}>
                    <div style={{ display: 'inline-flex', gap: 3, padding: 3, border: '1px solid var(--lens-line)', borderRadius: 10, background: 'var(--lens-paper)', boxShadow: 'inset 0 1px 2px rgba(74,54,108,.05)' }}>
                      {vOpts.map((o) => {
                        const on = vis === o.id;
                        return (
                          <button key={o.id} type="button" className={`ui focusring ld-seg-btn${on ? ' is-on' : ''}`} onClick={() => onShowAs(o.id)}
                            style={{
                              border: 0, padding: '5px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                              background: on ? 'color-mix(in srgb,var(--lens-purple) 13%,var(--lens-paper))' : 'transparent',
                              color: on ? 'var(--lens-purple-deep)' : 'var(--lens-muted)',
                              boxShadow: on ? '0 1px 2px rgba(74,54,108,.12)' : 'none',
                            }}>{o.label}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ padding: '6px 22px 8px' }}>
                  {shown.analysed_at ? (
                    <ChartBody chart={shown} scenes={shown.ticks?.length ? shown.ticks : data.scenes} hideLegend />
                  ) : (
                    <div style={{ padding: '34px 6px 38px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--lens-serif)', fontSize: 16, fontWeight: 600 }}>Ready to scan</div>
                      <div className="ui" style={{ fontSize: 12.5, color: 'var(--lens-muted)', marginTop: 4 }}>{shown.empty_state || 'Run a scan to see this across your scenes.'}</div>
                    </div>
                  )}
                </div>

                {isScene && vis !== 'gauge' && (
                  <div className="ui" style={{ padding: '2px 22px 18px', textAlign: 'center', fontSize: 12.5, color: 'var(--lens-muted)' }}>
                    walks <b style={{ color: 'var(--lens-purple-deep)', fontWeight: 600, fontFamily: 'var(--lens-serif)', fontStyle: 'italic', fontSize: 13.5 }}>{attached}</b>
                    {nTicks ? <><span style={{ margin: '0 7px', color: 'var(--lens-muted-2)' }}>·</span>{nTicks} beats</> : null}
                  </div>
                )}
              </section>

              {/* ── beats (scene-walking charts only) ── */}
              {hasBeats ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, margin: '26px 0 12px' }}>
                    <h3 style={{ margin: 0, fontFamily: 'var(--lens-serif)', fontSize: 18, fontWeight: 600 }}>
                      Each beat on the arc
                      <span className="ui" style={{ fontSize: 12, color: 'var(--lens-muted)', marginLeft: 8, fontWeight: 400 }}>{nTicks || shown.data_points.length} beats</span>
                    </h3>
                    <RescanButton analysed={!!shown.analysed_at} scanning={!!scanning} changedCount={changed.size} onClick={onRescan} />
                  </div>
                  <BeatGrid chart={shown as ChartInstance} changed={changed} onToggle={toggleBeat} />
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <RescanButton analysed={!!shown.analysed_at} scanning={!!scanning} changedCount={0} onClick={onRescan} />
                </div>
              )}
            </>
          ) : null}
        </div>
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

      {/* STEP 1 — same merged try-on + config preset modal as the bank. */}
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
