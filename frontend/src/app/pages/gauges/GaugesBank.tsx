import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import './lenses.css';
import './charts-view.css';
import './gauges.css';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from './components/SearchBar';
import { LensCard } from './components/LensCard';
import { LensCatalogue } from './components/LensCatalogue';
import { ConfigPresetModal } from './components/ConfigPresetModal';
import { BindingsModal } from './components/BindingsModal';
import { CustomLensModal } from './components/CustomLensModal';
import { loadSuggestions, loadInventions, createPreset, deletePreset, suggestGauges, suggestCustomGauges, dismissSuggestion, dismissInvention } from './api';
import { queries } from '../../queries';
import { useGaugeBank } from './hooks';

/**
 * GaugesBank — the bindable library under the 3-layer model. `get_gauge_catalogue`
 * serves shared TEMPLATES (read-only), `get_gauge_presets` the user's PRESETS
 * (their reusable configs); `useGaugeBank` joins them. Suggested/invented are generated candidate lists that ACCEPT into
 * presets (config layer — not a bind). Sections:
 *   invented · suggested · your presets · start-here spotlight · the full bank.
 */
function FeaturedSection({ spark, title, count, caption, action, lenses, variant, empty, searching, isWatching, onOpen, onBindings, boundScopes, onDelete }: any) {
  return (
    <section className="lens-sec">
      <div className="lens-sec-head">
        {spark && <span className="lens-spark">✦</span>}
        <span className="lens-sec-t">{title}</span>
        {count != null && <span className="lens-sec-c">{count}</span>}
        {action && <span className="gz-sec-action">{action}</span>}
      </div>
      {caption && <p className="lens-cap">{caption}</p>}
      {lenses.length > 0 ? (
        <div className="lens-grid">
          {lenses.map((l: any) => (
            <LensCard key={l.id} lens={l} variant={variant} watching={isWatching(l.id)}
              onOpen={onOpen} onBindings={onBindings} boundScopes={boundScopes} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <p className="lens-sec-empty">{searching ? 'No matches in this section.' : empty}</p>
      )}
    </section>
  );
}

const EMPTY_BOARD = { charts: [] as any[], scenes: [] as any[] };
const EMPTY_LIST: any[] = [];

export function GaugesBank() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const pid = String(projectId);
  const bank = useGaugeBank(projectId);
  const { data: board = EMPTY_BOARD } = useQuery({ ...queries.gaugesBoardView(projectId), enabled: !!projectId });
  const { data: suggestions = EMPTY_LIST } = useQuery({ queryKey: ['gauges', pid, 'suggestions'], queryFn: () => loadSuggestions(projectId), enabled: !!projectId });
  const { data: inventions = EMPTY_LIST } = useQuery({ queryKey: ['gauges', pid, 'inventions'], queryFn: () => loadInventions(projectId), enabled: !!projectId });

  const [query, setQuery] = useState('');
  const [configuring, setConfiguring] = useState<any>(null);   // step 1 · merged try-on + config → preset
  const [bindingPreset, setBindingPreset] = useState<any>(null); // step 2 · preset → bindings
  const [creating, setCreating] = useState(false);
  const [suggesting, setSuggesting] = useState('');

  // derived from the board (which configs are watching + each binding per ref)
  const watchingIds = useMemo(() => new Set((board.charts || []).map((c: any) => c.lens_id)), [board]);
  const boundScopes = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const c of board.charts || []) (m[c.lens_id] ??= []).push({ type: c.scope?.type, name: c.scope?.name });
    return m;
  }, [board]);

  const withState = (arr: any[]) => (arr || []).map((l: any) => ({ ...l, state: watchingIds.has(l.id) ? 'watching' : (l.state ?? null) }));
  const templates = useMemo(() => withState(bank.templates), [bank, watchingIds]);
  const presets = useMemo(() => withState(bank.presets), [bank, watchingIds]);
  const suggested = useMemo(() => withState(suggestions), [suggestions, watchingIds]);
  const invented = useMemo(() => withState(inventions), [inventions, watchingIds]);

  const q = query.trim().toLowerCase();
  const searching = !!q;
  const match = (l: any) => !q || (l.question || '').toLowerCase().includes(q) || (l.name || '').toLowerCase().includes(q) || (l.watches ?? '').toLowerCase().includes(q);
  const catalogue = templates.filter(match);
  const total = templates.length + presets.length + suggested.length + invented.length;
  const watchingCount = watchingIds.size;

  const isWatching = (id: string) => watchingIds.has(id);
  // a click always opens the merged try-on/config; bindings are a separate jump
  // (a button on the card, and a "Show bindings" button inside the config modal).
  const onOpenLens = (lens: any) => setConfiguring(lens);
  const onShowBindings = (lens: any) => { setConfiguring(null); setBindingPreset(lens); };
  // "Not for me" on a suggested/invented card — dismiss the candidate (no bind).
  const onDismiss = async (lens: any) => {
    setConfiguring(null);
    try {
      if (lens?.source === 'suggested') await dismissSuggestion(projectId, lens.id);
      else if (lens?.source === 'invented') await dismissInvention(projectId, lens.id);
    } catch (e) { console.error('dismiss failed', e); }
  };
  // delete a preset (user's own bank only — templates can't be deleted).
  const onDeletePreset = async (lens: any) => {
    if (!lens?.preset_id && lens?.source !== 'preset') return;
    if (!confirm(`Delete the preset "${lens.name}"? (its bound charts go too)`)) return;
    try { await deletePreset(projectId, lens.preset_id || lens.id); } catch (e) { console.error('delete preset failed', e); }
  };
  const runSuggest = async (kind: 'fit' | 'special') => {
    if (suggesting) return;
    setSuggesting(kind);
    try { await (kind === 'special' ? suggestCustomGauges(projectId) : suggestGauges(projectId)); } catch (e) { console.error('suggest failed', e); } finally { setSuggesting(''); }
  };

  const shared = { searching, isWatching, onOpen: onOpenLens, onBindings: onShowBindings, boundScopes };

  return (
    <div className="wv2-page">
      <div className="lens-page lens-nobox gz-bank">
        <PageHeader
          section="gauges"
          eyebrow="Plan · lens bank"
          title="Lens bank"
          suffix={<>· {watchingCount} watching</>}
          caption="Each lens watches one thing about your story and draws it — so you can see the shape, not just feel it."
          actions={
            <>
              {watchingCount > 0 && (
                <button type="button" className="wv2-btn wv2-btn-ghost wv2-btn-sm" onClick={() => navigate(`/project/${pid}/gauges`)}>← Watching</button>
              )}
              <SearchBar value={query} onChange={setQuery} count={total} />
              <button type="button" className="wv2-btn wv2-btn-primary wv2-btn-sm lens-create-btn" onClick={() => setCreating(true)}>
                <span className="lens-spark">✦</span> Create custom
              </button>
            </>
          }
        />

        {/* 1 · your presets — the ONE highlighted tier, pinned to the top */}
        <FeaturedSection
          title="Your presets" count={presets.length || undefined}
          caption="Lenses you’ve saved and tuned — bound ones show where they’re watching."
          action={<button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={() => setCreating(true)}>+ Create</button>}
          lenses={presets.filter(match)} variant="preset" empty="No presets yet — accept a suggestion or build a custom to start your own bank."
          onDelete={onDeletePreset}
          {...shared}
        />

        {/* 2 · invented by the engine — bigger, richer cards (still white) */}
        <FeaturedSection
          spark title="Made for your story" count={invented.length || undefined}
          caption={<>Dreamed up from <i>your premise</i> — try one on, then keep it or pass.</>}
          action={<button type="button" className="wv2-btn wv2-btn-ai wv2-btn-sm" disabled={suggesting === 'special'} onClick={() => runSuggest('special')}><span className="lens-spark">✦</span> {suggesting === 'special' ? 'Inventing…' : 'Invent some'}</button>}
          lenses={invented.filter(match)} variant="invented" empty="Click “Invent some” — bespoke lenses appear here to try on."
          {...shared}
        />

        {/* 3 · suggested template fits — white, only a faint "suggested" mark */}
        <FeaturedSection
          title="Suggested for you" count={suggested.length || undefined}
          caption="Ready-made lenses the engine thinks suit what you’ve written — already scoped."
          action={<button type="button" className="wv2-btn wv2-btn-ai wv2-btn-sm" disabled={suggesting === 'fit'} onClick={() => runSuggest('fit')}><span className="lens-spark">✦</span> {suggesting === 'fit' ? 'Finding…' : 'Find fits'}</button>}
          lenses={suggested.filter(match)} variant="suggested" empty="Click “Find fits” — suggestions appear here to try on."
          {...shared}
        />

        {/* the full template bank — everything white, grouped by kind (start-here flagged inline) */}
        <LensCatalogue catalogue={catalogue} query={query} onOpen={onOpenLens} watching={watchingIds} boundScopes={boundScopes} />

        {/* STEP 1 — try-on + config → preset. Just saves; bindings are managed
            separately from the card's scope label. */}
        <ConfigPresetModal
          lens={configuring}
          bindings={configuring ? (board.charts || []).filter((c: any) => (c.lens_id || c.id) === configuring.id).map((c: any) => ({ binding_id: c.binding_id, type: c.scope?.type, name: c.scope?.name })) : []}
          onClose={() => setConfiguring(null)}
          onDismiss={onDismiss}
        />

        {/* STEP 2 — preset → N bindings (attach scopes). */}
        {bindingPreset && (
          <BindingsModal preset={bindingPreset} onClose={() => setBindingPreset(null)} onChanged={() => {}} />
        )}

        {/* C — the guided custom-create flow (writes a preset, no bind) */}
        {creating && (
          <CustomLensModal
            onClose={() => setCreating(false)}
            onCreate={async (config: any) => {
              try { await createPreset(projectId, config); } catch (e) { console.error('create preset failed', e); }
              setCreating(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
