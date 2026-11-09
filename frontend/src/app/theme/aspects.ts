/**
 * Aspect colours — the single source of truth for *category identity* colour in
 * app. An "aspect" is a kind of thing in the product (characters, locations,
 * proposals, the whole story, …) — distinct from the *chrome* tokens in
 * `themes.ts` (--terra/--sage/…), which re-tint per theme template.
 *
 * Aspect colours are deliberately FIXED across every theme: blue = people, in
 * every theme. That stability is the whole point of colour-coding a category —
 * only the paper/ink/action chrome should re-theme. Tones are muted mid-values
 * so each reads as a dot / mark / left-bar on both light paper and dark themes
 * (never a highlighter).
 *
 * Two values per aspect:
 *   · `color` — the solid identity hex (dots, marks, borders, text-on-light).
 *   · `soft`  — a light tint (chip / row backgrounds, left-bars on light themes;
 *               on dark themes prefer `color` at a low alpha instead).
 *
 * `glyph` only *references* the existing mark vocabularies (no new icons here):
 *   · entity/world marks → EntityMark / sectionMeta `SectionGlyph` names;
 *   · page marks         → `pageGlyphs.ts` section ids.
 *
 * The same palette is mirrored as `--asp-*` CSS custom properties (see
 * `aspects.css`) so CSS-only surfaces can use it without importing this file.
 *
 * Frontend stays loosely typed this phase (`any` is fine) — see CLAUDE.md.
 */
import { IDEAS } from '../../config/lexicon';
import type { EntityKind, WorldSectionKind } from '../components/StoryIconsRegistry';

export type AspectKey =
  | 'story'        // the whole story — grand outline + project metadata
  | 'characters'   // the cast (the People page)
  | 'braindumps'   // raw ideas
  | 'proposals'    // pending AI proposals awaiting acceptance
  | 'locations'    // world: where things happen
  | 'items'        // world: objects that matter        (magic/items/rules family)
  | 'rules'        // world: how the world works         (magic/items/rules family)
  | 'magic'        // world: how power works             (magic/items/rules family)
  | 'factions'     // world: groups & powers             (faction/culture/history family)
  | 'culture'      // world: customs & daily life        (faction/culture/history family)
  | 'history'      // world: what came before            (faction/culture/history family)
  | 'creatures'    // world: beings & species
  | 'world'        // any other / new world section — the user-assignable default
  | 'threads';     // the plot-threads *category* (each thread instance is its own colour)

/** A glyph token — a `SectionGlyph` name (EntityMark / world marks) or a page id. */
export type AspectGlyph =
  | EntityKind
  | WorldSectionKind
  | 'generic'
  | 'outline'
  | 'braindumps'
  | 'world'
  | 'proposals'
  | 'plot-threads';

export interface Aspect {
  key: AspectKey;
  label: string;
  /** Solid identity hex (theme-independent). */
  color: string;
  /** Light tint for backgrounds / left-bars. */
  soft: string;
  /** Reference to an existing mark — not a new icon. */
  glyph: AspectGlyph;
}

/**
 * The palette. Hues are spaced around the wheel so no two collide; all muted to
 * sit on the paper themes. Members of a family (magic/items/rules → pink,
 * faction/culture/history → brown) intentionally share one colour.
 */
export const ASPECTS: Record<AspectKey, Aspect> = {
  story:      { key: 'story',      label: 'Story',       color: '#7a5ea3', soft: '#e6ddf2', glyph: 'outline' },
  characters: { key: 'characters', label: 'Characters',  color: '#4a72b0', soft: '#dbe6f5', glyph: 'person' },
  braindumps: { key: 'braindumps', label: IDEAS.page,    color: '#c79a3e', soft: '#f1e3b8', glyph: 'braindumps' },
  proposals:  { key: 'proposals',  label: 'Proposals',   color: '#4e8a55', soft: '#d8ecd5', glyph: 'proposals' },
  locations:  { key: 'locations',  label: 'Places',      color: '#3d8c8a', soft: '#d2e8e6', glyph: 'location' },
  items:      { key: 'items',      label: 'Items',       color: '#b05a86', soft: '#f1d8e6', glyph: 'item' },
  rules:      { key: 'rules',      label: 'Rules',       color: '#b05a86', soft: '#f1d8e6', glyph: 'rule' },
  magic:      { key: 'magic',      label: 'Magic',       color: '#b05a86', soft: '#f1d8e6', glyph: 'magic' },
  factions:   { key: 'factions',   label: 'Factions',    color: '#8a6a4a', soft: '#e7d9c8', glyph: 'faction' },
  culture:    { key: 'culture',    label: 'Culture',     color: '#8a6a4a', soft: '#e7d9c8', glyph: 'culture' },
  history:    { key: 'history',    label: 'History',     color: '#8a6a4a', soft: '#e7d9c8', glyph: 'history' },
  creatures:  { key: 'creatures',  label: 'Creatures',   color: '#b0533f', soft: '#f0d5cd', glyph: 'creature' },
  world:      { key: 'world',      label: 'World',       color: '#c4742f', soft: '#f3ddc4', glyph: 'world' },
  threads:    { key: 'threads',    label: 'Plot threads', color: '#6a6a72', soft: '#e2e2e6', glyph: 'plot-threads' },
};

/** All aspects in display order. */
export const ASPECT_LIST: Aspect[] = Object.values(ASPECTS);

/** The aspect for a key, falling back to the generic `world` aspect. */
export function aspect(key?: string | null): Aspect {
  return (key && (ASPECTS as any)[key]) || ASPECTS.world;
}

/** Just the solid identity colour for a key (→ `world` orange if unknown). */
export function aspectColor(key?: string | null): string {
  return aspect(key).color;
}

/** Just the soft tint for a key. */
export function aspectSoft(key?: string | null): string {
  return aspect(key).soft;
}

import { normalizeGlyphKey } from '../components/StoryIconsRegistry';

/**
 * Resolve a world-section name/key to its aspect key. Built-in sections map to a
 * known aspect; everything else (author-invented sections) → the `world`
 * default. Plurals and the legacy ids (`places`/`things`) are folded in.
 */
export function worldSectionAspectKey(name?: string | null): AspectKey {
  const key = normalizeGlyphKey(name);
  switch (key) {
    case 'person':
      return 'characters';
    case 'location':
      return 'locations';
    case 'item':
      return 'items';
    case 'rule':
      return 'rules';
    case 'thread':
      return 'threads';
    case 'faction':
      return 'factions';
    case 'magic':
      return 'magic';
    case 'creature':
      return 'creatures';
    case 'history':
      return 'history';
    case 'culture':
      return 'culture';
    default:
      return 'world';
  }
}

/** Map an `EntityMark` kind to its aspect key. */
export function entityKindAspectKey(kind?: string | null): AspectKey {
  return worldSectionAspectKey(kind);
}

// ── Per-instance entity colours ──────────────────────────────────────────── //
// Every entity owns a colour. We only STORE the author's override; an unset
// colour derives from the kind/relationship below (resolved here, never written
// to the DB, so palette changes re-theme un-customised entities). Mirrors the
// world-block colour pattern.

/**
 * Distinct blue-family shades mirrored from the backend
 * (`characters/models/character.py` CHARACTER_COLOR_SHADES). New characters are
 * auto-assigned one server-side; this copy lets the picker show the assigned
 * shade as selected and offer the family.
 */
export const CHARACTER_COLOR_SHADES = [
  '#4a72b0', '#3f5e96', '#5b86c4', '#3d7d9a', '#6a6fb0', '#4a8aa8',
];

/**
 * The aspect identity palette as raw HEX — for entity pickers that must STORE a
 * concrete colour (an override), not a CSS var token. (The world-block picker
 * keeps `var(--asp-*)` tokens via SECTION_COLORS; that's a separate seam.)
 */
export const ASPECT_HEX_PALETTE: string[] = [
  ASPECTS.locations.color, ASPECTS.items.color, ASPECTS.factions.color,
  ASPECTS.creatures.color, ASPECTS.world.color, ASPECTS.story.color,
  ASPECTS.characters.color, ASPECTS.proposals.color,
];

/** A character's identity colour: its stored colour, else the people-blue default. */
export function characterColor(char?: { color?: string } | null): string {
  return (char?.color || '').trim() || aspectColor('characters');
}

/** A world entity's colour: its stored override, else its block/kind aspect colour. */
export function worldEntityColor(
  entity?: { color?: string } | null,
  blockName?: string | null,
): string {
  return (entity?.color || '').trim() || aspectColor(worldSectionAspectKey(blockName));
}

/**
 * A thread's colour. Priority: explicit override → a character-scoped thread
 * mirrors its character's colour (live) → everything else (story / item / theme…)
 * takes the story colour (#7a5ea3, the braindump Plot/Theme hue).
 * `charColorByName` resolves a scope name → that character's effective colour.
 */
export function threadColor(
  thread?: { color?: string; scope?: { type?: string; name?: string } | null } | null,
  charColorByName?: (name: string) => string | undefined,
): string {
  const override = (thread?.color || '').trim();
  if (override) return override;
  const scope = thread?.scope || undefined;
  if (scope?.type === 'character' && scope?.name && charColorByName) {
    const c = charColorByName(scope.name);
    if (c) return c;
  }
  return aspectColor('story');
}

