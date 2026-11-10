/* lensLibrary.ts — the lens type meta + per-page init packs.
 *
 * The card text (name / type / desc / walk) is copied verbatim from the design
 * handoff; each pack item also carries the REAL gauge template id it binds, so
 * a card shows the design's words but attaches a live lens. Pages with no
 * attached lenses fall back to their pack — a curated set at the page's level
 * plus a taste of the next level up. */

export type LensTypeKey = 'arc' | 'map' | 'checklist' | 'payoff' | 'tracker';
export type WalkKey = 'thread' | 'outline' | 'chapter';
/** Which PAGE the lens surface lives on — NOT a scope. Scopes live in lensKit/scope.ts. */
export type Where = 'character' | 'threads' | 'outline' | 'chapters';

/* type meta — glyph + the --lens-* token names (from the design's LENS_TYPE). */
export const LENS_TYPE: Record<LensTypeKey, { label: string; glyph: string; color: string; wash: string }> = {
  arc: { label: 'arc', glyph: '◠', color: 'var(--lens-purple)', wash: 'var(--lens-purple-wash)' },
  map: { label: 'map', glyph: '▦', color: '#5f86bf', wash: '#e9eef7' },
  checklist: { label: 'checklist', glyph: '✓', color: 'var(--lens-green-deep)', wash: 'var(--lens-green-wash)' },
  payoff: { label: 'setup-payoff', glyph: '⇄', color: 'var(--lens-gold)', wash: 'var(--lens-gold-wash)' },
  tracker: { label: 'tracker', glyph: '≡', color: '#5f86bf', wash: '#e9eef7' },
};

/* real archetype (template type_id) → the design's type key. */
export const ARCHETYPE_TO_TYPE: Record<string, LensTypeKey> = {
  arc: 'arc', map: 'map', checklist: 'checklist', setup_payoff: 'payoff', tracker: 'tracker',
};

/* rule id → "how to read this chart" copy. Mirrors the backend rule registry
 * (actions/config/gauges/_shared.yml `rules`: each rule's `label` + `checks`);
 * keep in sync if a rule is added there. Drives the verdict box's reading caption
 * so the author knows what the chart is asking and how to judge it. */
export const RULE_READING: Record<string, { label: string; checks: string }> = {
  rising:        { label: 'Should climb',       checks: 'values trend up across scenes' },
  falling:       { label: 'Should fall',        checks: 'values trend down' },
  flat:          { label: 'Should hold steady', checks: 'barely moves across the story' },
  arc:           { label: 'Rise then fall',     checks: 'one peak across the story' },
  oscillate:     { label: 'Should swing',       checks: 'regular up / down swings' },
  monotone_up:   { label: 'Only grows',         checks: 'never moves down (e.g. knowledge only grows)' },
  monotone_down: { label: 'Only worsens',       checks: 'never improves on its own' },
  single_occupancy: { label: 'One at a time',   checks: 'exactly one holder per scene' },
  no_jump:       { label: 'No impossible jump', checks: 'no teleport between adjacent scenes' },
  cover_once:    { label: 'Each once',          checks: 'each appears at most once' },
  cover_all:     { label: 'All present',        checks: 'each appears somewhere in the text' },
  cover_in_order:{ label: 'In order',           checks: 'they appear in their listed order' },
  none:          { label: 'No right answer',    checks: 'the shape is read, not judged' },
};

/** The "how to read this" line for a chart: its first live rule (or, if none is
 *  live, the first configured non-`none` rule) → its reading copy. A chart with
 *  no rule at all reads as a map ("no right answer"). */
export function chartReading(chart: any): { label: string; checks: string } {
  const rid: string =
    (chart?.rules_applied || [])[0]
    || (chart?.rules || []).find((r: string) => r && r !== 'none')
    || 'none';
  return RULE_READING[rid] || RULE_READING.none;
}

/* walk → the analysis axis + its human label. LEGACY named-walks (thread/outline/
 * chapter) — the attach engine (attach.ts) still binds via these. NOTE: 'chapter'
 * here is NOT a walk; it's the outline walk at chapter tick. The REAL walk model is
 * WALK_TICKS below; new code should use that. */
export const WALKS: Record<WalkKey, { axis: { walk: string; tick: string }; label: string }> = {
  thread: { axis: { walk: 'thread', tick: 'beat' }, label: 'thread walk' },
  outline: { axis: { walk: 'outline', tick: 'scene' }, label: 'outline walk' },
  chapter: { axis: { walk: 'outline', tick: 'chapter' }, label: 'outline · chapter' },
};

/* The REAL walk model (AXIS.md), mirroring backend `_shared.yml` walks: each walk +
 * its allowed ticks (the granularity menu) + default tick. A binding's axis is
 * {walk, tick}; the tick is cyclable within the walk's allowed set. `story` reads
 * prose (provider deferred — analysis falls back to outline ticks for now). */
export type RealWalk = 'story' | 'outline' | 'thread';
export const WALK_TICKS: Record<RealWalk, { label: string; ticks: string[]; default: string }> = {
  story: { label: 'prose walk', ticks: ['scene', 'chapter'], default: 'scene' },
  outline: { label: 'outline walk', ticks: ['act', 'chapter', 'scene', 'heading', 'beat'], default: 'scene' },
  thread: { label: 'thread walk', ticks: ['heading', 'beat'], default: 'beat' },
};

/** A live binding of a lens on the page — what walk + scope + thread it reads. */
export interface LensBinding {
  binding_id: string;
  walk: WalkKey;
  scopeType: string;
  scopeName: string;
  threadRef?: string;
  threadName?: string;
  /** the raw gauge-board chart this binding produced (for the verdict snapshot) */
  chart?: any;
}

export interface PackLens {
  /** stable key for the card */
  key: string;
  /** real gauge template id to bind (undefined → display-only, not yet attachable) */
  templateId?: string;
  name: string;
  type: LensTypeKey;
  walk: WalkKey;
  desc: string;
}

/* The hardcoded design-card catalogue (the `L` map + PAGE_PACKS + LIBRARY_COUNT)
 * was deleted 2026-06-24. Lenses now come ONLY from the backend: the bank
 * (useLensCatalogue) + the section bank (useSectionLensCatalogue). The page lens
 * boards source the bank, scope-filtered (see lensKit/select.ts useLensesFor). */
