/**
 * Gauges — the data seam for the new route. FORKED from the lenses + charts-view
 * data layers and ENRICHED with the meaning layer (y-item descriptions, the
 * four-eyes copy, plain-words verdicts, per-chart invariants). Richer LOOSE
 * interfaces (descriptive, optional, no strict backend contract — dev phase).
 *
 * Today this is STUBBED (no backend) so the real components render the enriched
 * design. Swap the loaders/mutations for the `gauge_*` capabilities later — the
 * field names are the seam. The components import the SAME names the originals
 * did (bindLens/unbindLens/updateChartConfig/ChartInstance/…) so the fork drops
 * in unchanged.
 */

// ── types (richer loose interfaces) ─────────────────────────────────────────

/** One step on a scale — the ONE surface the writer AND the AI share. */
export interface YItem {
  value: string;
  description?: string;   // what this step means in THIS story (the enrichment)
  ai?: boolean;           // surfaced/edited by the engine
}

export interface ChartScene { id: string; label: string }

export interface DataPoint {
  scene_id: string;
  value: string | null;
  reasoning?: string | null;   // why the engine tagged this scene so (evidence)
}

export interface ShapeVerdict {
  rule: string;
  ok: boolean;
  score: number | null;
  detail: string;
  explanation?: string | null;
}

export interface CoverageRow {
  y_item: string;
  description?: string;
  covered: boolean;
  evidence?: string | null;
}

/** A setup→payoff pair (dependency / paired-arcs form). */
export interface Pair {
  name: string;
  setup_scene: number;
  payoff_scene: number | null;
  closed: boolean;
}

/** The four-eyes meaning layer — authored per audience, kept SEPARATE. */
export interface Eyes {
  user?: { kind_word?: string; watches?: string; read_as?: string; look_for?: string; good?: string; off?: string; invariant?: string; direction?: string };
  ai?: { analyse_head?: string; analyse_body?: string; extract_head?: string };
  designer?: { glyph?: string; verdict_style?: 'banner' | 'caption'; empty_state?: string };
}

/**
 * A populated chart on the Charts page. Superset of the old ChartInstance —
 * every new field is OPTIONAL so the original renderers keep working while the
 * enrichment (descriptions, invariant, read_as, verdict_style) layers on top.
 */
export interface ChartInstance {
  id: string;
  template_id: string;
  chart_def_id: string;
  label: string;
  backend: 'trajectory' | 'coverage' | 'ledger' | 'dependency' | 'report';
  mode: 'consistency' | 'descriptive';
  scope: { type: string; name: string };
  kind?: string;              // KINDS taxonomy key (glyph tint)
  kind_word?: string;         // "an arc"
  glyph_id?: string;          // resolves the bespoke per-lens mark
  scope_label?: string;       // friendly scope (header) — NEVER a slug
  y_items: string[];          // kept as strings for the render math
  y_items_meta?: YItem[];     // the enrichment — value + description, aligned to y_items
  y_items_source?: string;
  math_rule?: string | null;
  math_rule_explain?: string | null;
  direction?: string;         // plain words, e.g. "stuck → changed"
  verdict_style?: 'banner' | 'caption';
  read_as?: string;           // "what a wobble means" — the praised line
  look_for?: string;          // map caption
  invariant?: string;         // tracker rule, in plain words (NOT hardcoded)
  data_points: DataPoint[];
  coverage: any[];            // CoverageRow[] | Pair[] (dependency)
  missing_count?: number | null;
  shape?: ShapeVerdict | null;
  verdict?: any;
  visual?: string;            // the per-binding visual pick (overrides the default)
  visual_default?: string;    // per-lens default override of the type's visuals[0]
  visuals?: string[];         // served "Show as ▾" menu
  findings?: any[];           // report form — [{title, clash, evidence:[{scene,text}]}]
  analysed_at?: string | null;
  // the unified contract (every list + the board)
  lens_id?: string;
  source?: 'bank' | 'mine' | 'suggested' | 'invented';
  proposal_id?: number;
  type_id?: string;
  data_style?: string;
  rule?: string;
  rules?: any[];              // served verdict menu [{id,label,status}]
  report_view?: string;
  report_views?: string[];
  block_key?: string | null;
  deferred?: boolean;
  offending?: any[];          // the report — [{scene_id, detail}]
  score?: number | null;
}

export interface ChartsData { charts: ChartInstance[]; scenes: ChartScene[] }

/** A lens in the bank — superset of the old lens shape + the meaning layer. */
export interface Gauge {
  id: string;
  name: string;
  kind: string;               // feeling | tracking | loose-end | fair-share (KINDS)
  kind_word?: string;         // "an arc" — plain, never a code category
  term?: string;              // the textbook term tag
  ask?: string;               // the plain-language question
  why?: string;               // why it fits
  watches?: string;           // the meaning-layer one-liner
  read_as?: string; look_for?: string; good?: string; off?: string; invariant?: string; direction?: string;
  scope_type?: string;
  scope_name?: string;
  scope_label?: string;
  y_items_source?: string;
  math_rule?: string;
  math_rule_explain?: string;
  mode?: 'continuous' | 'discrete' | 'descriptive';
  display?: string;
  backend?: string;
  verdict_style?: 'banner' | 'caption';
  visual_default?: string;    // per-lens default override of the type's visuals[0]
  foundational?: boolean;     // a "start here" lens
  suggested?: boolean;        // surfaced by run_suggest_templates as a fit
  source?: 'bank' | 'mine' | 'suggested' | 'invented' | 'special' | 'custom';
  // the unified contract fields (bank-shaped across all four sources)
  lens_id?: string;
  proposal_id?: number;
  type_id?: string;
  data_style?: string;
  rule?: string;
  rules?: any[];              // served verdict menu [{id,label,status}]
  report_view?: string;
  report_views?: string[];
  visuals?: string[];
  block_key?: string | null;
  tier?: string;
  pack?: string;
  items?: string[];           // y_item labels (modal contract)
  items_meta?: YItem[];       // value + description (the editor enrichment)
  shape?: number[];
  actual?: number[];
  eyes?: Eyes;
  state?: string | null;      // 'watching' | 'pro' | null
}

export interface BankData {
  special: Gauge[];
  relevant: Gauge[];
  catalogue: Gauge[];
  selections: any[];
  charts: any[];
  elementsReady: boolean;
}

export const EMPTY_CHARTS: ChartsData = { charts: [], scenes: [] };
export const EMPTY_LENSES: BankData = { special: [], relevant: [], catalogue: [], selections: [], charts: [], elementsReady: true };

// ── helpers ─────────────────────────────────────────────────────────────────

/** Zip a chart's y_items (strings) with their descriptions, for hover/legend. */
export function descFor(chart: { y_items_meta?: YItem[] }, value: string): string | undefined {
  return chart.y_items_meta?.find((y) => y.value.toLowerCase() === value.toLowerCase())?.description;
}

const meta = (rows: [string, string][]): YItem[] => rows.map(([value, description]) => ({ value, description, ai: true }));
const vals = (rows: [string, string][]): string[] => rows.map(([v]) => v);

const SCENES: ChartScene[] = Array.from({ length: 10 }, (_, i) => ({ id: `sc-${i + 1}`, label: `Scene ${i + 1}` }));
const dp = (vals: (string | null)[], why: (string | null)[] = []): DataPoint[] =>
  vals.map((value, i) => ({ scene_id: `sc-${i + 1}`, value, reasoning: why[i] ?? null }));

// ── the scales (shared by bank cards + charts) ──────────────────────────────
const HERO: [string, string][] = [
  ['stuck', 'The old self, unchanged; the flaw fully in charge.'],
  ['stirring', 'A first crack — she glimpses she might be wrong.'],
  ['trying', 'Actively working against the flaw, slipping sometimes.'],
  ['changed', 'The new self holds, even under pressure.'],
];
const TENSION: [string, string][] = [
  ['calm', 'Little at stake.'],
  ['building', 'Pressure rising.'],
  ['high', 'Serious stakes, fast events.'],
  ['breaking', 'Climactic, maximum pressure.'],
];
const MOOD: [string, string][] = [
  ['bleak', 'Despairing, cold, hopeless.'],
  ['sombre', 'Heavy, subdued, melancholy.'],
  ['neutral', 'Even, matter-of-fact.'],
  ['warm', 'Hopeful, tender, bright.'],
  ['radiant', 'Joyful, soaring.'],
];
const VOICE: [string, string][] = [
  ['plain', 'Flat, unmarked register.'],
  ['measured', 'Composed, controlled.'],
  ['vivid', 'Colourful, expressive.'],
  ['florid', 'Ornate, heightened.'],
];
const AGENCY: [string, string][] = [
  ['passive', 'Things happen TO them; they don’t act.'],
  ['reactive', 'Responds, doesn’t initiate.'],
  ['deciding', 'Makes choices that matter.'],
  ['driving', 'Sets the events of the scene in motion.'],
];
const CUSTODY: [string, string][] = [
  ['Mara', 'Holds the postcards first.'],
  ['Dale', 'Takes them mid-story.'],
  ['lost', 'Nobody — mislaid or hidden.'],
];
const PLACES: [string, string][] = [
  ['the harbour', 'Where it begins.'],
  ['the city', 'The middle stretch.'],
  ['the ridge', 'The climb to the climax.'],
];
const KNOWS: [string, string][] = [
  ['unaware', 'Has no idea.'],
  ['suspects', 'Senses something’s off, can’t name it.'],
  ['knows', 'In full possession of the secret.'],
];
const SKELETON: [string, string][] = [
  ['Hook', 'A reason to keep reading in the first pages.'],
  ['Inciting incident', 'The event that kicks off the story.'],
  ['Midpoint turn', 'A shift that raises the stakes.'],
  ['Crisis / low point', 'All seems lost.'],
  ['Climax', 'The final confrontation.'],
];
const GENRE: [string, string][] = [
  ['A central question early', 'Posed in the opening.'],
  ['Clues planted fairly', 'The reader could solve it.'],
  ['Investigation drives the plot', 'Not coincidence.'],
  ['A twist that recontextualises', 'Re-reads the earlier scenes.'],
  ['A solution that’s earned', 'Pays off the clues.'],
];
const ARCBEATS: [string, string][] = [
  ['The lie', 'What they wrongly believe at the start.'],
  ['The want', 'The external goal they chase.'],
  ['The need', 'What they actually have to learn.'],
  ['The truth', 'The moment they see clearly.'],
  ['The change', 'They act on the truth, for good.'],
];
const GUILT: [string, string][] = [
  ['buried', 'Won’t let herself think of it.'],
  ['leaking', 'It slips out in small tells.'],
  ['confronting', 'She faces it directly.'],
  ['owned', 'She says it aloud and acts on it.'],
];

// ── BANK (lens cards) ───────────────────────────────────────────────────────
export const BANK_LENSES: Gauge[] = [
  // ARCS · feeling
  { id: 'hero_growth', name: 'Does the Hero Grow?', kind: 'feeling', kind_word: 'an arc', term: 'Character arc', foundational: true, state: 'watching',
    scope_type: 'character', scope_label: 'Mara', y_items_source: 'predefined', math_rule: 'rising', mode: 'continuous', backend: 'trajectory', verdict_style: 'banner',
    ask: 'Does your protagonist actually change?', why: 'Most first drafts stall a hero in place — this catches it.',
    watches: 'Whether the protagonist changes across the story.', direction: 'stuck → changed',
    good: 'The line climbs steadily toward changed.', off: 'It stalls or never moves — the growth isn’t landing.',
    read_as: 'A dip = a scene where she backslides — check it’s earned.', items: vals(HERO), items_meta: meta(HERO) },
  { id: 'tension_curve', name: 'Tension Curve', kind: 'feeling', kind_word: 'an arc', term: 'Dramatic tension', foundational: true, state: 'watching',
    scope_type: 'story', scope_label: 'the whole story', y_items_source: 'predefined', math_rule: 'arc', mode: 'descriptive', backend: 'trajectory', verdict_style: 'caption',
    ask: 'Does it build to a climax, then ease?', why: 'A flat or early-peaking tension line is the commonest pacing miss.',
    watches: 'Whether overall tension builds to a climax, then releases.', direction: 'rise then fall — one strong peak',
    look_for: 'Look for one strong peak near the end, not an early spike or a flat line. (A verdict for this shape is coming soon.)', items: vals(TENSION), items_meta: meta(TENSION) },
  { id: 'voice_holds', name: 'Voice Holds', kind: 'feeling', kind_word: 'an arc', term: 'Voice consistency',
    scope_type: 'character', scope_label: 'Dale', y_items_source: 'predefined', math_rule: 'flat', mode: 'continuous', backend: 'trajectory', verdict_style: 'banner',
    ask: 'Do they sound like themselves throughout?', why: 'Voice drift makes a character feel like two different people.',
    watches: 'Whether a character’s voice stays consistent instead of drifting.', direction: 'holds — should stay level',
    good: 'The register stays steady across the story.', off: 'It drifts — they sound like a different person by the end.',
    read_as: 'Big swings = the voice is wandering. A deliberate shift, or an inconsistency?', items: vals(VOICE), items_meta: meta(VOICE) },
  // MAPS · feeling (descriptive)
  { id: 'mood_map', name: 'Mood Map', kind: 'feeling', kind_word: 'a map', term: 'Emotional shape', state: 'watching',
    scope_type: 'story', scope_label: 'the whole story', y_items_source: 'predefined', mode: 'descriptive', backend: 'trajectory', verdict_style: 'caption',
    ask: 'What’s the emotional colour of each scene?', why: 'Surfaces monotone stretches and whiplash swings.',
    watches: 'The emotional colour of each scene, start to finish.',
    look_for: 'Watch for long flat stretches (monotone) or whiplash swings between adjacent scenes.', items: vals(MOOD), items_meta: meta(MOOD) },
  { id: 'whos_driving', name: 'Who’s Driving', kind: 'feeling', kind_word: 'a map', term: 'Agency', suggested: true,
    scope_type: 'character', scope_label: 'Mara', y_items_source: 'predefined', mode: 'descriptive', backend: 'trajectory', verdict_style: 'caption',
    ask: 'Is the hero active or passive?', why: 'A passive protagonist gets dragged through their own story.',
    watches: 'How much this character drives events vs. gets carried by them.',
    look_for: 'A protagonist sitting at passive for long stretches is being dragged through their own story.', items: vals(AGENCY), items_meta: meta(AGENCY) },
  // TRACKERS · tracking (ledger)
  { id: 'key_object', name: 'The Key Object', kind: 'tracking', kind_word: 'a tracker', term: 'Object continuity', state: 'watching',
    scope_type: 'object', scope_label: 'the postcards', y_items_source: 'section', mode: 'discrete', backend: 'ledger', verdict_style: 'banner',
    ask: 'Who’s holding it, scene to scene?', why: 'Objects teleport between hands more often than you’d think.',
    watches: 'Who is holding this object in each scene.',
    invariant: 'One holder at a time — it can’t be in two hands at once, and it can’t teleport between people.',
    good: 'A clean chain of hand-offs, one holder at a time.', off: 'Two holders in a scene, or it jumps owners with no hand-off.',
    items: vals(CUSTODY), items_meta: meta(CUSTODY) },
  { id: 'whos_where', name: 'Who’s Where', kind: 'tracking', kind_word: 'a tracker', term: 'Location continuity',
    scope_type: 'character', scope_label: 'Mara', y_items_source: 'section', mode: 'discrete', backend: 'ledger', verdict_style: 'banner',
    ask: 'Where is each character, scene to scene?', why: 'Catches characters in two places at once.',
    watches: 'Which place this character is in, scene by scene.',
    invariant: 'One place per scene — and no impossible jumps between consecutive scenes.', items: vals(PLACES), items_meta: meta(PLACES) },
  { id: 'who_knows', name: 'Who Knows the Secret', kind: 'tracking', kind_word: 'a tracker', term: 'Dramatic irony', suggested: true,
    scope_type: 'story', scope_label: 'the whole story', y_items_source: 'extracted', mode: 'discrete', backend: 'ledger', verdict_style: 'banner',
    ask: 'Who knows what, and when?', why: 'Track reveals so no one un-knows a secret.',
    watches: 'How much a character knows about a key secret, scene by scene.',
    visual_default: 'step_line',   // ordered states (unaware→suspects→knows) read better as a step-line
    invariant: 'Knowledge only grows — once they know, they can’t un-know it.', items: vals(KNOWS), items_meta: meta(KNOWS) },
  // CHECKLISTS · fair-share (coverage)
  { id: 'story_skeleton', name: 'Story Skeleton', kind: 'fair-share', kind_word: 'a checklist', term: 'Three-act structure', foundational: true, state: 'watching',
    scope_type: 'story', scope_label: 'the whole story', y_items_source: 'predefined', mode: 'continuous', backend: 'coverage', verdict_style: 'banner',
    ask: 'Are the structural beats all there?', why: 'The fastest way to turn a pile of ideas into a shaped story.',
    watches: 'The three-act backbone — the beats that turn ideas into a shaped story.',
    visual_default: 'beats_timeline',
    read_as: 'A missing beat is a hole to fill, not a failure.', items: vals(SKELETON), items_meta: meta(SKELETON) },
  { id: 'genre_promise', name: 'Genre Promise', kind: 'fair-share', kind_word: 'a checklist', term: 'Genre conventions',
    scope_type: 'story', scope_label: 'the whole story', y_items_source: 'predefined', mode: 'continuous', backend: 'coverage', verdict_style: 'banner',
    ask: 'Did you deliver what the genre promises?', why: 'Missing a convention risks a reader let-down.',
    watches: 'Whether you deliver what your genre’s readers expect.', items: vals(GENRE), items_meta: meta(GENRE) },
  { id: 'character_arc_beats', name: 'Character Arc Beats', kind: 'fair-share', kind_word: 'a checklist', term: 'Lie→truth arc', suggested: true,
    scope_type: 'character', scope_label: 'Mara', y_items_source: 'predefined', mode: 'continuous', backend: 'coverage', verdict_style: 'banner',
    ask: 'Does the arc hit its beats?', why: 'An arc is a sequence: lie → want → need → truth → change.',
    watches: 'Whether the protagonist’s arc lands each of its beats.', items: vals(ARCBEATS), items_meta: meta(ARCBEATS) },
  // LOOSE ENDS · loose-end (dependency / paired arcs)
  { id: 'loose_ends', name: 'Loose Ends', kind: 'loose-end', kind_word: 'a setup → payoff', term: 'Chekhov’s gun', foundational: true, state: 'watching',
    scope_type: 'story', scope_label: 'the whole story', y_items_source: 'extracted', mode: 'continuous', backend: 'dependency', verdict_style: 'banner',
    ask: 'Did everything you set up pay off?', why: 'Every plant should fire — or be deliberately left open.',
    watches: 'Whether everything you plant pays off (Chekhov’s gun).',
    read_as: 'Each setup should pay off — or be deliberately left open. The hanging ones are named.' },
  // REPORTS · report (non-chart list form)
  { id: 'continuity_check', name: 'Continuity Check', kind: 'report', kind_word: 'a report', term: 'continuity', state: 'watching',
    scope_type: 'story', scope_label: 'the whole story', y_items_source: 'extracted', mode: 'continuous', backend: 'report', verdict_style: 'banner',
    ask: 'Do any facts contradict each other?', why: 'Catches the “empty gun fires” class of slip.',
    watches: 'Lines across scenes that can’t both be true — contradictions and continuity slips.',
    read_as: 'Each pair is two lines that clash — pick which to fix.' },
];

// Bespoke lenses the engine INVENTS from your premise (run_suggest_special_charts).
// Stub placeholders — the backend will replace these; the ✦ glyph resolves from
// the `special:` id prefix.
export const SPECIAL_LENSES: Gauge[] = [
  { id: 'special:maras_guilt', name: 'Mara’s Buried Guilt', kind: 'feeling', kind_word: 'an arc', term: 'bespoke', source: 'special',
    scope_type: 'character', scope_label: 'Mara', y_items_source: 'predefined', math_rule: 'rising', mode: 'continuous', backend: 'trajectory', verdict_style: 'banner',
    ask: 'Does her guilt surface, or stay buried?', why: 'Invented from your premise — the postcards she never sent.',
    watches: 'How close Mara comes to admitting what she did, scene by scene.',
    read_as: 'A dip = she re-buries it — fine if it costs her later.', items: vals(GUILT), items_meta: meta(GUILT) },
];

// ── BOUND charts (populated, on the Charts page) ────────────────────────────
export const BOUND_CHARTS: ChartInstance[] = [
  { id: 'hero_growth', template_id: 'hero_growth', chart_def_id: 'hero_growth', label: 'Does the Hero Grow?', backend: 'trajectory', mode: 'consistency',
    scope: { type: 'character', name: 'Mara' }, scope_label: 'Mara', kind: 'feeling', kind_word: 'an arc', glyph_id: 'redemption_arc',
    y_items: vals(HERO), y_items_meta: meta(HERO), y_items_source: 'predefined', math_rule: 'rising', direction: 'stuck → changed', verdict_style: 'banner',
    read_as: 'A dip = a scene where she backslides — check it’s earned.',
    data_points: dp(
      ['stuck', 'stuck', 'stirring', 'stirring', 'trying', 'stirring', 'trying', 'trying', 'changed', 'changed'],
      ['Refuses the call, blames everyone else.', 'Still digging in.', 'A doubt she can’t shake.', 'Tests a new way, quietly.', 'Owns a mistake out loud.', 'Panics and reverts under pressure.', 'Tries again, steadier.', 'Holds the new line.', 'Acts on it when it costs her.', 'The change holds under fire.']),
    coverage: [], analysed_at: '2026-06-01',
    shape: { rule: 'rising', ok: true, score: 0.92, detail: 'Climbs steadily toward changed; one dip at scene 6.', explanation: 'A backslide at the midpoint, then recovers.' } },

  // hero_growth, a SECOND scope (Dale) — same lens, different bound scope. Stalls.
  { id: 'hero_growth:dale', template_id: 'hero_growth', chart_def_id: 'hero_growth', label: 'Does the Hero Grow?', backend: 'trajectory', mode: 'consistency',
    scope: { type: 'character', name: 'Dale' }, scope_label: 'Dale', kind: 'feeling', kind_word: 'an arc', glyph_id: 'redemption_arc',
    y_items: vals(HERO), y_items_meta: meta(HERO), y_items_source: 'predefined', math_rule: 'rising', direction: 'stuck → changed', verdict_style: 'banner',
    read_as: 'A flat line = no growth — is that the point, or a gap?',
    data_points: dp(['stuck', 'stuck', 'stirring', 'stuck', 'stirring', 'stirring', 'stuck', 'stirring', 'stirring', 'stuck'],
      ['Set in his ways.', 'Digs in.', 'A flicker of doubt.', 'Reverts.', 'Tries again.', 'Slips.', 'Old habits.', 'Another flicker.', 'Wavers.', 'No real change.']),
    coverage: [], analysed_at: '2026-06-01',
    shape: { rule: 'rising', ok: false, score: 0.31, detail: 'Never climbs — Dale stalls at stirring the whole way.', explanation: 'A flat arc; the growth never lands.' } },

  { id: 'tension_curve', template_id: 'tension_curve', chart_def_id: 'tension_curve', label: 'Tension Curve', backend: 'trajectory', mode: 'descriptive',
    scope: { type: 'story', name: 'the whole story' }, scope_label: 'the whole story', kind: 'feeling', kind_word: 'an arc', glyph_id: 'tension_arc',
    y_items: vals(TENSION), y_items_meta: meta(TENSION), y_items_source: 'predefined', math_rule: 'arc', verdict_style: 'caption',
    look_for: 'Look for one strong peak near the climax, not an early spike or a flat line. (A verdict for the rise-then-fall shape is coming soon.)',
    data_points: dp(['calm', 'calm', 'building', 'building', 'high', 'high', 'high', 'breaking', 'breaking', 'building']),
    coverage: [], analysed_at: '2026-06-01' },

  { id: 'mood_map', template_id: 'mood_map', chart_def_id: 'mood_map', label: 'Mood Map', backend: 'trajectory', mode: 'descriptive',
    scope: { type: 'story', name: 'the whole story' }, scope_label: 'the whole story', kind: 'feeling', kind_word: 'a map', glyph_id: 'scene_mood',
    y_items: vals(MOOD), y_items_meta: meta(MOOD), y_items_source: 'predefined', verdict_style: 'caption',
    look_for: 'Watch for long flat stretches (monotone) or whiplash swings between adjacent scenes.',
    data_points: dp(['warm', 'neutral', 'sombre', 'sombre', 'bleak', 'bleak', 'neutral', 'warm', 'radiant', 'neutral']),
    coverage: [], analysed_at: '2026-06-01' },

  { id: 'key_object', template_id: 'key_object', chart_def_id: 'key_object', label: 'The Key Object', backend: 'ledger', mode: 'consistency',
    scope: { type: 'object', name: 'the postcards' }, scope_label: 'the postcards', kind: 'tracking', kind_word: 'a tracker', glyph_id: 'item_custody',
    y_items: vals(CUSTODY), y_items_meta: meta(CUSTODY), y_items_source: 'section', verdict_style: 'banner',
    invariant: 'One holder at a time — no two hands, no teleport.',
    data_points: dp(['Mara', 'Mara', 'Mara', 'Dale', 'Dale', 'Dale', 'Dale', 'lost', 'lost', 'Dale']),
    coverage: [], analysed_at: '2026-06-01',
    verdict: { ok: false, detail: 'The postcards jump back to Dale in scene 10 after going missing — no hand-off on the page.' } },

  { id: 'story_skeleton', template_id: 'story_skeleton', chart_def_id: 'story_skeleton', label: 'Story Skeleton', backend: 'coverage', mode: 'consistency',
    scope: { type: 'story', name: 'the whole story' }, scope_label: 'the whole story', kind: 'fair-share', kind_word: 'a checklist', glyph_id: 'three_act',
    y_items: vals(SKELETON), y_items_meta: meta(SKELETON), y_items_source: 'predefined', verdict_style: 'banner',
    visual_default: 'beats_timeline',   // keep OUR columnar as the default; ticked-list + ring are a switch away
    read_as: 'A missing beat is a hole to fill, not a failure.',
    data_points: [], analysed_at: '2026-06-01',
    coverage: [
      { y_item: 'Hook', description: SKELETON[0][1], covered: true, evidence: 'sc-1' },
      { y_item: 'Inciting incident', description: SKELETON[1][1], covered: true, evidence: 'sc-2' },
      { y_item: 'Midpoint turn', description: SKELETON[2][1], covered: true, evidence: 'sc-5' },
      { y_item: 'Crisis / low point', description: SKELETON[3][1], covered: true, evidence: 'sc-8' },
      { y_item: 'Climax', description: SKELETON[4][1], covered: false, evidence: null },
    ],
    missing_count: 1 },

  { id: 'loose_ends', template_id: 'loose_ends', chart_def_id: 'loose_ends', label: 'Loose Ends', backend: 'dependency', mode: 'consistency',
    scope: { type: 'story', name: 'the whole story' }, scope_label: 'the whole story', kind: 'loose-end', kind_word: 'a setup → payoff', glyph_id: 'chekhov',
    y_items: [], y_items_source: 'extracted', verdict_style: 'banner',
    read_as: 'Each setup should pay off — or be deliberately left open.',
    data_points: [], analysed_at: '2026-06-01',
    coverage: [
      { name: 'the locket', setup_scene: 1, payoff_scene: 8, closed: true },
      { name: 'the scar', setup_scene: 2, payoff_scene: 9, closed: true },
      { name: 'the unsent postcards', setup_scene: 3, payoff_scene: null, closed: false },
      { name: '“is mom alive?”', setup_scene: 4, payoff_scene: null, closed: false },
    ],
    missing_count: 2 },

  // REPORT (non-chart form) — a list of contradictions, no plot. The "display is
  // open" point made concrete. Findings come from a pass over the story.
  { id: 'continuity_check', template_id: 'continuity_check', chart_def_id: 'continuity_check', label: 'Continuity Check', backend: 'report', mode: 'consistency',
    scope: { type: 'story', name: 'the whole story' }, scope_label: 'the whole story', kind: 'report', kind_word: 'a report', glyph_id: 'continuity_check',
    y_items: [], y_items_source: 'extracted', verdict_style: 'banner', visual: 'report',
    read_as: 'Each pair is two lines that can’t both be true — pick which scene to fix.',
    data_points: [], coverage: [], analysed_at: '2026-06-01',
    findings: [
      { title: 'The gun', clash: 'conflict', evidence: [{ scene: 3, text: 'the chamber is empty' }, { scene: 7, text: 'she fires it at the door' }] },
      { title: 'Mara’s age', clash: 'conflict', evidence: [{ scene: 1, text: 'twenty-two' }, { scene: 9, text: 'almost thirty, weeks later' }] },
    ],
    verdict: { ok: false, count: 2, detail: 'Two pairs of lines that can’t both be true.' } },
];

// Bound scopes (selections) — the modal keys off these for the per-scope stepper.
// Shape matches the engine's binding row: {template, scope:{type,name}, charts}.
// `hero_growth` has TWO scopes (Mara, Dale) to exercise the stepper.
export const SELECTIONS: any[] = [
  { template: 'hero_growth', scope: { type: 'character', name: 'Mara' }, charts: ['hero_growth'] },
  { template: 'hero_growth', scope: { type: 'character', name: 'Dale' }, charts: ['hero_growth'] },
  { template: 'tension_curve', scope: { type: 'story', name: 'the whole story' }, charts: ['tension_curve'] },
  { template: 'mood_map', scope: { type: 'story', name: 'the whole story' }, charts: ['mood_map'] },
  { template: 'key_object', scope: { type: 'object', name: 'the postcards' }, charts: ['key_object'] },
  { template: 'story_skeleton', scope: { type: 'story', name: 'the whole story' }, charts: ['story_skeleton'] },
  { template: 'loose_ends', scope: { type: 'story', name: 'the whole story' }, charts: ['loose_ends'] },
  { template: 'continuity_check', scope: { type: 'story', name: 'the whole story' }, charts: ['continuity_check'] },
];

/** The single binding for a chart's scope — what the Charts page edit passes. */
export function bindingForChart(chart: any): any[] {
  return [{ template: chart.template_id, scope: chart.scope, charts: [chart.chart_def_id] }];
}

// ── loaders + (stub) mutations ──────────────────────────────────────────────
export async function loadGaugeBank(_projectId?: string): Promise<BankData> {
  const relevant = BANK_LENSES.filter((l) => l.foundational);
  const catalogue = BANK_LENSES.filter((l) => !l.foundational);
  return { special: [], relevant, catalogue, selections: [], charts: [], elementsReady: true };
}

export async function loadGaugeCharts(_projectId?: string): Promise<ChartsData> {
  return { charts: BOUND_CHARTS, scenes: SCENES };
}

// stub mutations — keep the original component imports resolving; no network.
// Loose args (the originals take projectId/lens/selections/opts); we no-op.
export async function bindLens(..._args: any[]): Promise<boolean> { return true; }
export async function unbindLens(..._args: any[]): Promise<boolean> { return true; }
export async function updateChartConfig(..._args: any[]): Promise<void> { /* stub */ }

// Type-level chart-visual menus (archetype.visuals), default first — canonical
// IDS (match the config). The user's pick is a runtime per-binding value, never
// in the template; the renderer keys on the id. New visual = add to the menu +
// register a renderer (open set).
export const VISUALS_MENU: Record<string, string[]> = {
  arc: ['ladder_line', 'line_with_ideal', 'gauge'],
  map: ['contour_line', 'bars', 'heat_strip'],
  tracker: ['state_lanes', 'state_cells', 'step_line', 'transition_list'],
  checklist: ['checklist', 'progress_ring', 'beats_timeline'],
  setup_payoff: ['payoff_arcs', 'planted_paid_board', 'hanging_list'],
  report: ['report'],
};
export const VISUAL_LABELS: Record<string, string> = {
  ladder_line: 'ladder line', line_with_ideal: 'line + ideal', gauge: 'gauge',
  contour_line: 'contour line', bars: 'bars', heat_strip: 'heat-strip',
  state_lanes: 'lanes', state_cells: 'cells', step_line: 'step-line', transition_list: 'transition list',
  checklist: 'ticked list', progress_ring: 'progress ring', beats_timeline: 'beats timeline',
  payoff_arcs: 'linked arcs', planted_paid_board: 'planted/paid board', hanging_list: 'hanging list',
  report: 'list',
};
// The math-rule catalogue (from _shared.yml) — the optional verdict a custom arc
// can pick. rising/falling/flat are live; arc/oscillate demoable, verdict deferred.
export const MATH_RULES: any[] = [
  { id: 'rising', label: 'should climb', demo: 'low → high, steadily', live: true },
  { id: 'falling', label: 'should fall', demo: 'high → low, steadily', live: true },
  { id: 'flat', label: 'should hold steady', demo: 'stays level', live: true },
  { id: 'arc', label: 'should rise then fall', demo: 'climbs to a peak, then eases', live: false },
  { id: 'oscillate', label: 'should swing', demo: 'up and down, repeatedly', live: false },
  { id: 'none', label: 'no verdict — just a map', demo: 'the line is read, not judged', live: true },
];

// The x-axis ("what it walks") menu — per AXIS.md. A scene_mapped gauge tags one
// value per TICK; `walk` picks the corpus + the text the AI reads, `tick` the
// granularity (tick options depend on walk). FE source of truth for now; later
// swapped to the backend-served `shared.walks` (like useGaugeRules reads
// shared.rules). Default {outline, scene} = today's behaviour (beats-fed).
export const WALKS: Record<string, { label: string; ticks: string[]; default: string }> = {
  story: { label: 'the whole story', ticks: ['scene'], default: 'scene' },
  outline: { label: 'the outline', ticks: ['act', 'chapter', 'scene', 'heading', 'beat'], default: 'scene' },
  thread: { label: 'a thread', ticks: ['heading', 'beat'], default: 'beat' },
};
export const WALK_ORDER = ['story', 'outline', 'thread'];
export const TICK_LABELS: Record<string, string> = {
  act: 'act', chapter: 'chapter', scene: 'scene', heading: 'heading', beat: 'beat',
};

/** The one-line "what the AI reads" hint for a (walk, tick) choice. */
export function walkHint(walk: string, tick: string): string {
  if (walk === 'story') return 'the story, one tick per scene — reads each scene’s prose';
  if (walk === 'thread') return `a thread, one tick per ${tick} — pick which thread when you bind`;
  if (tick === 'beat') return 'the outline, one tick per beat — reads each beat';
  return `the outline, one tick per ${tick} — reads the beats under each ${tick}`;
}

// Which visuals actually have a renderer today (open set). Every menu entry is
// now built, so the "Show as ▾" switch is real for every type.
export const IMPLEMENTED_VISUALS = new Set([
  'ladder_line', 'line_with_ideal', 'gauge',
  'contour_line', 'bars', 'heat_strip',
  'state_lanes', 'state_cells', 'step_line', 'transition_list',
  'checklist', 'progress_ring', 'beats_timeline',
  'payoff_arcs', 'planted_paid_board', 'hanging_list',
  'report',
]);

/** The lens's type key (arc/map/tracker/checklist/setup_payoff/report). */
export function typeOf(lens: any): string {
  return lens.backend === 'ledger' ? 'tracker'
    : lens.backend === 'coverage' ? 'checklist'
    : lens.backend === 'dependency' ? 'setup_payoff'
    : lens.backend === 'report' ? 'report'
    : lens.verdict_style === 'caption' ? 'map'
    : 'arc';
}
/** The visual menu for a lens: its type, the default (`[0]`), and the alternates. */
export function visualsFor(lens: any): { type: string; def: string; alts: string[] } {
  const type = typeOf(lens);
  const menu = VISUALS_MENU[type] ?? [];
  return { type, def: menu[0], alts: menu.slice(1) };
}
/** The chart's EFFECTIVE visual: per-binding pick / backend `display` → per-lens
 * default → type default. (The backend already resolves `display`; the FE pick
 * is optimistic until the refetch lands.) */
export function effectiveVisual(chart: any): string {
  return chart.visual || chart.display || chart.visual_default || visualsFor(chart).def;
}
/** The implemented visuals for a chart's type — drives the "Show as ▾" switch.
 * Prefers the backend-served `visuals` menu, falling back to the local map. */
export function visualOptions(chart: any): { id: string; label: string }[] {
  let menu: string[] = (Array.isArray(chart.visuals) && chart.visuals.length ? chart.visuals : VISUALS_MENU[typeOf(chart)]) ?? [];
  // A lens may carry an OLDER served `visuals` list that predates a new visual;
  // ensure the tracker cells view always offers (sits right after lanes).
  if (typeOf(chart) === 'tracker' && !menu.includes('state_cells')) {
    const i = menu.indexOf('state_lanes');
    menu = i >= 0 ? [...menu.slice(0, i + 1), 'state_cells', ...menu.slice(i + 1)] : ['state_cells', ...menu];
  }
  return menu.filter((v) => IMPLEMENTED_VISUALS.has(v)).map((v) => ({ id: v, label: VISUAL_LABELS[v] ?? v }));
}

/** Which lens ids are "watching" — stub keys off the `state` flag. */
export function boundLensIds(data: BankData): Set<string> {
  const ids = new Set<string>();
  for (const l of [...(data.special ?? []), ...(data.relevant ?? []), ...(data.catalogue ?? [])]) {
    if (l.state === 'watching') ids.add(l.id);
  }
  return ids;
}
