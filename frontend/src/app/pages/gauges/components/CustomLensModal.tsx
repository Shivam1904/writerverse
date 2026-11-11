import { useState } from 'react';
import { Lock, ChevronRight, Plus, X, Sparkles } from 'lucide-react';
import { LensGlyph } from './LensGlyph';
import { ChartBody } from './ChartBody';
import { buildExampleChart, SYNTH_SCENES } from './sample';
import { compatibleRules } from '../api';
import { useGaugeRules } from '../hooks';

/**
 * CustomLensModal (Surface C) — create a lens, per type. Step 0 picks the FORM;
 * step 1 shows that type's fields (real-example placeholders), the 🔒 locked AI
 * head read-only, a math-rule radio (arcs), and a LIVE ghosted preview through
 * the same visual registry as the real chart. On Create it hands a custom lens
 * back to the bank (the `user` source).
 */

// `display` = the backend type key (create_custom_gauge resolves the archetype
// from it). No report type on the backend → custom report isn't creatable yet.
const FORMS: any[] = [
  { kind: 'arc', tax: 'feeling', backend: 'trajectory', display: 'ladder_line', verdict_style: 'banner', kindWord: 'an arc', glyph: 'redemption_arc', one: 'rises or falls across the story', judge: 'judges' },
  { kind: 'map', tax: 'feeling', backend: 'trajectory', display: 'contour_line', verdict_style: 'caption', kindWord: 'a map', glyph: 'scene_mood', one: 'just see it, no right answer', judge: 'no verdict' },
  { kind: 'tracker', tax: 'tracking', backend: 'ledger', display: 'state_lanes', verdict_style: 'banner', kindWord: 'a tracker', glyph: 'item_custody', one: 'a state that changes scene to scene', judge: 'judges' },
  { kind: 'checklist', tax: 'fair-share', backend: 'coverage', display: 'checklist', verdict_style: 'banner', kindWord: 'a checklist', glyph: 'three_act', one: 'things that should each appear', judge: 'judges' },
  { kind: 'setup_payoff', tax: 'loose-end', backend: 'dependency', display: 'payoff_arcs', verdict_style: 'banner', kindWord: 'a setup → payoff', glyph: 'chekhov', one: 'every setup should pay off', judge: 'judges' },
];

const LOCKED_HEAD: any = {
  arc: 'We score each scene on your steps, in order, lowest to highest.',
  map: 'We label each scene with one of your levels — we don’t judge it.',
  tracker: 'We pick one state per scene, then check your rule holds.',
  checklist: 'We check whether each thing appears somewhere in the story.',
  setup_payoff: 'We find each setup and check it pays off later.',
  report: 'We scan for matches and list them — no chart.',
};

function RowsEditor({ rows, setRows, label, addLabel }: any) {
  const set = (i: number, key: string, v: string) => setRows(rows.map((r: any, k: number) => (k === i ? { ...r, [key]: v } : r)));
  return (
    <div className="gz-field">
      <label>{label}</label>
      <div className="gz-scale">
        {rows.map((r: any, i: number) => (
          <div className="gz-scale-row" key={i}>
            <input className="gz-input vinput" value={r.value} placeholder="name" onChange={(e) => set(i, 'value', e.target.value)} />
            <input className="gz-input dinput" value={r.description} placeholder="what it means in your story" onChange={(e) => set(i, 'description', e.target.value)} />
            <button type="button" className="rm" onClick={() => setRows(rows.filter((_: any, k: number) => k !== i))}><X size={14} /></button>
          </div>
        ))}
        <button type="button" className="wv2-btn wv2-btn-ghost wv2-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setRows([...rows, { value: '', description: '' }])}>
          <Plus size={13} /> {addLabel}
        </button>
      </div>
    </div>
  );
}

export function CustomLensModal({ onClose, onCreate }: any) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const [watches, setWatches] = useState('');
  const [rule, setRule] = useState('rising');
  const [invariant, setInvariant] = useState('');
  const [lookFor, setLookFor] = useState('');
  const [setupBody, setSetupBody] = useState('');
  const [analyseBody, setAnalyseBody] = useState('');
  const [rows, setRows] = useState<any[]>([{ value: '', description: '' }, { value: '', description: '' }]);

  const form = FORMS.find((f) => f.kind === kind);
  const filled = rows.filter((r) => r.value);

  // The verdict-RULE menu for this type (registry-driven, compatibility-gated).
  const registry = useGaugeRules();
  const compat = form ? compatibleRules(kind, registry) : [];
  const pickedRule = compat.some((r: any) => r.id === rule) ? rule : (compat[0]?.id || 'none');

  const previewLens = form && {
    id: 'preview', name: name || 'New gauge', kind: form.tax, kind_word: form.kindWord, backend: form.backend, verdict_style: form.verdict_style,
    rule: pickedRule, math_rule: kind === 'arc' ? pickedRule : undefined,
    invariant: kind === 'tracker' ? (registry[pickedRule]?.hint || invariant) : undefined, look_for: kind === 'map' ? lookFor : undefined,
    items: filled.map((r) => r.value), items_meta: filled,
  };

  // The create_preset config (story-scope this pass — no scope picker yet). type +
  // a rules LIST (scope_name/visual are binding-level picks, not config).
  const create = () => onCreate({
    type: form.kind,
    display: form.display,
    name,
    watches: watches || undefined,
    scope_type: 'story',
    y_items: filled.map((r) => ({ value: r.value, description: r.description || '' })),
    rules: pickedRule && pickedRule !== 'none' ? [pickedRule] : [],
    invariant: kind === 'tracker' ? (registry[pickedRule]?.hint || invariant || undefined) : undefined,
    look_for: kind === 'map' ? (lookFor || undefined) : undefined,
    analyse_body: analyseBody || undefined,
    extract_body: setupBody || undefined,
  });

  return (
    <div className="lens-cfg-scrim gz-custom-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gz-custom" role="dialog" aria-modal="true">
        <div className="gz-custom-head">
          <div>
            <div className="gz-sheet-eyebrow">Create a custom gauge</div>
            <div className="gz-custom-title">{step === 0 ? 'What shape fits what you want to watch?' : (name || 'New gauge')}</div>
          </div>
          <button type="button" className="lens-cfg-x" onClick={onClose} aria-label="close">×</button>
        </div>

        <div className="gz-custom-body">
          {step === 0 ? (
            <div className="gz-forms">
              {FORMS.map((f) => (
                <button key={f.kind} type="button" className={`gz-form-opt gz-k-${f.kind} ${kind === f.kind ? 'is-sel' : ''}`} onClick={() => setKind(f.kind)}>
                  <span className="gz-form-glyph"><LensGlyph id={f.glyph} kind={f.tax} /></span>
                  <span className="gz-form-txt"><span className="t">{f.kindWord}</span><span className="d">{f.one}</span></span>
                  <span className="j">{f.judge}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="gz-custom-grid">
              <div className="gz-custom-fields">
                <div className="gz-field">
                  <label>Name it</label>
                  <input className="gz-input" value={name} placeholder={kind === 'tracker' ? 'Who Has the Knife' : 'Faith Tested'} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="gz-field">
                  <label>What does it watch?</label>
                  <input className="gz-input" value={watches} placeholder={kind === 'tracker' ? 'who’s holding the murder weapon each scene' : 'whether her faith erodes as the cult tightens'} onChange={(e) => setWatches(e.target.value)} />
                </div>

                {kind === 'tracker' && compat.length === 0 && (
                  <div className="gz-field"><label>The rule that should hold</label>
                    <input className="gz-input" value={invariant} placeholder="only one person can hold it at a time, and it can’t teleport" onChange={(e) => setInvariant(e.target.value)} /></div>
                )}
                {kind === 'map' && (
                  <div className="gz-field"><label>What should you watch for?</label>
                    <input className="gz-input" value={lookFor} placeholder="long flat patches mean the dread’s gone slack" onChange={(e) => setLookFor(e.target.value)} /></div>
                )}

                {(kind === 'arc' || kind === 'map' || kind === 'tracker' || kind === 'checklist') && (
                  <RowsEditor rows={rows} setRows={setRows}
                    label={kind === 'tracker' ? 'The states it can be in' : kind === 'checklist' ? 'The things that should appear' : kind === 'map' ? 'The levels (low → high)' : 'The steps (lowest → highest)'}
                    addLabel={kind === 'checklist' ? 'Add a thing' : kind === 'tracker' ? 'Add a state' : 'Add a step'} />
                )}
                {kind === 'setup_payoff' && (
                  <div className="gz-field"><label>What counts as a setup → payoff?</label>
                    <textarea className="gz-textarea" value={setupBody} placeholder="a planted thing/fact → the later scene that uses or resolves it" onChange={(e) => setSetupBody(e.target.value)} /></div>
                )}
                {kind === 'report' && (
                  <div className="gz-field"><label>What should it find?</label>
                    <textarea className="gz-textarea" value={setupBody} placeholder="facts that contradict each other across scenes" onChange={(e) => setSetupBody(e.target.value)} /></div>
                )}

                {compat.length > 0 && (
                  <div className="gz-field">
                    <label>{kind === 'arc' ? 'Want a verdict? How should it move' : kind === 'tracker' ? 'The rule that must hold' : 'What should it check?'}</label>
                    <div className="gz-rules">
                      {compat.map((m: any) => (
                        <button key={m.id} type="button" className={`gz-rule ${pickedRule === m.id ? 'is-sel' : ''}`} onClick={() => setRule(m.id)}>
                          <span className="r" /><span className="lbl">{m.label}</span>{m.hint && <span className="demo">— {m.hint}</span>}{m.status === 'deferred' && <span className="soon">soon</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="gz-field">
                  <label>Anything specific for the engine?</label>
                  <textarea className="gz-textarea" value={analyseBody} placeholder={kind === 'arc' ? 'judge actions, not what she says she believes' : 'read the atmosphere, not just what characters say'} onChange={(e) => setAnalyseBody(e.target.value)} />
                  <div className="gz-locked-head"><span className="gz-lock"><Lock size={12} /></span><div><b>For the engine:</b> {LOCKED_HEAD[kind]}</div></div>
                </div>
              </div>

              <div className="gz-custom-preview">
                <div className="gz-decide-label">Preview <span className="gz-decide-ex">example, updates as you type</span></div>
                <div className="gz-decide-example"><ChartBody chart={buildExampleChart(previewLens)} scenes={SYNTH_SCENES} /></div>
              </div>
            </div>
          )}
        </div>

        <div className="gz-custom-foot">
          {step === 0 ? (
            <>
              <span />
              <button type="button" className="wv2-btn wv2-btn-primary" disabled={!kind} onClick={() => setStep(1)}>Next <ChevronRight size={14} /></button>
            </>
          ) : (
            <>
              <button type="button" className="wv2-btn wv2-btn-ghost" onClick={() => setStep(0)}>Back</button>
              <button type="button" className="wv2-btn wv2-btn-primary" disabled={!name} onClick={create}><Sparkles size={13} /> Create gauge</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
