import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import './config-bind.css';
import { KINDS } from '../fixtures';
import { savePreset, updatePreset, acceptSuggestion, acceptInvention, compatibleRules, normalizeLens } from '../api';
import { visualOptions, VISUAL_LABELS, typeOf, WALKS, WALK_ORDER, TICK_LABELS, walkHint } from '../data';
import { useGaugeRules } from '../hooks';
import { ConfigPreview } from './ConfigPreview';

/**
 * ConfigPresetModal — the MERGED try-on + configure dialog (one surface).
 *
 * It reads like a richer try-on, not a form: a live chart sits at the centre and
 * its y-items ARE its axis (edited once, in a rail beside it). The chart morphs
 * as you switch the rule (shape + the red "what it catches" marker) and the
 * visual. The first rule is "AI judges" — a free-text instruction instead of a
 * deterministic rule. Heavy knobs fold into Advanced. Saves a CONFIG PRESET;
 * binding (which scopes) is the next step: when the caller passes `onSaved`,
 * Save hands it the saved preset so it can open the BindingsModal; without it
 * Save just closes. `onShowBindings` (existing presets only) jumps straight there.
 */

const VIEW_LABELS: Record<string, string> = {
  inline_markers: 'inline markers', list: 'a list', summary: 'a one-line summary',
  notes: 'notes / observations', breach_flags: 'breach flags',
  missing_list: 'what’s missing', hanging_list: 'what’s still open',
};

const RULE_AI = { id: 'ai', label: '✦ AI judges', hint: 'the engine reads each scene and decides — you tell it what to look for', family: 'ai' };

function lockedHeadFor(lens: any) {
  const b = lens?.backend;
  if (b === 'coverage') return 'We check whether each thing appears somewhere in your story.';
  if (b === 'dependency') return 'We pair each setup with its payoff and flag the unpaid.';
  if (lens?.mode === 'discrete' || b === 'ledger') return 'We pick one state per scene and check your rule holds.';
  return 'We score each scene on your steps, in order, lowest to highest.';
}
function descOfItem(text: string, lens: any) {
  const m = (lens?.items_meta || []).find((x: any) => (x.value || '').toLowerCase() === (text || '').toLowerCase());
  return m?.description || '';
}

export function ConfigPresetModal({ lens, onClose, onDismiss, bindings, onSaved, onShowBindings }: any) {
  const { projectId } = useParams();
  const registry = useGaugeRules();

  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [curRule, setCurRule] = useState('');
  const [curVisual, setCurVisual] = useState('');
  const [curView, setCurView] = useState('');
  const [walk, setWalk] = useState('outline');   // x-axis corpus (AXIS.md); default = today's behaviour
  const [tick, setTick] = useState('scene');      // x-axis granularity, dependent on walk
  const [analyseBody, setAnalyseBody] = useState('');
  const [extractBody, setExtractBody] = useState('');
  const [showExtract, setShowExtract] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState<'' | 'preset' | 'bind'>('');
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (!lens) return;
    setTitle(lens.name || lens.label || '');
    setPurpose(lens.watches || lens.read_as || lens.look_for || '');
    setItems((lens.items || []).map((t: string) => ({ text: t, desc: descOfItem(t, lens), ai: true })));
    const firstRule = Array.isArray(lens.rules) && lens.rules.length
      ? (typeof lens.rules[0] === 'string' ? lens.rules[0] : lens.rules[0]?.id) : '';
    // `lens.rule` may arrive as a LIST (the YAML `rule: [monotone_down]`) — unwrap
    // to the id, else curRule is an array that matches no chip and draws no break.
    const lensRule = Array.isArray(lens.rule) ? lens.rule[0] : lens.rule;
    const lensRuleId = typeof lensRule === 'string' ? lensRule : lensRule?.id;
    setCurRule(lensRuleId || lens.math_rule || firstRule || (lens.verdict_style === 'caption' ? 'none' : 'ai'));
    setCurVisual(lens.visual || lens.display || (lens.visuals || [])[0] || '');
    setCurView(lens.report_view || (lens.report_views || [])[0] || '');
    setWalk(lens.axis?.walk || 'outline');          // non-breaking default = outline/scene
    setTick(lens.axis?.tick || 'scene');
    setAnalyseBody(lens.analyse_body || '');
    setExtractBody(lens.extract_body || '');
    setShowExtract(false);
    setAdvanced(false);
    setSaveError(false);
  }, [lens]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const typeKey = lens?.type || (lens ? typeOf(lens) : '');
  const ruleChips = useMemo(() => [RULE_AI, ...compatibleRules(typeKey, registry)], [registry, typeKey]);
  const viewMenu: string[] = lens?.report_views || [];
  const visMenu = lens ? visualOptions(lens) : [];

  if (!lens) return null;
  const meta = KINDS[lens.kind] ?? KINDS.feeling;
  const isSection = lens.y_items_source === 'section';
  const lockedHead = lens.analyse_head || lockedHeadFor(lens);
  const scopePrompt = lens.scope_prompt || lens.scope_body || '';
  const isAi = curRule === 'ai';
  const catches = lens.off || lens.read_as || lens.invariant || lens.watches || 'where this breaks down';
  const effVisual = curVisual && visMenu.some((o) => o.id === curVisual) ? curVisual : (visMenu[0]?.id || '');
  // per-tick (scene_mapped) lenses get a configurable x-axis; coverage ones (checklist/
  // setup_payoff → backend coverage/dependency) are present-anywhere, so no axis.
  const dataStyle = lens.data_style || (['coverage', 'dependency'].includes(lens.backend) ? 'coverage' : 'scene_mapped');
  const isPerTick = dataStyle === 'scene_mapped';
  const tickMenu = (WALKS[walk]?.ticks) || ['scene'];
  const effTick = tickMenu.includes(tick) ? tick : (WALKS[walk]?.default || 'scene');
  // switching the walk resets the tick to that walk's default if the current one isn't valid
  const pickWalk = (w: string) => { setWalk(w); if (!(WALKS[w]?.ticks || []).includes(tick)) setTick(WALKS[w]?.default || 'scene'); };
  const isCandidate = lens.source === 'suggested' || lens.source === 'invented';
  const hasPreset = lens.source === 'preset' || !!lens.preset_id;
  // when the preset is bound to MORE THAN ONE scope, saving edits the shared
  // config for every one — call that out so it's not a surprise.
  const boundScopes: any[] = bindings || [];
  const multiBound = boundScopes.length > 1;
  const scopeNames = boundScopes.map((s: any) => s?.name).filter(Boolean);

  // y-items editing (single source — the chart axis IS this list)
  const editItem = (i: number, text: string) => setItems((p) => p.map((it, j) => (j === i ? { ...it, text } : it)));
  const editDesc = (i: number, desc: string) => setItems((p) => p.map((it, j) => (j === i ? { ...it, desc } : it)));
  const removeItem = (i: number) => setItems((p) => p.filter((_, j) => j !== i));
  const moveItem = (i: number, dir: number) => setItems((p) => {
    const j = i + dir; if (j < 0 || j >= p.length) return p;
    const next = p.slice(); [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  const onAddStep = (t: string) => setItems((p) => [...p, { text: t, desc: '', ai: false }]);

  function buildConfig() {
    const yItems = items.map((it) => ({ value: it.text, description: it.desc || '' })).filter((y) => y.value);
    return {
      id: lens.source === 'preset' ? (lens.preset_id || lens.id) : undefined,
      source: lens.source,
      type: lens.type,
      scope_type: lens.scope_type || 'story',
      name: title || lens.name,
      watches: purpose,
      read_as: lens.read_as, look_for: lens.look_for,
      good: lens.good, off: lens.off, invariant: lens.invariant, direction: lens.direction,
      y_items: yItems, y_items_source: lens.y_items_source, y_items_hint: lens.y_items_hint,
      analyse_body: analyseBody, extract_body: extractBody,
      rules: isAi || !curRule || curRule === 'none' ? [] : [curRule],
      // x-axis (AXIS.md) — only meaningful for per-tick lenses; saved with the config.
      axis: isPerTick ? { walk, tick: effTick } : undefined,
      visual: effVisual || undefined,
      report_view: curView || undefined,
      visuals: lens.visuals, report_views: lens.report_views,
    };
  }

  async function ensurePreset(config: any): Promise<any> {
    if (lens.source === 'suggested' || lens.source === 'invented') {
      const r: any = lens.source === 'suggested' ? await acceptSuggestion(projectId, lens.id) : await acceptInvention(projectId, lens.id);
      const pid = r?.preset_id;
      // no catch: a failed edit must reach onSavePreset's error, not vanish
      if (pid) await updatePreset(projectId, pid, config);
      return pid;
    }
    if (lens.source === 'preset') {
      await updatePreset(projectId, lens.preset_id || lens.id, config);
      return lens.preset_id || lens.id;
    }
    const r: any = await savePreset(projectId, config);
    return r?.preset_id;
  }

  async function onSavePreset() {
    if (saving) return;
    // changing the config invalidates every binding's analysis (it was scored
    // under the old config). Warn, then wipe (server-side). No auto re-scan: that
    // would run the AI once per binding the author never asked for (SA-270) — each
    // lens shows "not read yet" with its own Scan button.
    const bound = boundScopes.filter((b: any) => b?.binding_id);
    if (bound.length > 0) {
      const n = bound.length, plural = n > 1;
      if (!confirm(`This preset has ${n} binding${plural ? 's' : ''}. Saving resets ${plural ? 'their' : 'its'} config and clears ${plural ? 'their' : 'its'} analysis. Scan ${plural ? 'each one' : 'it'} again when you want a fresh read. Continue?`)) return;
    }
    setSaving('preset');
    setSaveError(false);
    try {
      const config = buildConfig();
      const presetId = await ensurePreset(config);   // updatePreset wipes the bound analyses server-side
      setSaving('');
      // step 2 — hand the saved preset on so the caller can open the bindings.
      if (!onSaved) onClose();
      else if (presetId) onSaved(normalizeLens({ ...lens, ...config, id: presetId, preset_id: presetId, source: 'preset' }));
      else throw new Error('saved preset came back without an id');
    } catch (e) { console.error('save preset failed', e); setSaving(''); setSaveError(true); }
  }

  return (
    <div className="gz2-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gz2-modal gz2-cfg gz2-cfg-wide" role="dialog" aria-modal="true">
        {/* header — title + description (the try-on read) */}
        <div className="gz2-head">
          <div className="gz2-head-main">
            <div className="gz2-kicker"><span className="gz2-step-dot">✦</span> Try on &amp; configure</div>
            <input className="gz2-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="name this gauge" />
            {(lens.desc || lens.ask) && <div className="gz2-cfg-desc">{lens.desc || lens.ask}</div>}
          </div>
          <div className="gz2-head-side">
            <span className="gz2-type-chip"><span className="gz2-type-d" style={{ background: meta.color }} />{meta.label}</span>
            {lens.term && <span className="gz2-term">{lens.term}</span>}
          </div>
          <button type="button" className="gz2-x" aria-label="close" onClick={onClose}>×</button>
        </div>

        <div className="gz2-body gz2-cfg-body">
          {/* shared-preset heads-up — these settings are one config across every binding */}
          {multiBound && (
            <div className="gz2-shared-note" role="note">
              <span className="gz2-shared-ico" aria-hidden>⧉</span>
              <span>
                Shared settings — saving changes this gauge for <b>all {boundScopes.length} places</b> it’s watching
                {scopeNames.length > 0 && <> ({scopeNames.join(', ')})</>}.
              </span>
            </div>
          )}

          {/* what it catches — bold, eye-catching */}
          <div className="gz2-catches">
            <span className="gz2-catches-lbl">Catches</span>
            <span className="gz2-catches-txt">{catches}</span>
          </div>

          {/* the live, editable centerpiece — always shown; empty scales render
              as ghost rungs so it's clear they need filling. */}
          <ConfigPreview lens={{ ...lens, visual: effVisual }} items={items} rule={curRule} visual={effVisual} isSection={isSection}
            onEdit={editItem} onEditDesc={editDesc} onMove={moveItem} onRemove={removeItem} onAdd={onAddStep} />

          {/* extract — returns the scale from the story, via an inline instruction */}
          {!isSection && (
            <div className="gz2-axis-actions">
              <button type="button" className={`wv2-btn wv2-btn-ai wv2-btn-sm${showExtract ? ' is-on' : ''}`} onClick={() => setShowExtract((s) => !s)}>
                <span className="lens-spark">✦</span> Extract from my story
              </button>
            </div>
          )}
          {showExtract && !isSection && (
            <div className="gz2-extract-panel">
              <span className="gz2-flabel"><span className="gz2-ai">✦ extract instruction</span> — what the engine should pull from your scenes</span>
              <textarea className="gz2-ta" rows={2} value={extractBody} onChange={(e) => setExtractBody(e.target.value)} placeholder="e.g. find the distinct emotional states this character moves through…" />
              <span className="gz2-hint">Saved with the preset — the engine runs it to draft these steps when you bind the gauge to a scope.</span>
            </div>
          )}

          {/* what it walks — the x-axis (AXIS.md): walk = corpus + text read, tick = granularity.
              per-tick lenses only; coverage lenses are present-anywhere (no x-axis). */}
          {isPerTick && (
            <div className="gz2-control">
              <div className="gz2-control-h">What it walks <span className="gz2-muted">· the spine it measures along</span></div>
              <div className="gz2-axis-row">
                <span className="gz2-axis-lbl">Walk</span>
                <div className="gz2-chiprow">
                  {WALK_ORDER.map((w) => (
                    <button key={w} type="button" className={`gz2-chip${walk === w ? ' is-sel' : ''}`} onClick={() => pickWalk(w)}>
                      {WALKS[w].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="gz2-axis-row">
                <span className="gz2-axis-lbl">One per</span>
                <div className="gz2-chiprow">
                  {tickMenu.map((tk) => (
                    <button key={tk} type="button" className={`gz2-chip${effTick === tk ? ' is-sel' : ''}`} onClick={() => setTick(tk)}>
                      {TICK_LABELS[tk] || tk}
                    </button>
                  ))}
                </div>
              </div>
              <span className="gz2-hint">{walkHint(walk, effTick)}</span>
            </div>
          )}

          {/* rule & verdict — first chip is AI judges (a text field, not a rule) */}
          <div className="gz2-control">
            <div className="gz2-control-h">Rule &amp; verdict <span className="gz2-muted">· the chart shows what it catches</span></div>
            <div className="gz2-chiprow">
              {ruleChips.map((r: any) => (
                <button key={r.id} type="button" className={`gz2-chip${curRule === r.id ? ' is-sel' : ''}${r.id === 'ai' ? ' gz2-chip-ai' : ''}`} onClick={() => setCurRule(r.id)} title={r.hint || ''}>
                  {r.label || r.id}{r.status === 'deferred' && <span className="gz2-soon">soon</span>}
                </button>
              ))}
            </div>
            {isAi ? (
              <textarea className="gz2-ta" rows={2} value={analyseBody} onChange={(e) => setAnalyseBody(e.target.value)} placeholder="describe what the engine should judge in each scene — e.g. “rate how much the hero owns their mistake, 1–4”" />
            ) : (
              <span className="gz2-hint">{(ruleChips.find((r: any) => r.id === curRule)?.hint) || 'the shape above is what this rule wants — the red marker is a catch'}</span>
            )}
          </div>

          {/* how it's shown — switches the live chart */}
          {visMenu.length > 1 && (
            <div className="gz2-control">
              <div className="gz2-control-h">How it’s shown <span className="gz2-muted">· changes the chart above</span></div>
              <div className="gz2-chiprow">
                {visMenu.map((o) => (
                  <button key={o.id} type="button" className={`gz2-chip${effVisual === o.id ? ' is-sel' : ''}`} onClick={() => setCurVisual(o.id)}>
                    {VISUAL_LABELS[o.id] || o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* advanced — the heavier knobs fold away */}
          <button type="button" className="gz2-adv-toggle" onClick={() => setAdvanced((a) => !a)}>
            {advanced ? '▾' : '▸'} Advanced settings
          </button>
          {advanced && (
            <div className="gz2-adv">
              <label className="gz2-field">
                <span className="gz2-flabel">Purpose <span className="gz2-muted">· what this gauge is for</span></span>
                <textarea className="gz2-ta" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="what this gauge watches, in plain words" />
              </label>
              {!isAi && (
                <label className="gz2-field">
                  <span className="gz2-flabel"><span className="gz2-ai">✦ AI · extra judging guidance</span></span>
                  <textarea className="gz2-ta" rows={2} value={analyseBody} onChange={(e) => setAnalyseBody(e.target.value)} placeholder="anything the engine should keep in mind when it judges each scene…" />
                </label>
              )}
              {viewMenu.length > 0 && (
                <div className="gz2-field">
                  <span className="gz2-flabel">Verdict view <span className="gz2-muted">· how findings read</span></span>
                  <div className="gz2-chiprow">
                    {viewMenu.map((v: string) => (
                      <button key={v} type="button" className={`gz2-chip${curView === v ? ' is-sel' : ''}`} onClick={() => setCurView(v)}>{VIEW_LABELS[v] || v}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="gz2-field">
                <span className="gz2-flabel">🔒 engine reads it like this</span>
                <p className="gz2-readonly">{lockedHead}</p>
              </div>
              {scopePrompt && (
                <div className="gz2-field">
                  <span className="gz2-flabel"><span className="gz2-ai">✦ AI · scope prompt</span></span>
                  <p className="gz2-readonly">{scopePrompt}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* footer — just Save. Bindings are managed separately from the bank card. */}
        <div className="gz2-foot">
          <span className="gz2-foot-note" role={saveError ? 'alert' : undefined}>{saveError ? 'Couldn’t save this gauge. Try again in a moment.' : onSaved ? 'Saves a reusable preset. Next, you choose what it watches.' : 'Saves a reusable preset. Attach it to scopes from the card on the bank.'}</span>
          <div className="gz2-foot-btns">
            {onShowBindings && hasPreset && (
              <button type="button" className="wv2-btn wv2-btn-ghost" onClick={() => onShowBindings(lens)}>Where it watches</button>
            )}
            {isCandidate && onDismiss && (
              <button type="button" className="wv2-btn wv2-btn-ghost" onClick={() => onDismiss(lens)}>Not for me</button>
            )}
            <button type="button" className="wv2-btn wv2-btn-primary" disabled={!!saving} onClick={onSavePreset}>
              {saving === 'preset' ? 'Saving…' : onSaved ? 'Save & continue' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
