import { WALK_TICKS, type RealWalk, type Where } from '../lens/lensLibrary';
import { addInvention, acceptInvention, createPreset, bindGauge, extractGaugeScale } from '../../pages/gauges/api';
import { lensYItems, type LensScope } from './resolve';
import type { CatalogueLens } from './catalogue';
import { normScope, normStr, SCOPE_COUNT, SCOPE_LABELS, type ScopeType } from './scope';

/* attach.ts — THE single attach engine. The ONLY module that maps walk→axis,
 * decides what a lens needs, computes attach defaults, and runs the bind chain.
 * Both surfaces (the section lens + the page boards) are thin consumers: they
 * build an AttachContext, read defaults/requirements, render the picker, and call
 * applyAttach. No scope/walk math or bind lives anywhere else. */

const pick = (r: any, k: string) => r?.[k] ?? r?.result?.[k];
const norm = normStr;

/* ── 1. REQUIREMENTS — what a lens needs, from its scope_type. One rule. ── */
export interface LensReq {
  scopeCount: 0 | 1 | 2;
  scopeType: ScopeType;
  label: string;
  walkable: RealWalk[];
}
export function lensReq(lens: CatalogueLens): LensReq {
  const st = normScope(lens.scopeType);
  return {
    scopeCount: SCOPE_COUNT[st],
    scopeType: st,
    label: SCOPE_LABELS[st],
    walkable: Object.keys(WALK_TICKS) as RealWalk[],
  };
}

/* ── 2. CHOICE + CONTEXT — the single selection shape + the surface seam. ── */
export interface ScopeRef { type: ScopeType; name: string }
export interface AttachChoice {
  scope1?: ScopeRef;        // the entity it watches (character / item / …) or story
  scope2?: ScopeRef;        // the SECOND entity, for relationship (two-character) lenses
  walk: RealWalk;           // story · outline · thread (the real walks)
  tick: string;             // the granularity within the walk (WALK_TICKS[walk].ticks)
  thread?: any;             // the thread to walk, when walk === 'thread'
  // ── scale (y_items) setup, from ScaleSetup ──
  blockKey?: string;        // section-source lens: the World block backing the scale (→ bind)
  yItems?: { value: string; description: string }[];  // user/predefined scale → preset config
  extract?: boolean;        // extracted-source: draft the scale from the story after binding
}
export interface AttachContext {
  scope?: LensScope;        // section lens: the ARN-derived node scope (+ thread)
  where?: Where;            // page board: which page
  id?: string;              // page board / section: the in-view entity
  threads?: any[];          // candidate threads (thread walk)
}

/* ── 3. DEFAULTS — the ONE place: (lens + context) → a pre-filled choice. ── */
export function defaultChoice(lens: CatalogueLens, ctx: AttachContext): AttachChoice {
  const req = lensReq(lens);
  const threads = ctx.threads ?? [];

  // walk: a thread node (or the threads page) walks the thread; else the lens's own
  // walk (bank templates carry it) or the outline.
  const walk: RealWalk = ctx.scope?.kind === 'thread' || ctx.where === 'threads'
    ? 'thread'
    : ((lens.raw?.axis?.walk as RealWalk) || 'outline');
  // tick: the lens's own tick if it declares one + it's valid for the walk, else
  // the walk's default granularity.
  const allowed = WALK_TICKS[walk]?.ticks ?? [];
  const rawTick = lens.raw?.axis?.tick as string | undefined;
  const tick = rawTick && allowed.includes(rawTick) ? rawTick : (WALK_TICKS[walk]?.default ?? 'scene');

  // scope 1: story lenses → the whole story; else the node's entity (ARN scope) or
  // the character page's character. Item/location lenses on a page with no entity
  // are left for the user to pick.
  let scope1: ScopeRef | undefined;
  if (req.scopeCount === 0) {
    scope1 = { type: 'story', name: 'the whole story' };
  } else if (ctx.scope) {
    scope1 = ctx.scope.kind === 'thread'
      ? (ctx.scope.owner ? { type: 'character', name: ctx.scope.owner } : undefined)
      : (ctx.scope.name ? { type: ctx.scope.scopeType || 'character', name: ctx.scope.name } : undefined);
  } else if (ctx.where === 'character' && ctx.id) {
    scope1 = { type: 'character', name: ctx.id };
  }

  // thread: the in-view / node thread, else the first candidate.
  let thread: any;
  if (walk === 'thread') {
    thread = (ctx.scope?.kind === 'thread' && ctx.scope.id ? threads.find((t) => t.id === ctx.scope!.id) : undefined)
      || threads.find((t) => norm(t.id) === norm(ctx.id))
      || threads[0];
    if (!scope1 && thread?.scope?.type === 'character' && thread.scope?.name) {
      scope1 = { type: 'character', name: thread.scope.name };
    }
  }

  return { scope1, scope2: undefined, walk, tick, thread };
}

/* ── helpers: build the preset/invent payload from a lens + the chosen axis ── */
const CONFIG_DROP = new Set([
  'id', 'lens_id', 'source', 'preset_id', 'reason', 'fit', 'scope', 'scope_name', 'scope_label',
  'foundational', 'glyph_id', 'kind', 'items', 'items_meta', 'term', 'ask', 'visual',
  'section', 'sub', 'tier', 'isSection', 'reads', 'templateId', 'raw', 'slug',
]);

/** A BANK lens → a preset config (drop instance/scope fields; stamp scope_type + axis). */
function presetConfigFromBank(lens: CatalogueLens, scopeType: string, axis: any): any {
  const r = lens.raw || {};
  const cfg: any = Object.fromEntries(Object.entries(r).filter(([k]) => !CONFIG_DROP.has(k)));
  cfg.type = r.type;
  cfg.scope_type = scopeType;
  cfg.axis = axis;
  cfg.source = 'bank';
  // keep the source bank lens id on the preset so the bound chart carries it back
  // (build_board copies the preset config onto the chart). chartSlug reads
  // template_id → the shelf can mark this lens attached; chartsForNode only treats
  // arn_lens/section_lens as section-pure, so the bank lens still shows on every
  // section of its scope.
  cfg.template_id = lens.slug;
  return cfg;
}

/** A SECTION-pure lens → an invented `arc` consistency-check spec (stamped so the
 *  verdict finder + chartsForNode can recognise it as section-pure). */
function inventSpecFromSection(lens: CatalogueLens, scopeType: string, axis: any): any {
  return {
    name: lens.question, type: 'arc', display: 'ladder_line',
    scope_type: scopeType, y_items_source: 'user', y_items: lensYItems(lens),
    rules: ['flat'], math_rule: 'flat', axis,
    kind_word: 'a consistency check', watches: lens.question, about: lens.description, analyse_body: lens.intent,
    section_lens: { slug: lens.slug }, arn_lens: { slug: lens.slug, scope_kind: scopeType },
  };
}

/* ── 4. EXECUTE — the ONE bind chain (ensure a preset, then bind). ──
 * Attaching is FREE and runs no analysis (SA-270): the lens lands "not read yet"
 * and the author presses its "Read my story" button to run it.
 * The one AI step allowed here is the scale extract, and only when the author
 * pressed its own "Extract from my story" button (choice.extract). */
export async function applyAttach(
  projectId: any,
  lens: CatalogueLens,
  choice: AttachChoice,
): Promise<{ bindingId?: string }> {
  const axis = { walk: choice.walk, tick: choice.tick || WALK_TICKS[choice.walk]?.default || 'scene' };
  const scopeType = choice.scope1?.type || 'story';

  // a binding references a PRESET — section-pure invents one, bank materializes one.
  // The user-set scale (ScaleSetup) overrides the lens's built-in y_items.
  let presetId: string | undefined;
  if (lens.isSection) {
    const spec = inventSpecFromSection(lens, scopeType, axis);
    if (choice.yItems?.length) spec.y_items = choice.yItems;
    const inv = await addInvention(projectId, spec);
    const invId = pick(inv, 'id');
    if (!invId) throw new Error('add_invention returned no id');
    const acc = await acceptInvention(projectId, invId);
    presetId = pick(acc, 'preset_id');
  } else {
    const cfg = presetConfigFromBank(lens, scopeType, axis);
    if (choice.yItems?.length) cfg.y_items = choice.yItems;
    const p = await createPreset(projectId, cfg);
    presetId = pick(p, 'preset_id');
  }
  if (!presetId) throw new Error('attach produced no preset_id');

  const bindArgs: any = {
    ref: { kind: 'preset', id: presetId },
    source: 'preset',
    scope_type: scopeType,
    scope_name: choice.scope1?.name,
  };
  if (choice.walk === 'thread' && choice.thread?.id) bindArgs.thread_ref = choice.thread.id;
  if (choice.scope2?.name) bindArgs.pair = choice.scope2.name; // relationship 2nd (best-effort)
  // section-source lens (y_items_source: 'section') — the scale is a World block;
  // bind needs which one (block_key), else apply_bind rejects it.
  if (choice.blockKey) bindArgs.block_key = choice.blockKey;

  const b = await bindGauge(projectId, bindArgs);
  const bindingId = pick(b, 'binding_id');
  // extracted-source: the author asked to draft the scale from the story.
  if (bindingId && choice.extract) {
    try { await extractGaugeScale(projectId, bindingId); }
    catch (e) { console.error('[lens] extract-scale failed:', e); }
  }
  return { bindingId };
}
