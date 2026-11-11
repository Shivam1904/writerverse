/**
 * worldIdeas — REAL "from your ideas" data for the World-page sections.
 *
 * The World cousin of studioIdeas: it buckets live braindump phrases
 * by their typed ENTITY kind (loc / item / faction / magic / creature / culture /
 * history / world), which is exactly how a section maps to its ideas —
 *   section name → worldSectionAspectKey → aspectKind → entity kind.
 * A phrase joins a section's bucket when any of its `entities` carries that kind.
 * Custom sections fall back to the generic `world` kind (the catch-all bucket).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queries } from '../../queries';
import type { IdeaPhrase } from '../characters/studioFixtures';
import { aspectKind } from '../braindumps/components/typedTags';
import { parseTag, entityTagOf, entityName } from '../braindumps/components/typedTags';
import { worldSectionAspectKey, type AspectKey } from '../../theme/aspects';
import type { SectionGlyph } from './sectionMeta';

const norm = (s: any) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** The braindump entity kind a section's ideas live under. */
export function sectionKind(name?: string | null): string {
  return aspectKind(worldSectionAspectKey(name) as AspectKey);
}

/** Bucket every braindump phrase by the entity kind(s) it mentions. Keyed by
 *  entity kind; a section reads its bucket via sectionKind(). Dedupes by text. */
export function buildWorldIdeas(braindumps: any[]): Record<string, IdeaPhrase[]> {
  const out: Record<string, IdeaPhrase[]> = {};
  const seen: Record<string, Set<string>> = {};

  const push = (kind: string, text: string, id: string) => {
    const key = norm(text);
    if (!kind || !key) return;
    (seen[kind] ||= new Set());
    if (seen[kind].has(key)) return;
    seen[kind].add(key);
    (out[kind] ||= []).push({ id, text, cat: 'World' });
  };

  for (const bd of braindumps ?? []) {
    const phrases = bd?.aiData?.phrases ?? [];
    phrases.forEach((p: any, pi: number) => {
      // The distinct entity kinds this phrase mentions (typed `kind[Name]`).
      const kinds = new Set<string>();
      for (const e of p?.entities ?? []) {
        const k = parseTag(entityTagOf(e)).kind;
        if (k) kinds.add(k);
      }
      for (const k of kinds) {
        push(k, String(p?.text ?? '').trim(), `${bd?.id ?? 'bd'}:${pi}:${k}`);
      }
    });
  }
  return out;
}

/** Live per-section idea phrases for the World page, keyed by entity kind.
 *  Reuses the shared braindumps query (no extra fetch). */
export function useWorldIdeas(projectId: any): Record<string, IdeaPhrase[]> {
  const { data: braindumps = [] } = useQuery({
    ...queries.braindumps(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  return useMemo(() => buildWorldIdeas(braindumps as any[]), [braindumps]);
}

/** Candidate entity NAMES per entity kind: typed `kind[Name]` entities mentioned
 *  in the braindumps that aren't real Worldbuilding rows yet. `realNames` is the
 *  live set of world item names; the match is case/space-insensitive. The "make
 *  real" affordance promotes one of these into a real entry. */
export function buildWorldCandidates(
  braindumps: any[], realNames: string[],
): Record<string, string[]> {
  const real = new Set((realNames ?? []).map(norm));
  const out: Record<string, string[]> = {};
  const seen: Record<string, Set<string>> = {};
  for (const bd of braindumps ?? []) {
    for (const p of (bd?.aiData?.phrases ?? [])) {
      for (const e of (p?.entities ?? [])) {
        const k = parseTag(entityTagOf(e)).kind;
        if (!k) continue;
        const name = entityName(e);
        const nk = norm(name);
        if (!nk || real.has(nk)) continue;
        (seen[k] ||= new Set());
        if (seen[k].has(nk)) continue;
        seen[k].add(nk);
        (out[k] ||= []).push(name);
      }
    }
  }
  return out;
}

export function useWorldCandidates(
  projectId: any, realNames: string[],
): Record<string, string[]> {
  const { data: braindumps = [] } = useQuery({
    ...queries.braindumps(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  return useMemo(() => buildWorldCandidates(braindumps as any[], realNames), [braindumps, realNames]);
}

/**
 * The empty "ideas live here" section to surface when an entity kind has phrases
 * but no section for it is on the page yet (the author hasn't added one). loc /
 * item / rule use the structural identities (Places / Things / Rules) so an idea
 * inserted into the phantom files consistently; the rest are the known sections.
 * `world` (the custom-section catch-all) is intentionally absent — we don't
 * auto-surface a generic section for it.
 */
export const IDEA_PHANTOM_SECTIONS: Record<
  string,
  { id: string; title: string; hint: string; glyph: SectionGlyph; color: string }
> = {
  loc:      { id: 'places',    title: 'Places',    hint: 'where things happen',           glyph: 'location', color: 'var(--asp-locations)' },
  item:     { id: 'things',    title: 'Things',    hint: 'objects that matter',           glyph: 'item',     color: 'var(--asp-items)' },
  rule:     { id: 'rules',     title: 'How this world works', hint: 'the rules your writing keeps', glyph: 'rule', color: 'var(--asp-rules)' },
  faction:  { id: 'factions',  title: 'Factions',  hint: 'groups & powers',               glyph: 'faction',  color: 'var(--asp-factions)' },
  magic:    { id: 'magic',     title: 'Magic',     hint: 'how power works',                glyph: 'magic',    color: 'var(--asp-magic)' },
  creature: { id: 'creatures', title: 'Creatures', hint: 'beings & species',              glyph: 'creature', color: 'var(--asp-creatures)' },
  history:  { id: 'history',   title: 'History',   hint: 'what came before',              glyph: 'history',  color: 'var(--asp-history)' },
  culture:  { id: 'culture',   title: 'Culture',   hint: 'customs & daily life',          glyph: 'culture',  color: 'var(--asp-culture)' },
};
