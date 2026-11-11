/**
 * World *section* visuals — the frontend-owned catalogue of what each known
 * section looks like (its glyph + tint), plus the resolver every surface uses
 * to turn a block into a mark.
 *
 * A "section" (a.k.a. a world *block* on the backend) is a heading with a list
 * under it. Some headings we know about up front (Locations, Items, …) and give
 * a signature glossy mark; the rest — author-invented or just a tag in use — get
 * a generic glossy token stamped with their initial. Per the frontend-first
 * rule, the *visual* defaults live here (loosely typed), not on the backend; the
 * backend only persists the author's explicit pick so it survives a reload.
 *
 * Glyph values: a real EntityMark kind ('location' | 'item' | 'rule' | …) wears
 * that glossy silhouette; anything else (or 'generic' / '') → the initial token.
 */
import { aspectColor, worldSectionAspectKey } from '../../theme/aspects';
import { block_key } from './data';

export type SectionGlyph =
  | 'location' | 'item' | 'rule' | 'thread' | 'person'   // canonical entity marks
  | 'faction' | 'magic' | 'creature' | 'history' | 'culture'  // bespoke section shapes
  | 'generic';

export interface KnownSection {
  key: string;     // canonical block key (lower-cased; see block_key)
  label: string;
  hint: string;
  glyph: SectionGlyph;
  color: string;   // a theme token (preferred) or any CSS colour
}

/**
 * The suggestion shelf, in display order. Keys mirror the backend
 * KNOWN_WORLD_BLOCKS (backend/worldbuilding/block_readers.py) + the established
 * place/thing/rule sections; glyph/colour are the bits the backend doesn't own.
 * Only location / item / rule have real EntityMark silhouettes today — the
 * others ride the generic token until they earn one.
 */
export const KNOWN_SECTIONS: KnownSection[] = [
  { key: 'places',    label: 'Places',    hint: 'where things happen',   glyph: 'location', color: 'var(--asp-locations)' },
  { key: 'things',    label: 'Things',    hint: 'objects that matter',   glyph: 'item',     color: 'var(--asp-items)' },
  { key: 'rules',     label: 'Rules',     hint: 'how the world works',   glyph: 'rule',     color: 'var(--asp-rules)' },
  { key: 'factions',  label: 'Factions',  hint: 'groups & powers',       glyph: 'faction',  color: 'var(--asp-factions)' },
  { key: 'magic',     label: 'Magic',     hint: 'how power works',       glyph: 'magic',    color: 'var(--asp-magic)' },
  { key: 'creatures', label: 'Creatures', hint: 'beings & species',      glyph: 'creature', color: 'var(--asp-creatures)' },
  { key: 'history',   label: 'History',   hint: 'what came before',      glyph: 'history',  color: 'var(--asp-history)' },
  { key: 'culture',   label: 'Culture',   hint: 'customs & daily life',  glyph: 'culture',  color: 'var(--asp-culture)' },
];

/** Colours offered in the picker — the shared aspect identity palette so any
 *  section the author colours stays in the consistent vocabulary. */
export const SECTION_COLORS: string[] = [
  'var(--asp-locations)', 'var(--asp-items)', 'var(--asp-factions)',
  'var(--asp-creatures)', 'var(--asp-world)', 'var(--asp-story)',
  'var(--asp-characters)', 'var(--asp-proposals)',
];

/** The glyphs offered in the picker — the entity marks + the bespoke section
 *  shapes + the lettered fallback. Order roughly by how common the shape is. */
export const SECTION_GLYPHS: SectionGlyph[] = [
  'location', 'item', 'rule', 'faction', 'magic', 'creature', 'history', 'culture', 'generic',
];

const BY_KEY: Record<string, KnownSection> = Object.fromEntries(
  KNOWN_SECTIONS.map((s) => [s.key, s]),
);

export function knownSection(name: string): KnownSection | undefined {
  return BY_KEY[block_key(name)];
}

/**
 * Resolve the mark a section should wear. Precedence:
 *   1. the author's explicit pick (block.glyph / block.color), then
 *   2. the known-section catalogue default, then
 *   3. the section's aspect identity by name (synonyms → their aspect; anything
 *      truly unknown → the generic world orange, the user-assignable default).
 */
export function resolveSectionVisual(block: {
  name?: string; label?: string; glyph?: string | null; color?: string | null;
}): { glyph: SectionGlyph; color: string } {
  const name = block.name || block.label || '';
  const known = knownSection(name);
  const glyph = (block.glyph as SectionGlyph) || known?.glyph || 'generic';
  const color = block.color || known?.color || aspectColor(worldSectionAspectKey(name));
  return { glyph, color };
}
