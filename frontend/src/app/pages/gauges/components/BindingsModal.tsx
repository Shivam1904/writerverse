import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import './config-bind.css';
import { callOp } from '../../../gateway';
import { KINDS } from '../fixtures';
import { bindGauge, unbindGauge, gaugeRef } from '../api';
import { LensGlyph } from './LensGlyph';
import { queries } from '../../../queries';

/**
 * BindingsModal — STEP 2 of the two-step split (temporary scaffold).
 *
 * Completely separate from the config modal. The preset's details sit at the top;
 * under it, the list of ALL bindings (one preset → N bound scopes). The writer
 * adds a binding by picking a scope — a character, the whole story, an item, a
 * relationship, a rule… or a PAIR (two characters, or a character + their sword).
 * Binding REFERENCES the preset's config (edit the preset → every binding follows).
 */
export function BindingsModal({ preset, onClose, onChanged }: any) {
  const { projectId } = useParams();

  const { data: board = { charts: [], scenes: [] } } = useQuery({
    ...queries.gaugesBoardView(projectId),
    enabled: !!projectId && !!preset,
  });

  const [scopeName, setScopeName] = useState('');
  const [pairOn, setPairOn] = useState(false);
  const [pairName, setPairName] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [busy, setBusy] = useState('');

  const scopeType = preset?.scope_type || 'story';
  const needsScope = scopeType && scopeType !== 'story';
  const refId = preset?.preset_id || preset?.id;

  // coverage lenses (checklist / setup→payoff) don't walk an axis at all — they're
  // present-anywhere — so they NEVER pick a thread. Mirror the config modal's
  // isPerTick gate so the two modals agree (config hides walk/tick → binding hides thread).
  const dataStyle = preset?.data_style || (['coverage', 'dependency'].includes(preset?.backend) ? 'coverage' : 'scene_mapped');
  const isPerTick = dataStyle === 'scene_mapped';
  const isThreadWalk = isPerTick && (preset?.axis?.walk === 'thread');
  const [threadRef, setThreadRef] = useState('');
  const [threads, setThreads] = useState<any[]>([]);

  // existing bindings for THIS preset (board charts that reference it)
  const bindings = useMemo(
    () => (board.charts || []).filter((c: any) => (c.preset_id || c.lens_id) === refId),
    [board, refId],
  );

  useEffect(() => {
    if (!preset) return;
    setScopeName(''); setPairOn(false); setPairName(''); setCandidates([]); setThreadRef('');
    if (!projectId) return;
    // the thread pick (x-axis) and the scope pick (subject) are INDEPENDENT — load both.
    if (isThreadWalk) callOp(projectId, 'get_plot_threads').then((r: any) => setThreads(r.plot_threads || [])).catch(() => {});
    if (scopeType === 'character') callOp(projectId, 'get_characters').then((r: any) => setCandidates((r.characters || []).map((c: any) => c.name).filter(Boolean))).catch(() => {});
    else if (scopeType === 'object') callOp(projectId, 'get_items').then((r: any) => setCandidates((r.items || []).map((it: any) => it.name).filter(Boolean))).catch(() => {});
  }, [preset, projectId, scopeType, isThreadWalk]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!preset) return null;
  const meta = KINDS[preset.kind] ?? KINDS.feeling;
  const effScope = needsScope ? scopeName.trim() : 'the whole story';
  // scope (subject) and thread (x-axis) are independent — both must be valid.
  const scopeOk = !needsScope || (!!effScope && (!pairOn || !!pairName.trim()));
  const canAdd = scopeOk && (!isThreadWalk || !!threadRef);

  async function addBinding() {
    if (!canAdd || busy) return;
    setBusy('add');
    try {
      const args: any = {
        ref: gaugeRef(preset),
        source: preset.source === 'preset' ? 'preset' : 'bank',
        scope_type: scopeType,
        scope_name: effScope,                                 // the SUBJECT — never the thread
        pair: pairOn && pairName.trim() ? [effScope, pairName.trim()] : undefined,
        thread_ref: isThreadWalk ? threadRef : undefined,     // the x-axis to walk — additional
      };
      await bindGauge(projectId, args);
      setScopeName(''); setPairOn(false); setPairName(''); setThreadRef('');
      onChanged?.();
    } catch (e) { console.error('bind failed', e); }
    finally { setBusy(''); }
  }
  async function removeBinding(bindingId: any, label: string) {
    if (!bindingId || busy) return;
    if (!confirm(`Stop watching this gauge on "${label}"?`)) return;
    setBusy(bindingId);
    try { await unbindGauge(projectId, bindingId); onChanged?.(); }
    catch (e) { console.error('unbind failed', e); }
    finally { setBusy(''); }
  }

  // scope picker — type-aware (select for known candidates, text otherwise)
  const scopeInput = (value: string, set: (v: string) => void, placeholder: string) =>
    candidates.length > 0 ? (
      <select className="gz2-scope-select" value={value} onChange={(e) => set(e.target.value)}>
        <option value="">— pick a {scopeType} —</option>
        {candidates.map((nm) => <option key={nm} value={nm}>{nm}</option>)}
      </select>
    ) : (
      <input className="gz2-scope-input" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
    );

  return (
    <div className="gz2-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gz2-modal gz2-bind" role="dialog" aria-modal="true">
        {/* preset summary at the top */}
        <div className="gz2-head">
          <div className="gz2-head-main gz2-bind-summary">
            <LensGlyph id={preset.glyph_id || preset.id} kind={preset.kind || 'feeling'} />
            <div>
              <div className="gz2-kicker"><span className="gz2-step-dot">2</span> Bindings · which scopes to watch</div>
              <div className="gz2-bind-nm">{preset.name || preset.label}</div>
              <div className="gz2-bind-meta">
                <span className="gz2-type-chip"><span className="gz2-type-d" style={{ background: meta.color }} />{meta.label}</span>
                <span className="gz2-muted">watches {scopeType === 'story' ? 'the whole story' : `a ${scopeType}`}</span>
                {Array.isArray(preset.items) && preset.items.length > 0 && <span className="gz2-muted">· {preset.items.length} steps</span>}
                {preset.rule && <span className="gz2-muted">· {preset.rule}</span>}
              </div>
            </div>
          </div>
          <button type="button" className="gz2-x" aria-label="close" onClick={onClose}>×</button>
        </div>

        <div className="gz2-body">
          {/* the list of all bindings under this preset */}
          <section className="gz2-sec">
            <div className="gz2-sec-h">Bound scopes <span className="gz2-muted">· {bindings.length}</span></div>
            {bindings.length ? (
              <div className="gz2-bindlist">
                {bindings.map((b: any) => {
                  const label = b.scope?.name || b.scope_label || 'the whole story';
                  return (
                    <div key={b.binding_id || b.id} className="gz2-bindrow">
                      <div className="gz2-bindrow-main">
                        <span className="gz2-bindrow-scope">{label}</span>
                        <span className="gz2-bindrow-sub">
                          {b.scope?.type || scopeType}
                          {b.visual && ` · ${b.visual}`}
                          {b.analysed_at ? ' · scanned' : ' · not scanned'}
                        </span>
                      </div>
                      <button type="button" className="wv2-btn wv2-btn-ghost wv2-btn-sm" disabled={busy === (b.binding_id || b.id)}
                        onClick={() => removeBinding(b.binding_id || b.id, label)}>Unbind</button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="gz2-hint">No scopes bound yet — add the first one below.</p>
            )}
          </section>

          {/* add a binding */}
          <section className="gz2-sec gz2-addbind">
            <div className="gz2-sec-h">Add a binding</div>
            {needsScope ? (
              <>
                <div className="gz2-scope-row">
                  <span className="gz2-scope-lbl">{scopeType}</span>
                  {scopeInput(scopeName, setScopeName, `type a ${scopeType} name`)}
                </div>
                {/* a scope can be a PAIR — two characters, or a character + an item */}
                <label className="gz2-pair-toggle">
                  <input type="checkbox" checked={pairOn} onChange={(e) => setPairOn(e.target.checked)} />
                  pair it with a second thing (e.g. two characters, or a character + their sword)
                </label>
                {pairOn && (
                  <div className="gz2-scope-row">
                    <span className="gz2-scope-lbl">paired with</span>
                    {scopeInput(pairName, setPairName, 'the second thing')}
                  </div>
                )}
              </>
            ) : (
              <p className="gz2-hint">This gauge watches the whole story — one binding covers it.</p>
            )}
            {/* a thread walk also picks a thread for the x-axis — INDEPENDENT of the
                scope above. The AI still judges the scope; the thread only supplies
                the ticks ("for this subject, score each item of this thread"). */}
            {isThreadWalk && (
              <div className="gz2-scope-row">
                <span className="gz2-scope-lbl">thread</span>
                <select className="gz2-scope-select" value={threadRef} onChange={(e) => setThreadRef(e.target.value)}>
                  <option value="">— pick a thread to walk —</option>
                  {threads.map((t: any) => <option key={t.id} value={t.id}>{t.title || t.id}</option>)}
                </select>
              </div>
            )}
            <button type="button" className="wv2-btn wv2-btn-primary wv2-btn-sm" disabled={!canAdd || !!busy} onClick={addBinding}>
              {busy === 'add' ? 'Binding…' : '+ Bind this scope'}
            </button>
          </section>
        </div>

        <div className="gz2-foot">
          <span className="gz2-foot-note">One preset, many bindings. Editing the preset updates every binding.</span>
          <div className="gz2-foot-btns">
            <button type="button" className="wv2-btn wv2-btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
