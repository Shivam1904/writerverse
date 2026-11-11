/**
 * api.ts — the live seam onto the gauge_* caps (3-LAYER REFERENCE MODEL).
 *
 *   templates (shared bank, read-only) + presets (the user's reusable configs)
 *     → bind a template/preset to a scope → an instance (bound chart).
 *
 * Bindings REFERENCE their config (edit a preset → its instances update — NOT a
 * snapshot). Accept ⊥ bind: accepting a suggestion/invention materializes a
 * PRESET (config), it does not bind. Everything is callOp; loose JSON, no REST.
 */
import { callOp } from '../../gateway';

const PAGE = 'Gauges';

const TYPE_BACKEND: Record<string, string> = { arc: 'trajectory', map: 'trajectory', tracker: 'ledger', checklist: 'coverage', setup_payoff: 'dependency' };
const TYPE_KIND: Record<string, string> = { arc: 'feeling', map: 'feeling', tracker: 'tracking', checklist: 'fair-share', setup_payoff: 'loose-end' };

// The verdict-RULE registry (forward-compat) — still drives the rule picker, now
// a LIST (a config can carry several rules; the instance merges their offending).
const _FAMILY_FALLBACK: Record<string, string> = { rising: 'shape', falling: 'shape', flat: 'shape', arc: 'shape', oscillate: 'shape', none: 'none' };
export const RULE_FAMILY_BY_TYPE: Record<string, string> = { arc: 'shape', map: 'shape', tracker: 'constraint', checklist: 'coverage', setup_payoff: 'coverage' };

export function rulesRegistry(shared: any): Record<string, any> {
  const raw = (shared && (shared.rules || shared.math_rules)) || {};
  const out: Record<string, any> = {};
  for (const id of Object.keys(raw)) {
    const r = raw[id] || {};
    out[id] = { id, label: r.label || id, family: r.family || _FAMILY_FALLBACK[id] || 'shape', hint: r.checks || r.demo || '', ordered: r.ordered, status: r.status || 'live' };
  }
  return out;
}

/** The rules a lens type may pick (its family + `none` for arcs/maps). */
export function compatibleRules(typeKey: string, registry: Record<string, any>): any[] {
  const fam = RULE_FAMILY_BY_TYPE[typeKey];
  if (!fam) return [];
  const out = Object.values(registry).filter((r: any) => r.family === fam);
  if (registry.none && (typeKey === 'arc' || typeKey === 'map')) out.push(registry.none);
  return out;
}

const toMeta = (yi: any[]) =>
  (yi || []).map((y: any) => (typeof y === 'string' ? { value: y, description: '' } : { value: y.value, description: y.description || '' }));

function sceneNum(sceneId: any, scenes: any[]): number | null {
  const i = (scenes || []).findIndex((s) => s.id === sceneId);
  return i >= 0 ? i + 1 : null;
}

/** The bind reference for a config lens (template→template, preset→preset). */
export function gaugeRef(lens: any) {
  const kind = lens?.source === 'preset' ? 'preset' : 'template';
  return { kind, id: lens?.preset_id || lens?.id };
}

/** A config (template/preset/suggested/invented) → the bank-card / modal shape. */
export function normalizeLens(l: any): any {
  const type = l.type || l.type_id;
  const y_items_meta = toMeta(l.y_items);
  const id = l.id || l.lens_id;
  return {
    ...l,
    id, lens_id: id,
    source: l.source || 'bank',
    preset_id: l.source === 'preset' ? id : l.preset_id,
    type,
    kind: TYPE_KIND[type] || 'feeling',
    backend: TYPE_BACKEND[type] || 'trajectory',
    verdict_style: l.verdict_style || (l.judges ? 'banner' : 'caption'),
    items: y_items_meta.map((y) => y.value), items_meta: y_items_meta,
    foundational: l.tier === 'core',
    term: l.kind_word,
    ask: l.watches,
    glyph_id: id,
    visual: l.display || (l.visuals || [])[0],
    scope_name: l.scope_name || l.scope?.name,
    scope_label: l.scope_name || l.scope?.name || l.scope_label,
    // l.rules/l.visuals/l.report_views (menus) · l.reason/l.fit (suggested) pass via ...l
  };
}

/** A board chart (an INSTANCE = resolved config + binding + analysis) → FE shape.
 * The WRITE key is now `binding_id` (not lens_id|scope). */
export function normalizeChart(c: any, scenes: any[]): any {
  const type = c.type || c.type_id;
  const backend = TYPE_BACKEND[type] || 'trajectory';
  const verdict_style = c.verdict_style || (c.judges ? 'banner' : 'caption');
  const mode = verdict_style === 'caption' ? 'descriptive' : 'consistency';
  const y_items_meta = toMeta(c.y_items);
  const y_items = y_items_meta.map((y) => y.value);
  const scanned = !!c.analysed_at;
  const deferred = !!c.deferred;
  const rules = Array.isArray(c.rules) ? c.rules : [];
  const offending = Array.isArray(c.offending) ? c.offending
    : (c.verdict && typeof c.verdict === 'object' && Array.isArray(c.verdict.offending) ? c.verdict.offending : []);
  let coverage = c.coverage || [];
  let verdict: any = null;

  if (type === 'setup_payoff') {
    coverage = (c.pairs || []).map((p: any) => ({
      name: p.setup, y_item: p.setup, closed: !!p.paid, covered: !!p.paid,
      evidence: p.payoff || p.evidence || '', payoff_scene: sceneNum(p.scene_id, scenes),
    }));
  }
  // offending[] (any rule) IS the report. deferred / no-rule → no verdict (map).
  if (scanned) {
    if (c.verdict && typeof c.verdict === 'object' && 'ok' in c.verdict) {
      verdict = { score: c.score ?? null, ...c.verdict, offending };
    } else if (deferred || verdict_style === 'caption' || !rules.length) {
      verdict = null;
    } else {
      verdict = { ok: offending.length === 0, score: c.score ?? null, detail: typeof c.verdict === 'string' ? c.verdict : '', offending };
    }
  }

  const scopeName = c.scope?.name || c.scope_name || 'the whole story';
  const refId = c.ref?.id || c.preset_id || c.lens_id || c.id;

  return {
    ...c,
    id: c.binding_id || c.id,           // the WRITE key for every bind-layer cap
    binding_id: c.binding_id || c.id,
    lens_id: refId,
    // the config this instance references — so editing a bound chart updates its
    // preset (not a fresh one). template-bound → 'bank'; preset-bound → 'preset'.
    source: c.source || (c.ref?.kind === 'template' ? 'bank' : 'preset'),
    preset_id: c.ref?.kind === 'preset' ? c.ref.id : c.preset_id,
    backend, verdict_style, mode, deferred,
    type,
    kind: TYPE_KIND[type] || 'feeling',
    scope_label: scopeName,
    glyph_id: refId,
    template_id: refId, chart_def_id: refId,
    visual: c.display,
    report_view: c.report_view,
    y_items, y_items_meta,
    coverage, verdict, offending, rules,
  };
}

// ── reads ────────────────────────────────────────────────────────────────────
/** The gauge board exactly as `get_gauge_board` sends it: every bound chart with its analysis. */
export interface RawGaugeBoard { charts: any[]; scenes: any[] }

/**
 * Fetch the board. This RAW shape is what the shared cache stores
 * (`queries.gaugesBoard`); pages that want the chart-page shape add
 * `select: normalizeBoard` (or use `queries.gaugesBoardView`), so both views
 * come from ONE fetch.
 */
export async function loadRawBoard(projectId: any): Promise<RawGaugeBoard> {
  const r = await callOp(projectId, 'get_gauge_board', {}, PAGE);
  return { charts: r?.charts ?? [], scenes: r?.scenes ?? [] };
}

/** The chart-page view of a raw board: scenes slimmed to {id,label}, charts normalized. */
export function normalizeBoard(raw: RawGaugeBoard): { charts: any[]; scenes: any[] } {
  const scenes = raw.scenes.map((s: any) => ({ id: s.id, label: s.label }));
  const charts = raw.charts.map((c: any) => normalizeChart(c, scenes));
  return { charts, scenes };
}

/** The bindable library is two reads (SA-261):
 *   • the shared CATALOGUE — every bank template + the shared vocab. Static
 *     config, the same for every project → cached once per session
 *     (`queries.gaugeCatalogue`).
 *   • the author's PRESETS — small, per project, restaled by the `gauges` domain
 *     (`queries.gaugesPresets`).
 * `useGaugeBank` (hooks.ts) joins them back into `{ templates, presets, shared }`. */
export async function loadCatalogue(projectId: any): Promise<{ templates: any[]; shared: any }> {
  const r = await callOp(projectId, 'get_gauge_catalogue', {}, PAGE);
  const templates: any[] = [];
  for (const t of r?.types || []) for (const l of t.lenses || []) templates.push(normalizeLens({ ...l, source: l.source || 'bank' }));
  return { templates, shared: r?.shared || {} };
}

export async function loadPresets(projectId: any): Promise<any[]> {
  const r = await callOp(projectId, 'get_gauge_presets', {}, PAGE);
  return (r?.presets || []).map((l: any) => normalizeLens({ ...l, source: l.source || 'preset' }));
}

// Two thin candidate lists (generated, NOT proposals) → feed presets on accept.
export async function loadSuggestions(projectId: any): Promise<any[]> {
  const r = await callOp(projectId, 'get_gauge_suggestions', {}, PAGE);
  const list = Array.isArray(r) ? r : (r?.suggestions || r?.lenses || []);
  return list.map((l: any) => normalizeLens({ ...l, source: 'suggested' }));
}
export async function loadInventions(projectId: any): Promise<any[]> {
  const r = await callOp(projectId, 'get_gauge_inventions', {}, PAGE);
  const list = Array.isArray(r) ? r : (r?.inventions || r?.lenses || []);
  return list.map((l: any) => normalizeLens({ ...l, source: 'invented' }));
}

// ── preset writes (the user's reusable bank — config layer) ──────────────────
// Both author a new preset from a full config (the execute treats the whole args
// dict as the config: `apply_create_preset(config=g)`). `create_preset` is the
// only cap — there is no `save_preset` (savePreset is an alias for the edit→save
// path so call sites read intently).
export const createPreset = (pid: any, config: any) => callOp(pid, 'create_preset', config, PAGE);
export const savePreset = (pid: any, config: any) => callOp(pid, 'create_preset', config, PAGE);
export const updatePreset = (pid: any, presetId: any, patch: any) => callOp(pid, 'update_preset', { preset_id: presetId, ...patch }, PAGE);
export const deletePreset = (pid: any, presetId: any) => callOp(pid, 'delete_preset', { preset_id: presetId }, PAGE);
// accept materializes a PRESET (the list entry stays); dismiss drops it. Not a bind.
export const acceptSuggestion = (pid: any, id: any) => callOp(pid, 'accept_suggestion', { id }, PAGE);
export const acceptInvention = (pid: any, id: any) => callOp(pid, 'accept_invention', { id }, PAGE);
// add a fully-specified invented lens deterministically (the section-lens path) → { id }
export const addInvention = (pid: any, spec: any) => callOp(pid, 'add_invention', spec, PAGE);
export const dismissSuggestion = (pid: any, id: any) => callOp(pid, 'dismiss_suggestion', { id }, PAGE);
export const dismissInvention = (pid: any, id: any) => callOp(pid, 'dismiss_invention', { id }, PAGE);

// ── bind writes (instances — reference a config + a scope + per-binding picks) ─
export const bindGauge = (pid: any, args: any) => callOp(pid, 'bind_gauge', args, PAGE); // {ref,source,scope_name,pair?,block_key?,visual?,report_view?}
export const unbindGauge = (pid: any, bindingId: any) => callOp(pid, 'unbind_gauge', { binding_id: bindingId }, PAGE);
export const updateGauge = (pid: any, bindingId: any, patch: any) => callOp(pid, 'update_gauge', { binding_id: bindingId, ...patch }, PAGE);
export const setGaugeView = (pid: any, bindingId: any, args: { visual?: string; report_view?: string }) => callOp(pid, 'set_gauge_view', { binding_id: bindingId, ...args }, PAGE);
export const analyseGauge = (pid: any, bindingId: any) => callOp(pid, 'analyse_gauge', { binding_id: bindingId }, PAGE);

// "Shape it" — the AI shapes ONE lens from the writer's plain-words ask. READ
// (persists nothing); returns `{ lens }` — a build_preset-ready spec + its scope.
// The caller binds it lazily through the attach box (createPreset normalizes it).
export const inventLensFromAsk = (pid: any, ask: string) => callOp(pid, 'invent_lens_from_ask', { ask }, PAGE);
export const extractGaugeScale = (pid: any, bindingId: any) => callOp(pid, 'extract_gauge_scale', { binding_id: bindingId }, PAGE);
export const suggestGauges = (pid: any) => callOp(pid, 'suggest_gauges', {}, PAGE);
export const suggestCustomGauges = (pid: any) => callOp(pid, 'suggest_custom_gauges', {}, PAGE);
