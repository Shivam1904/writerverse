/**
 * sample.ts — synthesize a clearly-EXAMPLE chart from a lens (no real scan data).
 * Shared by the decide card (A2) and the custom-create live preview (C), so both
 * render through the SAME visual registry as the real chart.
 */
export const SYNTH_SCENES = Array.from({ length: 8 }, (_, i) => ({ id: `sc-${i + 1}`, label: `Scene ${i + 1}` }));

const SYNTH_PAIRS = [
  { name: 'a setup', setup_scene: 1, payoff_scene: 6, closed: true },
  { name: 'an open thread', setup_scene: 3, payoff_scene: null, closed: false },
];
const SYNTH_FINDINGS = [
  { title: 'a fact', clash: 'conflict', evidence: [{ scene: 3, text: 'said one thing' }, { scene: 7, text: 'and the opposite later' }] },
];

function synthLine(items: string[], rule?: string) {
  const R = items.length || 4;
  const n = 8;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    let idx: number;
    if (rule === 'falling') idx = (R - 1) * (1 - t);
    else if (rule === 'flat') idx = (R - 1) / 2 + (i % 2 ? 0.3 : -0.3);
    else if (rule === 'arc') idx = (R - 1) * (1 - Math.abs(t - 0.62) / 0.62);
    else if (!rule || rule === 'none') idx = (R - 1) * (0.5 + 0.4 * Math.sin(t * Math.PI * 1.5));
    else idx = (R - 1) * t; // rising / default
    idx = Math.max(0, Math.min(R - 1, Math.round(idx)));
    return { scene_id: `sc-${i + 1}`, value: items[idx] ?? null };
  });
}
function synthLanes(states: string[]) {
  const n = 8;
  return Array.from({ length: n }, (_, i) => ({ scene_id: `sc-${i + 1}`, value: states[i < n / 2 ? 0 : Math.min(1, states.length - 1)] ?? null }));
}
// Decide/custom preview = no scan yet → every item UNCHECKED (○ rows).
function synthCoverage(metaRows: any[]) {
  return metaRows.map((m) => ({ y_item: m.value, description: m.description, covered: false, evidence: null }));
}

export function buildExampleChart(lens: any): any {
  const items = lens.items?.length ? lens.items : (lens.items_meta ?? []).map((m: any) => m.value);
  const metaRows = lens.items_meta?.length ? lens.items_meta : items.map((v: string) => ({ value: v }));
  const c: any = {
    id: lens.id || 'preview', template_id: lens.id || 'preview', chart_def_id: lens.id || 'preview', label: lens.name || 'Preview',
    backend: lens.backend || 'trajectory', mode: lens.verdict_style === 'caption' ? 'descriptive' : 'consistency',
    scope: { type: lens.scope_type || 'story', name: lens.scope_label || 'the whole story' }, scope_label: lens.scope_label,
    kind: lens.kind, kind_word: lens.kind_word, glyph_id: lens.id,
    y_items: items, y_items_meta: metaRows, y_items_source: lens.y_items_source,
    math_rule: lens.math_rule, direction: lens.direction, verdict_style: lens.verdict_style,
    read_as: lens.read_as, look_for: lens.look_for, invariant: lens.invariant,
    visual: lens.visual, visual_default: lens.visual_default,
    data_points: [], coverage: [], findings: [], analysed_at: null,
  };
  if (lens.backend === 'ledger') c.data_points = synthLanes(items);
  else if (lens.backend === 'coverage') c.coverage = synthCoverage(metaRows);
  else if (lens.backend === 'dependency') c.coverage = SYNTH_PAIRS;
  else if (lens.backend === 'report') c.findings = SYNTH_FINDINGS;
  else c.data_points = synthLine(items, lens.math_rule);
  return c;
}
