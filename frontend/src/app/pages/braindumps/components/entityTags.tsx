/**
 * entityTags — the live "tag vocabulary" for braindumps: the craft categories
 * (tagCategories.ts) MERGED with real project entities (plot threads, characters,
 * world sections) from the cached queries. One shared index feeds all three tag
 * surfaces — the "+ tag" picker, the bottom-of-item TagRow, and the filter bar.
 *
 * Model (docs/superpowers/specs/2026-06-06-braindump-typed-entity-tags-design.md):
 *   · entity tags are TYPED — `kind[Name]` (`char[John Doe]`, `loc[Stark Tower]`),
 *     self-describing via the `kind` token (typedTags.ts); no bare-name storage.
 *   · an entity tag groups under its kind's home: char→Character, plot→Plot,
 *     world(generic/custom)→World — these MERGE with the craft category; every
 *     SPECIFIC world section (Locations / Items / Rules / Magic / …) is its own group.
 *   · within a group, entities render first (glossy), then the craft tags (flat).
 *   · resolvers fall back to the parsed `kind`, so an AI-proposed entity not yet in
 *     the project (e.g. `char[New Person]`) still resolves to its group + colour.
 *
 * Built once in BraindumpsPage and handed to <EntityTagContext.Provider>; children
 * read it via useEntityTags().
 */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queries } from '../../../queries';
import { braindumpTagCategories, tagCategory, tagColor } from './tagCategories';
import { aspectColor, worldSectionAspectKey } from '../../../theme/aspects';
import { parseTag, formatTag, aspectKind, kindAspectKey, kindTitle, entityName, entityTagOf } from './typedTags';

export interface TagGroupItem {
  tag: string;
  /** true = a real project entity (typed `kind[Name]`); false = a generic craft tag. */
  entity: boolean;
}
export interface TagGroup {
  /** stable group id (== the group title), used as the `group:<key>` filter key. */
  key: string;
  title: string;
  color: string;
  items: TagGroupItem[];
}

export interface EntityTagIndex {
  /** Merged groups in display order: Character, Plot, World, then world-section
   *  groups, then the craft-only categories (Dialogue / Theme / Other). */
  groups: TagGroup[];
  /** The group key a tag belongs to (heading title or member), or undefined. */
  groupOf: (tag: string) => string | undefined;
  /** Display title for a group key. */
  titleOf: (key: string) => string | undefined;
  /** The group dot-colour for a tag, or undefined for unknown / #custom tags. */
  colorOf: (tag: string) => string | undefined;
  /** true when the tag is an entity tag (real OR an AI-proposed candidate). */
  isEntity: (tag: string) => boolean;
  /** true ONLY when the tag is a REAL live project entity (exists in the
   *  characters / threads / world data) — vs a candidate the AI surfaced but
   *  that isn't a real entity yet. */
  isReal: (tag: string) => boolean;
  /** For a candidate `char[Name]` that's been folded into a real character (its
   *  name lives in that character's `aliases`), the primary's display name — so
   *  the idea tree shows "alias of <primary>" instead of a Draft button. Else
   *  undefined. Char-only; a render-time resolve (no braindump data moves). */
  aliasOf: (tag: string) => string | undefined;
}

const norm = (s: any) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Built-in world sections get the user's labels; custom sections keep theirs. */
function worldTitle(s: any): string {
  const id = s?.id ?? s?.name;
  if (id === 'places') return 'Places';
  if (id === 'things') return 'Items';
  if (id === 'rules') return 'Rules';
  return String(s?.title ?? '').trim();
}
/** Order: Places, Items, Rules, then custom sections in their own order. */
function structuralRank(s: any): number {
  const id = s?.id ?? s?.name;
  return id === 'places' ? 0 : id === 'things' ? 1 : id === 'rules' ? 2 : 3;
}

function uniqueNonEmpty(arr: any[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const s = String(v ?? '').trim();
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

/**
 * Distinct candidate CHARACTER names: `char[Name]` entities mentioned in the
 * braindump phrases that have NO matching real Character yet. First-seen order —
 * index 0 is "the first character" the make-real walk-along hint walks the author
 * through. Shared by useCounts (the hint's gate count) and the card (which name to
 * draft) so the two can't drift. `realNames` is the live cast; the match is
 * case/space-insensitive (same `norm` the entity index uses for isReal).
 */
export function candidateCharNames(braindumps: any[], realNames: any[]): string[] {
  const real = new Set((realNames ?? []).map(norm));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of braindumps ?? []) {
    for (const p of (b?.aiData?.phrases ?? [])) {
      for (const e of (p?.entities ?? [])) {
        if (parseTag(entityTagOf(e)).kind !== 'char') continue;
        const name = entityName(e);
        const k = norm(name);
        if (!k || real.has(k) || seen.has(k)) continue;
        seen.add(k);
        out.push(name);
      }
    }
  }
  return out;
}

/** Build the merged tag index from the project queries + the tag taxonomy. */
export function useEntityTagIndex(projectId: any): EntityTagIndex {
  const threadsQ = useQuery({ ...queries.plotThreads(projectId), enabled: !!projectId });
  const charsQ = useQuery({ ...queries.characters(projectId), enabled: !!projectId });
  const worldQ = useQuery({ ...queries.world(projectId), enabled: !!projectId });
  const taxQ = useQuery({ ...queries.braindumpTagCategories(projectId), enabled: !!projectId });

  const threads = (threadsQ.data as any)?.threads;
  const characters = (charsQ.data as any)?.characters;
  const sections = (worldQ.data as any)?.sections;
  const taxonomy = taxQ.data as any[] | undefined;

  return useMemo(
    () => buildIndex(threads, characters, sections, taxonomy),
    [threads, characters, sections, taxonomy],
  );
}

// Static craft categories from the backend taxonomy when fetched, else the
// hardcoded fallback (offline / first paint). Normalised to {title, color, tags}.
function staticCategorySource(taxonomy: any[] | undefined): { title: string; color: string; tags: string[] }[] {
  if (taxonomy && taxonomy.length) {
    return taxonomy.map((c) => ({ title: c.name, color: c.color || '', tags: Array.isArray(c.tags) ? c.tags : [] }));
  }
  return Object.entries(braindumpTagCategories).map(([title, g]) => ({ title, color: g.color, tags: g.tags }));
}

interface Accum {
  key: string;
  title: string;
  color: string;
  entityItems: TagGroupItem[];
  craftItems: TagGroupItem[];
  seen: Set<string>;
  rank: number;
}

function buildIndex(threads: any[], characters: any[], sections: any[], taxonomy?: any[]): EntityTagIndex {
  const craft = staticCategorySource(taxonomy);
  const acc = new Map<string, Accum>();
  const order: string[] = [];

  const ensure = (title: string, color: string, rank: number): Accum => {
    const nk = norm(title);
    let g = acc.get(nk);
    if (!g) {
      g = { key: title, title, color, entityItems: [], craftItems: [], seen: new Set(), rank };
      acc.set(nk, g); order.push(nk);
    } else if (color && !g.color) { g.color = color; }
    return g;
  };

  // 1) Craft categories define order, colour, and the flat craft tags
  //    (Character=0, Plot=1, World=2, Dialogue=3, … per the taxonomy order).
  const worldRank = craft.findIndex((c) => norm(c.title) === 'world');
  craft.forEach((c, i) => {
    const g = ensure(c.title, c.color, i);
    for (const tag of c.tags) {
      if (!g.seen.has(tag)) { g.seen.add(tag); g.craftItems.push({ tag, entity: false }); }
    }
  });

  // 2) Typed entity items, folded into their kind's home group.
  const addEntities = (kind: string, title: string, color: string, rank: number, names: any[]) => {
    const uniq = uniqueNonEmpty(names);
    if (!uniq.length) return;
    const g = ensure(title, color, rank);
    for (const n of uniq) {
      const tag = formatTag(kind, n);
      if (!g.seen.has(tag)) { g.seen.add(tag); g.entityItems.push({ tag, entity: true }); }
    }
  };
  addEntities('char', 'Character', aspectColor('characters'), acc.get('character')?.rank ?? 0, (characters ?? []).map((c: any) => c?.name));
  addEntities('plot', 'Plot', aspectColor('threads'), acc.get('plot')?.rank ?? 1, (threads ?? []).map((t: any) => t?.name));

  // World sections: a specific aspect (Locations / Magic / …) → its own group, just
  // after World; the generic/custom 'world' aspect → folded into the World group.
  const ordered = [...(sections ?? [])]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => structuralRank(a.s) - structuralRank(b.s) || a.i - b.i)
    .map((x) => x.s);
  ordered.forEach((s, idx) => {
    const title = worldTitle(s);
    if (!title) return;
    const aspect = worldSectionAspectKey(title);
    const kind = aspectKind(aspect);
    const names = (s?.items ?? []).map((it: any) => String(it?.name || it?.text || '').trim());
    if (kind === 'world') {
      addEntities('world', 'World', aspectColor('world'), acc.get('world')?.rank ?? 2, names);
    } else {
      const rank = (worldRank >= 0 ? worldRank : 2) + 0.001 * (idx + 1);
      addEntities(kind, title, s?.color || aspectColor(aspect), rank, names);
    }
  });

  // 3) Assemble — entities first, then craft — ordered by rank.
  const groups: TagGroup[] = order
    .map((nk) => acc.get(nk)!)
    .sort((a, b) => a.rank - b.rank)
    .map((g) => ({ key: g.key, title: g.title, color: g.color, items: [...g.entityItems, ...g.craftItems] }))
    .filter((g) => g.items.length);

  // 3b) Candidate → primary map: norm(aliasName) → primary character display name,
  //     from each real character's `aliases` (each {name} / {name, character_id} /
  //     bare string). Powers `aliasOf` so a folded candidate renders "alias of X".
  const aliasToPrimary = new Map<string, string>();
  for (const c of characters ?? []) {
    const primary = String(c?.name ?? '').trim();
    if (!primary) continue;
    for (const a of (c?.aliases ?? [])) {
      const an = typeof a === 'string' ? a : a?.name;
      const k = norm(an);
      if (k && !aliasToPrimary.has(k)) aliasToPrimary.set(k, primary);
    }
  }

  // 4) Reverse maps over live items. Entity origin wins resolution; the heading
  //    title resolves to its own group.
  const keyOf = new Map<string, string>();
  const colOf = new Map<string, string>();
  const titleByKey = new Map<string, string>();
  const entitySet = new Set<string>();
  for (const g of groups) {
    titleByKey.set(g.key, g.title);
    if (!keyOf.has(g.title)) { keyOf.set(g.title, g.key); colOf.set(g.title, g.color); }
    for (const it of g.items) {
      if (!keyOf.has(it.tag) || it.entity) { keyOf.set(it.tag, g.key); colOf.set(it.tag, g.color); }
      if (it.entity) entitySet.add(it.tag);
    }
  }

  // Resolve a tag, falling back to its parsed `kind` for typed tags not backed by a
  // live entity (e.g. an AI-proposed char[New Person]) and to the craft taxonomy.
  const resolveGroup = (t: string): string | undefined => {
    const hit = keyOf.get(t);
    if (hit) return hit;
    const p = parseTag(t);
    return p.isEntity ? kindTitle(p.kind) : tagCategory(t);
  };
  const resolveColor = (t: string): string | undefined => {
    const hit = colOf.get(t);
    if (hit) return hit;
    const p = parseTag(t);
    return p.isEntity ? aspectColor(kindAspectKey(p.kind)) : tagColor(t);
  };

  return {
    groups,
    groupOf: resolveGroup,
    titleOf: (k) => titleByKey.get(k) ?? k,
    colorOf: resolveColor,
    isEntity: (t) => entitySet.has(t) || parseTag(t).isEntity,
    isReal: (t) => entitySet.has(t),
    aliasOf: (t) => {
      const p = parseTag(t);
      if (!p.isEntity || p.kind !== 'char' || !p.name) return undefined;
      return aliasToPrimary.get(norm(p.name));
    },
  };
}

// Fallback for consumers rendered outside a provider — taxonomy + typed-tag parsing,
// no live entities.
const STATIC_FALLBACK: EntityTagIndex = {
  groups: [],
  groupOf: (t) => { const p = parseTag(t); return p.isEntity ? kindTitle(p.kind) : tagCategory(t); },
  titleOf: (k) => k,
  colorOf: (t) => { const p = parseTag(t); return p.isEntity ? aspectColor(kindAspectKey(p.kind)) : tagColor(t); },
  isEntity: (t) => parseTag(t).isEntity,
  isReal: () => false,  // no live project data outside the provider
  aliasOf: () => undefined,
};

const EntityTagContext = createContext<EntityTagIndex | null>(null);

export function EntityTagProvider({ value, children }: { value: EntityTagIndex; children: ReactNode }) {
  return <EntityTagContext.Provider value={value}>{children}</EntityTagContext.Provider>;
}

export function useEntityTags(): EntityTagIndex {
  return useContext(EntityTagContext) ?? STATIC_FALLBACK;
}
