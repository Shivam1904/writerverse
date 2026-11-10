import type { CatalogueLens } from './catalogue';

/* shape.ts — the "shape it" seam: an AI-shaped lens spec (from invent_lens_from_ask)
 * → an in-memory CatalogueLens the existing attach box + bind engine consume.
 *
 * The spec is a build_preset-ready payload (type · name · watches · y_items ·
 * math_rule/invariant) PLUS the binding's scope (scope_type · scope_name · pair).
 * We DON'T persist anything here — the lens is held in memory and bound lazily on
 * Attach (applyAttach's non-section path → create_preset normalizes it). */

export interface ShapedLensSpec {
  type: string;
  name: string;
  watches?: string;
  scope_type?: string;
  scope_name?: string;
  pair?: string[] | null;
  y_items?: { value: string; description: string }[];
  math_rule?: string | null;
  invariant?: string | null;
}

function slugify(s: string): string {
  return (s || 'lens').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'lens';
}

/** AI spec → CatalogueLens. `raw` carries the full spec so applyAttach's bank path
 *  (presetConfigFromBank → create_preset → build_preset) forwards type/y_items/rules,
 *  and `items_meta` seeds the editable scale in ScaleSetup. `isSection: false` routes
 *  attach through the preset path (NOT the section-pure invent path). */
export function shapedLensFromSpec(spec: ShapedLensSpec): CatalogueLens {
  const yItems = Array.isArray(spec.y_items) ? spec.y_items : [];
  const slug = `shaped:${slugify(spec.name)}`;
  const raw: any = {
    ...spec,
    items_meta: yItems,          // ScaleSetup seeds the editable scale from here
    y_items: yItems,             // presetConfigFromBank forwards this into the preset
    y_items_source: 'predefined',
  };
  return {
    slug,
    question: spec.name,
    description: spec.watches || '',
    intent: '', good: '', problem: '',
    scopeType: spec.scope_type || 'story',
    templateId: slug,
    raw,
    origin: 'bank',              // non-section → attach uses create_preset, not invent
    isSection: false,
    type: (spec.type as any) || 'arc',
    attachable: true,
  };
}
