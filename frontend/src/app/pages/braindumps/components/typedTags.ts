// typedTags — the `kind[Name]` grammar for braindump entity tags.
//
// A braindump tag is either a flat CRAFT tag (`backstory`) or a typed ENTITY tag
// `kind[Name]` (`char[John Doe]`, `plot[Legacy of Control]`, `item[Arc Reactor]`,
// `rule[Magic has a blood cost]`, `world[Makabaki music]`). The kind is intrinsic
// to the string — self-describing, so we know it's a character without a live
// lookup, and it survives the entity being renamed or deleted.
//
// `kind` ∈ the vocabulary below, which maps 1:1 onto aspect keys (theme/aspects.ts)
// so colour + grouping stay consistent. Per-entity SCOPED craft tags
// (`char[John Doe: appearance, backstory]`) are a DISPLAY format rendered from
// `ai_data.entities`, never stored in `tags` or parsed here.

import type { AspectKey } from '../../../theme/aspects';

/** Entity-kind token → aspect key (colour + grouping family). */
export const KIND_ASPECT: Record<string, AspectKey> = {
  char: 'characters',
  plot: 'threads',
  loc: 'locations',
  item: 'items',
  rule: 'rules',
  magic: 'magic',
  faction: 'factions',
  culture: 'culture',
  history: 'history',
  creature: 'creatures',
  world: 'world',
};

/** Aspect key → entity-kind token (inverse of KIND_ASPECT). Used to type a world
 *  section's entities from its aspect (Locations→loc, Magic→magic, custom→world). */
export const ASPECT_KIND: Record<string, string> = {
  characters: 'char',
  threads: 'plot',
  locations: 'loc',
  items: 'item',
  rules: 'rule',
  magic: 'magic',
  factions: 'faction',
  culture: 'culture',
  history: 'history',
  creatures: 'creature',
  world: 'world',
};

/** The entity-kind token for an aspect key (→ 'world' fallback). */
export function aspectKind(aspectKey?: string | null): string {
  return (aspectKey && ASPECT_KIND[aspectKey]) || 'world';
}

/** Display group title for a built-in entity kind. (Custom world sections resolve
 *  their title from project data in entityTags.tsx, not here.) */
export const KIND_TITLE: Record<string, string> = {
  char: 'Character',
  plot: 'Plot',
  loc: 'Places',
  item: 'Items',
  rule: 'Rules',
  magic: 'Magic',
  faction: 'Factions',
  culture: 'Culture',
  history: 'History',
  creature: 'Creatures',
  world: 'World',
};

// kind ∈ lowercase letters; name = everything up to the final `]`.
const TAG_RE = /^([a-z]+)\[(.+)\]$/;

export interface ParsedTag {
  raw: string;
  /** null for a flat craft tag. */
  kind: string | null;
  /** the entity name (kind tags only). */
  name: string | null;
  isEntity: boolean;
}

/** Parse a tag string: `char[John Doe]` → {kind:'char', name:'John Doe'};
 *  a flat craft tag → {kind:null, name:null}. An unknown kind is treated as flat. */
export function parseTag(tag: string): ParsedTag {
  const raw = String(tag ?? '').trim();
  const m = TAG_RE.exec(raw);
  if (m && KIND_ASPECT[m[1]]) {
    return { raw, kind: m[1], name: m[2].trim(), isEntity: true };
  }
  return { raw, kind: null, name: null, isEntity: false };
}

/** Build a typed entity tag string: ('char','John Doe') → 'char[John Doe]'. */
export function formatTag(kind: string, name: string): string {
  return `${kind}[${String(name).trim()}]`;
}

/** The aspect key for a kind (→ 'world' fallback). */
export function kindAspectKey(kind?: string | null): AspectKey {
  return (kind && KIND_ASPECT[kind]) || 'world';
}

/** The display group title for a kind (→ 'World' fallback). */
export function kindTitle(kind?: string | null): string {
  return (kind && KIND_TITLE[kind]) || 'World';
}

/** True when the tag is a typed entity tag (`kind[Name]`). */
/** The human label for a tag: an entity tag → its bare Name; a craft / custom tag →
 *  the tag itself (sans a leading `#`). Use this everywhere a tag is shown. */
export function displayTag(tag: string): string {
  const p = parseTag(tag);
  return p.isEntity ? (p.name as string) : String(tag ?? '').replace(/^#/, '');
}

/** The name of a phrase/rollup entity — accepts the v2 `{kind,name}` dict or a
 *  legacy bare string. */
export function entityName(e: any): string {
  return (e && typeof e === 'object') ? String(e.name ?? '').trim() : String(e ?? '').trim();
}

/** A phrase/rollup entity → its typed tag `kind[Name]` (bare name when untyped).
 *  Accepts the v2 `{kind,name}` dict or a legacy bare string. */
export function entityTagOf(e: any): string {
  if (e && typeof e === 'object') {
    const name = String(e.name ?? '').trim();
    const kind = String(e.kind ?? '').trim();
    return kind && name ? formatTag(kind, name) : name;
  }
  return String(e ?? '').trim();
}
