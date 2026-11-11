import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { callOp } from '../../../gateway';
import { KINDS } from '../fixtures';
import { bindGauge, unbindGauge, setGaugeView, extractGaugeScale, savePreset, updatePreset, acceptSuggestion, acceptInvention } from '../api';
import { useActionCost, withCost } from '../../../lib/actionCost';
import { visualOptions, VISUAL_LABELS } from '../data';
import { buildExampleChart, SYNTH_SCENES } from './sample';
import { ChartBody } from './ChartBody';
import { useGaugeRules } from '../hooks';
import { receipt } from '../../../modules/receipt/receiptStore';

const UNDONE_MSG = "Couldn't save that change — undone";

// "Show findings as ▾" labels (the report_views menu).
const VIEW_LABELS: Record<string, string> = {
  inline_markers: 'inline markers', list: 'a list', summary: 'a one-line summary',
  notes: 'notes / observations', breach_flags: 'breach flags',
  missing_list: 'what’s missing', hanging_list: 'what’s still open',
};

// Illustrative findings preview per report_view (report CONTENT is deferred
// backend-side — this is a mock so the picker reads true).
function ReportViewPreview({ view, lens }: any) {
  const last = (lens.items || []).slice(-1)[0];
  const mock: Record<string, JSX.Element> = {
    inline_markers: <span className="gz-rvp-row">↓ a wobble at sc 6 — flagged on the line</span>,
    list: <>
      <div className="gz-rvp-row">⚑ backslides at sc 6</div>
      <div className="gz-rvp-row">⚑ stalls flat sc 3–5</div>
    </>,
    summary: <span className="gz-rvp-row">2 issues — read above</span>,
    notes: <>
      <div className="gz-rvp-row">› flat stretch sc 4–7</div>
      <div className="gz-rvp-row">› a sharp swing at sc 8</div>
    </>,
    breach_flags: <span className="gz-rvp-row">⚑ two holders at sc 5 · teleport at sc 9</span>,
    missing_list: <span className="gz-rvp-row">✗ missing: {last || 'a required item'}</span>,
    hanging_list: <span className="gz-rvp-row">“the postcards” — never paid off</span>,
  };
  return <div className="gz-rvp">{mock[view] || <span className="gz-rvp-row">findings appear here after a scan</span>}</div>;
}

// The verdict badge — what the lens JUDGES. Registry-driven: resolve the lens's
// `rule` (or legacy `math_rule`) → its label + checks from the served rules
// registry; fall back to per-backend wording.
function verdictText(lens: any, registry: Record<string, any> = {}): { icon: string; text: string } {
  const rid = lens.rule || lens.math_rule;
  if (rid && rid !== 'none') {
    // single source of truth: the per-lens rules menu, then the shared registry
    // (no hardcoded per-backend wording — the rule IS the verdict).
    const r = (lens.rules || []).find((x: any) => x.id === rid) || registry[rid] || {};
    const hint = registry[rid]?.hint || '';
    const soon = r.status === 'deferred' ? ' (verdict coming soon)' : '';
    return { icon: '⚖', text: `${r.label || rid}${hint ? ` — ${hint}` : ''}${soon}` };
  }
  return { icon: '🗺', text: 'A map — no verdict, just the shape.' };
}

// Resolve the lens id that matches the board's binding rows (`lens_id`). For a
// normalized lens, `id` IS the lens_id; chartToLens also sets `template_id`.
function resolveTemplateId(lens: any) {
  return lens?.template_id || (typeof lens?.id === 'string' && !lens.id.includes(':') ? lens.id : null) || lens?.term;
}

// The meaning layer: a y-item's description (what the step MEANS in this story),
// seeded from lens.items_meta so the editor shows + edits descriptions.
function descOfItem(text: string, lens: any) {
  const m = (lens?.items_meta || []).find((x: any) => (x.value || '').toLowerCase() === (text || '').toLowerCase());
  return m?.description || '';
}

// The AI-only analyse instruction, locked + shown read-only (the four eyes).
function lockedHeadFor(lens: any) {
  const b = lens?.backend;
  if (b === 'coverage') return 'We check whether each thing appears somewhere in your story.';
  if (b === 'dependency') return 'We pair each setup with its payoff and flag the unpaid.';
  if (lens?.mode === 'discrete' || b === 'ledger') return 'We pick one state per scene and check your rule holds.';
  return 'We score each scene on your steps, in order, lowest to highest.';
}


export function ConfigureLensModal({ lens, onClose, onRemoveScope = undefined, selections = [] }: any) {
  const { projectId } = useParams();
  const rules = useGaugeRules();   // the verdict-rule registry (forward-compat)
  const [items, setItems] = useState<any[]>([]);
  const [yinput, setYinput] = useState('');
  const [scopeName, setScopeName] = useState('');
  const [scopeCandidates, setScopeCandidates] = useState<any[]>([]);
  const [bindingIdx, setBindingIdx] = useState(-1); // -1 = "new scope" mode
  const [addingNew, setAddingNew] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const extractCost = useActionCost('extract_gauge_scale');   // SA-270: cost label on the button
  const [saving, setSaving] = useState(false);
  const [curVisual, setCurVisual] = useState('');   // step 3 — chart visual pick
  const [curView, setCurView] = useState('');        // step 4 — report-view pick
  const [curRule, setCurRule] = useState('');        // the verdict-rule override (bind-time)
  const [blockKey, setBlockKey] = useState('');       // section lens → bound World block
  const [worldBlocks, setWorldBlocks] = useState<any[]>([]); // candidate World sections

  const watching = lens?.state === 'watching';
  const meta = lens ? KINDS[lens.kind] ?? KINDS.feeling : null;
  const needsScope = lens && lens.scope_type && lens.scope_type !== 'story';
  // The scope is "ready" simply by having a value — no separate confirm step (#12).
  const scopeReady = !needsScope || !!(scopeName && scopeName.trim());
  // A gauge is ONE chart; `discrete` (ledger/state) only drives the copy below.
  const discrete = lens?.mode === 'discrete' || lens?.backend === 'ledger';

  // Existing bindings for this lens, from the board-derived selections.
  const tid = resolveTemplateId(lens);
  const bindings = (selections || []).filter((b: any) => b?.template === tid);
  const hasBindings = bindings.length > 0;
  const activeBind = bindingIdx >= 0 && bindingIdx < bindings.length ? bindings[bindingIdx] : null;

  useEffect(() => {
    if (!lens) return;

    // Seed the scale (with descriptions) + the visual/report/rule picks.
    setItems((lens.items || []).map((t: string) => ({ text: t, desc: descOfItem(t, lens), ai: true, fresh: false })));
    setYinput('');
    setCurVisual(lens.visual || lens.display || lens.visual_default || (lens.visuals || [])[0] || '');
    setCurView(lens.report_view || (lens.report_views || [])[0] || '');
    setCurRule(lens.rule || lens.math_rule || '');

    // Section lenses bind to a World block (block_key) — seed it + fetch candidates.
    const sectionLens = lens.y_items_source === 'section';
    setBlockKey(sectionLens ? (lens.block_key || '') : '');
    setWorldBlocks([]);
    if (sectionLens && projectId) {
      callOp(projectId, 'get_world_blocks').then((r: any) => setWorldBlocks(r?.blocks || [])).catch(() => {});
    }

    // Resolve the scope from existing bindings or the lens props.
    const lensBindings = (selections || []).filter((b: any) => b?.template === resolveTemplateId(lens));
    if (lensBindings.length > 0) {
      setBindingIdx(0);
      setAddingNew(false);
      setScopeName(lensBindings[0].scope?.name || '');
      // seed the first bound scope's REAL saved config (scale/visual/rule).
      if (lensBindings[0].chart) seedFromChart(lensBindings[0].chart);
    } else if (lens.scope_name) {
      setBindingIdx(-1);
      setAddingNew(false);
      setScopeName(lens.scope_name);
    } else {
      setBindingIdx(-1);
      setAddingNew(false);
      setScopeName('');
    }
    setScopeCandidates([]);
    if (projectId && lens.scope_type === 'character') {
      callOp(projectId, 'get_characters').then((r: any) => setScopeCandidates((r.characters || []).map((c: any) => c.name).filter(Boolean))).catch(() => {});
    } else if (projectId && lens.scope_type === 'object') {
      callOp(projectId, 'get_items').then((r: any) => setScopeCandidates((r.items || []).map((it: any) => it.name).filter(Boolean))).catch(() => {});
    }
  }, [lens, projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!lens) return null;

  // ---- binding navigation (per bound scope) ----
  function goToBinding(idx: number) {
    if (idx < 0 || idx >= bindings.length) return;
    setBindingIdx(idx);
    setAddingNew(false);
    setScopeName(bindings[idx].scope?.name || '');
    setYinput('');
    // load THIS scope's saved config (the #2 fix — was a dead REST call before).
    if (bindings[idx].chart) seedFromChart(bindings[idx].chart);
  }

  // Seed the editor from a bound chart (the per-scope saved config), falling back
  // to the lens defaults where the chart doesn't carry a field.
  function seedFromChart(chart: any) {
    const m = (chart.y_items_meta && chart.y_items_meta.length)
      ? chart.y_items_meta
      : (chart.y_items || []).map((v: string) => ({ value: v, description: '' }));
    if (m.length) setItems(m.map((y: any) => ({ text: y.value, desc: y.description || '', ai: true, fresh: false })));
    setCurVisual(chart.visual || chart.display || lens.visual || lens.display || '');
    setCurView(chart.report_view || lens.report_view || '');
    setCurRule(chart.rule || chart.math_rule || lens.rule || lens.math_rule || '');
    if (typeof chart.block_key === 'string') setBlockKey(chart.block_key);
  }

  function startNewScope() {
    setBindingIdx(-1);
    setAddingNew(true);
    setScopeName('');
  }

  // Section lens — pick which World block backs the scale; load its live items
  // (read-only here; they grow as the author edits that World section).
  function pickBlock(key: string) {
    setBlockKey(key);
    if (!key || !projectId) { setItems([]); return; }
    callOp(projectId, 'get_world_block', { name: key }).then((blk: any) => {
      const its = (blk?.items || [])
        .map((it: any) => ({ text: it.title || it.value || '', desc: it.content || it.description || '', ai: true, fresh: false }))
        .filter((x: any) => x.text);
      setItems(its);
    }).catch(() => {});
  }

  // ---- y-items (what to measure) ----
  function editItem(j: number, text: string) {
    setItems((prev) => prev.map((it, i) => (i === j ? { ...it, text } : it)));
  }
  function editItemDesc(j: number, desc: string) {
    setItems((prev) => prev.map((it, i) => (i === j ? { ...it, desc } : it)));
  }
  function clearAi(j: number) {
    setItems((prev) => prev.map((it, i) => (i === j ? { ...it, ai: false } : it)));
  }
  function removeItem(j: number) {
    setItems((prev) => prev.filter((_, i) => i !== j));
  }
  function addItem() {
    const t = yinput.trim();
    if (!t) return;
    setItems((prev) => [...prev, { text: t, desc: '', ai: false, fresh: true }]);
    setYinput('');
    clearFresh();
  }
  function clearFresh() {
    setTimeout(() => setItems((prev) => prev.map((it) => ({ ...it, fresh: false }))), 1000);
  }

  const scopeType = lens?.scope_type || 'story';
  const effScopeName = activeBind?.scope?.name || (needsScope ? scopeName : 'the whole story');
  const bindingId = activeBind?.chart?.binding_id;   // the write key for bind-layer caps
  const isSection = lens?.y_items_source === 'section';

  // extracted-source: draft the scale from the story via the cap (operates on the
  // BINDING, so ensure a preset + bind first if not yet bound).
  async function handleExtract() {
    if (!projectId || extracting || isSection) return;
    setExtracting(true);
    try {
      let bid = bindingId;
      if (!bid) {
        const presetId = await ensurePreset();
        const r: any = await bindPreset(presetId);
        bid = r?.binding_id;
      }
      const r: any = await extractGaugeScale(projectId, bid);
      const yi = r?.y_items;
      if (Array.isArray(yi) && yi.length) {
        setItems(yi.map((it: any) => ({ text: it.value ?? it, desc: it.description ?? '', ai: true, fresh: false })));
      }
    } catch (err) {
      console.error('extract failed', err);
    } finally {
      setExtracting(false);
    }
  }

  // The two visual menus (steps 3 & 4) + the verdict badge + rule picker.
  const visMenu: string[] = visualOptions(lens).map((o) => o.id);
  const viewMenu: string[] = lens.report_views || [];
  const effVisual = curVisual && visMenu.includes(curVisual) ? curVisual : (visMenu[0] || '');
  const effView = curView && viewMenu.includes(curView) ? curView : (viewMenu[0] || '');
  const visIdx = Math.max(0, visMenu.indexOf(effVisual));
  const viewIdx = Math.max(0, viewMenu.indexOf(effView));
  const previewLens = {
    ...lens,
    items: items.map((it) => it.text).filter(Boolean),
    items_meta: items.map((it) => ({ value: it.text, description: it.desc || '' })).filter((y) => y.value),
  };
  // step-3 preview: an already-scanned bound chart shows its REAL shape (the
  // visual still switches live); otherwise a clearly-synthetic example (#11).
  const boundChart = activeBind?.chart;
  const realPreview = !!(boundChart && boundChart.analysed_at && ((boundChart.data_points?.length) || (boundChart.coverage?.length)));
  const previewScenes = realPreview && boundChart.data_points?.length
    ? boundChart.data_points.map((d: any, i: number) => ({ id: d.scene_id || `s${i}`, label: `sc ${i + 1}` }))
    : SYNTH_SCENES;
  const previewChart = realPreview ? { ...boundChart, visual: effVisual } : buildExampleChart({ ...previewLens, visual: effVisual });
  const effRule = curRule || lens.rule || lens.math_rule || '';
  const badge = verdictText({ ...lens, rule: effRule }, rules);
  // The verdict-rule menu is served PER LENS (family-gated backend-side) — the
  // writer can override it at bind time, like the scale/visual. `rules` is
  // [{id,label,status}]; the badge above reflects the current pick.
  const ruleMenu: any[] = Array.isArray(lens.rules) ? lens.rules : [];

  function stepVisual(d: number) {
    const i = visIdx + d;
    if (i < 0 || i >= visMenu.length) return;
    const v = visMenu[i], prev = curVisual;
    setCurVisual(v);
    if (bindingId) setGaugeView(projectId, bindingId, { visual: v }).catch(() => {
      receipt(UNDONE_MSG);
      setCurVisual((cur) => (cur === v ? prev : cur));
    });
  }
  function stepView(d: number) {
    const i = viewIdx + d;
    if (i < 0 || i >= viewMenu.length) return;
    const v = viewMenu[i], prev = curView;
    setCurView(v);
    if (bindingId) setGaugeView(projectId, bindingId, { report_view: v }).catch(() => {
      receipt(UNDONE_MSG);
      setCurView((cur) => (cur === v ? prev : cur));
    });
  }

  // ── CONFIG layer (a preset) — what the user edits. The picks (scope_name /
  //    visual / report_view / block_key) ride on the BINDING, not here. ──────
  function buildConfig() {
    const yItems = items.map((it) => ({ value: it.text, description: it.desc || '' })).filter((y) => y.value);
    return {
      id: lens.source === 'preset' ? (lens.preset_id || lens.id) : undefined,
      source: lens.source,
      type: lens.type,
      scope_type: scopeType,
      name: lens.name || lens.label,
      watches: lens.watches, read_as: lens.read_as, look_for: lens.look_for,
      good: lens.good, off: lens.off, invariant: lens.invariant, direction: lens.direction,
      y_items_hint: lens.y_items_hint, y_items_source: lens.y_items_source,
      analyse_body: lens.analyse_body, extract_body: lens.extract_body,
      y_items: yItems,
      rules: effRule && effRule !== 'none' ? [effRule] : [],
      visuals: lens.visuals, report_views: lens.report_views,
    };
  }

  // Materialize/update the preset (accept candidates; save a bank template as a
  // new preset; update an existing preset → its instances follow). Returns preset_id.
  async function ensurePreset(): Promise<any> {
    const config = buildConfig();
    if (lens.source === 'suggested' || lens.source === 'invented') {
      const r: any = lens.source === 'suggested'
        ? await acceptSuggestion(projectId, lens.id)
        : await acceptInvention(projectId, lens.id);
      const pid = r?.preset_id;
      // apply any edits; no catch: a failure must reach the caller's error
      if (pid) await updatePreset(projectId, pid, config);
      return pid;
    }
    if (lens.source === 'preset') {
      await updatePreset(projectId, lens.preset_id || lens.id, config);
      return lens.preset_id || lens.id;
    }
    const r: any = await savePreset(projectId, config); // bank template → a new preset
    return r?.preset_id;
  }

  // ── BIND layer (an instance) — reference a preset + scope + per-binding picks. ─
  async function bindPreset(presetId: any): Promise<any> {
    if (!presetId) return null;
    return bindGauge(projectId, {
      ref: { kind: 'preset', id: presetId },
      source: 'preset',
      scope_name: effScopeName,
      pair: lens.pair,
      block_key: isSection ? (blockKey || undefined) : undefined,
      visual: effVisual || undefined,
      report_view: effView || undefined,
    });
  }

  // Save & watch — the TWO calls, in order (config then bind). Accept ⊥ bind.
  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      const presetId = await ensurePreset();
      await bindPreset(presetId);
      onClose();
    } catch (err) {
      console.error('save + bind failed', err);
      setSaving(false);
    }
  }

  // Save the config only — build your bank without watching yet.
  async function onSavePreset() {
    if (saving) return;
    setSaving(true);
    try { await ensurePreset(); onClose(); }
    catch (err) { console.error('save preset failed', err); setSaving(false); }
  }

  // Unbind this instance — the preset survives.
  async function onUnbind() {
    if (!bindingId) return;
    try { await unbindGauge(projectId, bindingId); onClose(); }
    catch (err) { console.error('unbind failed', err); }
  }

  return (
    <div className="lens-cfg-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lens-cfg" role="dialog" aria-modal="true">
        <div className="lens-cfg-head">
          <div className="lens-cfg-head-main">
            <div className="lens-cfg-kicker"><span className="lens-spark">✦</span> Set up this gauge</div>
            <div className="lens-cfg-title">{lens.name || lens.label}</div>
            <div className="lens-cfg-desc">{lens.desc ?? lens.ask}</div>
            {/* the verdict — what this gauge JUDGES; the writer can override the
                rule at bind time (served per-lens, family-gated) */}
            <div className="gz-verdict-badge"><span className="ico">{badge.icon}</span>{badge.text}</div>
            {ruleMenu.length > 1 && (
              <div className="gz-rules" style={{ marginTop: 8 }}>
                {ruleMenu.map((r: any) => (
                  <button key={r.id} type="button" className={`gz-rule ${effRule === r.id ? 'is-sel' : ''}`} onClick={() => setCurRule(r.id)}>
                    <span className="r" /><span className="lbl">{r.label || r.id}</span>{r.status === 'deferred' && <span className="soon">soon</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="lens-cfg-typewrap">
            <span className="lens-type">
              <span className="lens-type-d" style={{ background: meta.color }} />
              {meta.label}
            </span>
            {lens.term && <span className="lens-term">{lens.term}</span>}
          </div>
          <button type="button" className="lens-cfg-x" aria-label="close" onClick={onClose}>×</button>
        </div>

        <div className="lens-cfg-body">
          {/* ① scope — persistent picker (no separate confirm step), hidden for
              story-scoped section gauges where the World block IS the selection */}
          {!(isSection && !needsScope) && (
          <div className={`lens-cfg-scope-step${scopeReady ? ' is-confirmed' : ''}`}>
            <div className="lens-cfg-h"><span className="lens-cfg-num">1</span> Scope</div>

            {/* Binding stepper — shows when this gauge has existing bindings */}
            {hasBindings && !addingNew && (
              <div className="lens-cfg-bind-nav">
                <button type="button" className="wv2-btn wv2-btn-ghost wv2-btn-sm lens-cfg-bind-arrow" disabled={bindingIdx <= 0} onClick={() => goToBinding(bindingIdx - 1)}>←</button>
                <div className="lens-cfg-bind-scopes">
                  {bindings.map((b: any, i: number) => (
                    <button key={i} type="button" className={`lens-cfg-bind-pill${i === bindingIdx ? ' is-active' : ''}`} onClick={() => goToBinding(i)}>
                      {b.scope?.name || 'story'}
                    </button>
                  ))}
                </div>
                <button type="button" className="wv2-btn wv2-btn-ghost wv2-btn-sm lens-cfg-bind-arrow" disabled={bindingIdx >= bindings.length - 1} onClick={() => goToBinding(bindingIdx + 1)}>→</button>
                <button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={startNewScope}>+ New scope</button>
                {onRemoveScope && activeBind && (
                  <button type="button" className="wv2-btn wv2-btn-ghost wv2-btn-sm lens-cfg-scope-rm" title="stop watching this scope (deletes this binding)"
                    onClick={() => {
                      const sn = activeBind.scope?.name || 'story';
                      if (!confirm(`Stop watching this gauge on "${sn}"?`)) return;
                      onRemoveScope(activeBind.chart?.binding_id);
                      onClose();
                    }}>Stop watching</button>
                )}
              </div>
            )}

            {/* Pick a scope (persistent — picking IS confirming) */}
            {(addingNew || !hasBindings) && needsScope ? (
              <>
                <p className="lens-cfg-sub">This gauge watches a <b>{lens.scope_type}</b>. Pick which one.</p>
                <div className="lens-cfg-scope-row">
                  {lens.scope_type === 'relationship' ? (
                    <input className="lens-cfg-scope-input" value={scopeName} onChange={(e) => setScopeName(e.target.value)} placeholder="e.g. Light–L" />
                  ) : scopeCandidates.length > 0 ? (
                    <select className="lens-cfg-scope-select" value={scopeName} onChange={(e) => setScopeName(e.target.value)}>
                      <option value="">— pick {lens.scope_type} —</option>
                      {scopeCandidates.map((nm: any) => <option key={nm} value={nm}>{nm}</option>)}
                    </select>
                  ) : (
                    <input className="lens-cfg-scope-input" value={scopeName} onChange={(e) => setScopeName(e.target.value)} placeholder={`type a ${lens.scope_type} name`} />
                  )}
                  {scopeName && <span className="lens-cfg-scope-check">✓</span>}
                  {hasBindings && (
                    <button type="button" className="wv2-btn wv2-btn-ghost wv2-btn-sm" onClick={() => { setAddingNew(false); goToBinding(0); }}>Cancel</button>
                  )}
                </div>
              </>
            ) : !needsScope && !hasBindings ? (
              <div className="lens-cfg-scope-row">
                <span className="lens-cfg-scope-val">the whole story</span>
                <span className="lens-cfg-scope-check">✓</span>
              </div>
            ) : null}
          </div>
          )}

          <div className="lens-cfg-cols">
          {/* ② what to measure */}
          <div className="lens-cfg-col">
            <div className="lens-cfg-h"><span className="lens-cfg-num">2</span> What are we measuring?</div>

            {isSection ? (
              /* section source — pick which World block backs the scale; its items
                 are read-only here (live-read at analyse, they grow as you edit it). */
              <div className="gz-section-src">
                <p className="lens-cfg-sub">The scale comes from a part of your world — pick which section. It grows as you edit that section.</p>
                <select className="lens-cfg-scope-select" value={blockKey} onChange={(e) => pickBlock(e.target.value)}>
                  <option value="">— pick a World section —</option>
                  {worldBlocks.map((b: any) => (
                    <option key={b.name} value={b.name}>{b.label || b.name}{b.count != null ? ` · ${b.count}` : ''}</option>
                  ))}
                </select>
                {blockKey && (
                  <div className="gz-section-vals">{items.map((it) => it.text).filter(Boolean).join('  ·  ') || '— nothing in that section yet —'}</div>
                )}
                <div className="gz-section-manage">Tracks a World section · <span className="gz-link">Manage on the World page →</span></div>
              </div>
            ) : (
            <>
            <p className="lens-cfg-sub">
              {discrete
                ? 'The places this can be. The engine found these — edit them, or add your own.'
                : 'The steps up the side of the chart. The engine suggested these — edit them, or add your own.'}
            </p>

            <div className="lens-yitems gz-yitems">
              {items.map((it, j) => (
                <div key={j} className={`lens-yrow gz-yrow${it.fresh ? ' is-fresh' : ''}`}>
                  <div className="gz-yrow-main">
                    <span className="lens-grip">⋮⋮</span>
                    <input className="gz-yrow-val" value={it.text} onChange={(e) => editItem(j, e.target.value)} onFocus={() => it.ai && clearAi(j)} />
                    {it.ai && <span className="lens-yrow-ai" title="found in your story">✦</span>}
                    <button type="button" className="lens-yrow-rm" title="remove" onClick={() => removeItem(j)}>×</button>
                  </div>
                  {/* the enrichment — the description IS editable, and shared with the AI */}
                  <input className="gz-yrow-desc" value={it.desc ?? ''} placeholder="what this step means in your story…" onChange={(e) => editItemDesc(j, e.target.value)} />
                </div>
              ))}
            </div>

            <div className="lens-yadd">
              <input value={yinput} placeholder="add your own step…" autoComplete="off" onChange={(e) => setYinput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
              <button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={addItem}>Add</button>
            </div>
            </>
            )}

            {/* the four eyes — the AI's analyse instruction, locked + read-only */}
            <div className="gz-locked-head" title="this is for the engine — you can't edit it">
              <span className="gz-lock">🔒</span>
              <div><b>For the engine:</b> {lens.analyse_head || lens.analyse || lockedHeadFor(lens)}</div>
            </div>

            {!isSection && (
              <>
                <button type="button" className={`wv2-btn lens-extract${extracting ? ' is-loading' : ''}`} disabled={extracting || !projectId || !scopeReady} onClick={handleExtract}>
                  <span className="lens-spark">✦</span>
                  {extracting ? 'Extracting…' : withCost(items.length ? 'Re-extract from my story' : 'Extract from my story', extractCost)}
                </button>
                <p className="lens-cfg-hint">
                  {!projectId ? 'Open a project first to extract from your scenes.'
                    : !scopeReady ? 'Pick the scope above first, then extract.'
                    : 'Reads your scenes and pulls out the scale for this gauge.'}
                </p>
              </>
            )}
          </div>
          </div>

          {/* ③ how it's shown — the chart-visual stepper (Show as) */}
          <div className="gz-cfg-step">
            <div className="lens-cfg-h"><span className="lens-cfg-num">3</span> How it’s shown</div>
            {visMenu.length > 1 ? (
              <div className="gz-vstep">
                <button type="button" className="gz-vstep-arr" disabled={visIdx <= 0} onClick={() => stepVisual(-1)}>‹</button>
                <span className="gz-vstep-lbl">{VISUAL_LABELS[effVisual] || effVisual || '—'}</span>
                <button type="button" className="gz-vstep-arr" disabled={visIdx >= visMenu.length - 1} onClick={() => stepVisual(1)}>›</button>
                <span className="gz-vstep-count">{visIdx + 1} / {visMenu.length}</span>
              </div>
            ) : (
              <p className="lens-cfg-sub">Shown as <b>{VISUAL_LABELS[effVisual] || effVisual || 'its default'}</b>.</p>
            )}
            <div className="gz-cfg-preview"><ChartBody chart={previewChart} scenes={previewScenes} /></div>
          </div>

          {/* ④ how findings are shown — the report-view stepper */}
          {viewMenu.length > 0 && (
            <div className="gz-cfg-step">
              <div className="lens-cfg-h"><span className="lens-cfg-num">4</span> How findings are shown</div>
              {viewMenu.length > 1 ? (
                <div className="gz-vstep">
                  <button type="button" className="gz-vstep-arr" disabled={viewIdx <= 0} onClick={() => stepView(-1)}>‹</button>
                  <span className="gz-vstep-lbl">{VIEW_LABELS[effView] || effView || '—'}</span>
                  <button type="button" className="gz-vstep-arr" disabled={viewIdx >= viewMenu.length - 1} onClick={() => stepView(1)}>›</button>
                  <span className="gz-vstep-count">{viewIdx + 1} / {viewMenu.length}</span>
                </div>
              ) : (
                <p className="lens-cfg-sub">Findings shown as <b>{VIEW_LABELS[effView] || effView}</b>.</p>
              )}
              <ReportViewPreview view={effView} lens={previewLens} />
            </div>
          )}
        </div>

        <div className="lens-cfg-foot">
          <div className="lens-cfg-foot-note">
            {watching
              ? <>You're watching this — tweak the scale and save.</>
              : hasBindings && !addingNew
              ? <>{bindings.length} scope{bindings.length > 1 ? 's' : ''} bound. Click <b>+ New scope</b> to add another.</>
              : <>Set the scale, then start watching — change it anytime.</>}
          </div>
          <div className="lens-cfg-foot-btns">
            <button type="button" className="wv2-btn wv2-btn-ghost" onClick={onClose}>Cancel</button>
            {/* config layer — save the preset (no bind) */}
            <button type="button" className="wv2-btn wv2-btn-subtle" disabled={saving} onClick={onSavePreset}>
              {lens.source === 'preset' || activeBind ? 'Save preset' : 'Save as preset'}
            </button>
            {/* bind layer — unbind this instance (preset survives) */}
            {activeBind && (
              <button type="button" className="wv2-btn wv2-btn-ghost" onClick={onUnbind}>Unbind</button>
            )}
            {/* config + bind, in order */}
            <button type="button" className="wv2-btn wv2-btn-primary" disabled={saving || (needsScope && !scopeReady) || (isSection && !blockKey)} onClick={submit}>
              {saving ? 'Saving…' : activeBind ? 'Save & update' : 'Save & watch'} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
