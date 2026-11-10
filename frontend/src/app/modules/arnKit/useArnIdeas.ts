import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { queries } from '../../queries';
import { ideaTagsFor, ideaKindsFor, useArnLocation } from '../sectionMarker';
import { tagCategory } from '../../pages/braindumps/components/tagCategories';
import { parseTag, entityName, entityTagOf } from '../../pages/braindumps/components/typedTags';

/* useArnIdeas — the idea-box twin of useArnKit: given a node's ARN parts, it
 * resolves the live "from your braindumps" phrases for that node, ENTIRELY from
 * the ARN. The registry node drives it on two axes:
 *   · ideaTags  — braindump CRAFT tags (the character pages: Character, goal, …).
 *   · ideaKinds — braindump ENTITY kinds (the World page: loc, item, rule, …).
 * A phrase surfaces when its tags hit ideaTags OR its entity-kinds hit ideaKinds.
 * Character-scoped nodes additionally require the phrase to mention the entity,
 * and match on that entity's own tags;
 * `storyScoped` nodes (the lenses box, every World section) skip that filter.
 *
 * This ports the matching that used to live in pages/characters/studioIdeas.ts
 * (buildSectionIdeas) and pages/world/worldIdeas.ts (buildWorldIdeas) — now
 * ARN-driven so any heading self-resolves its ideas via <ArnIdeaButton> /
 * <ArnIdeaBox> without the page bucketing them up front. */

export interface IdeaPhrase { id: string; text: string; cat: string }

const norm = (s: any) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** The entity's match-names: its display name + any plain alias names. */
export function entityMatchNames(entity: any): Set<string> {
  const names = new Set<string>();
  const main = norm(entity?.name);
  if (main) names.add(main);
  for (const a of entity?.aliases ?? []) {
    const n = norm(a?.name);
    if (n) names.add(n);
  }
  return names;
}

/** The phrase's `char[…]` entity matching one of `names`, or undefined. */
function mentionedChar(phrase: any, names: Set<string>): any {
  for (const e of phrase?.entities ?? []) {
    if (parseTag(entityTagOf(e)).kind !== 'char') continue;
    if (names.has(norm(entityName(e)))) return e;
  }
  return undefined;
}

/** The distinct entity kinds a phrase mentions (typed `kind[Name]`). */
function phraseKinds(phrase: any): Set<string> {
  const kinds = new Set<string>();
  for (const e of phrase?.entities ?? []) {
    const k = parseTag(entityTagOf(e)).kind;
    if (k) kinds.add(k);
  }
  return kinds;
}

/** Bucket every braindump phrase into this node's idea list — a phrase joins when
 *  its craft tags hit `ideaTags` OR its entity kinds hit `ideaKinds`. Dedupes by
 *  text; the dot category is the matched craft-tag's, or 'World' for a kind hit. */
export function resolveArnIdeas(
  braindumps: any[],
  ideaTags: string[],
  ideaKinds: string[],
  entity: any,
  storyScoped: boolean,
): IdeaPhrase[] {
  if (!ideaTags.length && !ideaKinds.length) return [];
  const tagSet = new Set(ideaTags);
  const kindSet = new Set(ideaKinds);
  const names = storyScoped ? null : entityMatchNames(entity);
  const out: IdeaPhrase[] = [];
  const seen = new Set<string>();

  for (const bd of braindumps ?? []) {
    const phrases = bd?.aiData?.phrases ?? [];
    phrases.forEach((p: any, pi: number) => {
      // A character page reads THAT character's own tags on the phrase (v3 ideas
      // tag each entity), so Milo's emotion never lands on Rosa's page.
      // Older ideas only carry the phrase's tags.
      const who = storyScoped ? undefined : mentionedChar(p, names!);
      if (!storyScoped && !who) return;
      const own = Array.isArray(who?.tags) ? who.tags : undefined;
      const tags: string[] = own ?? (Array.isArray(p?.tags) ? p.tags : []);
      const hitTag = tagSet.size ? tags.find((t) => tagSet.has(t)) : undefined;
      const hitKind = kindSet.size && [...phraseKinds(p)].some((k) => kindSet.has(k));
      if (!hitTag && !hitKind) return;
      const text = String(p?.text ?? '').trim();
      const key = norm(text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ id: `${bd?.id ?? 'bd'}:${pi}`, text, cat: hitTag ? (tagCategory(hitTag) || 'Other') : 'World' });
    });
  }
  return out;
}

export interface UseArnIdeasArgs {
  section: string;
  sub?: string;
  item?: string;
  /** the entity (character) whose mentions scope the phrases. Ignored when
   *  `storyScoped` — the lenses box / every World section is story-level. */
  entity?: any;
  storyScoped?: boolean;
}

/** Live idea phrases for one node, resolved from its ARN's registry ideaTags.
 *  Reuses the shared braindumps query (no extra fetch). */
export function useArnIdeas({ section, sub, item: _item, entity, storyScoped = false }: UseArnIdeasArgs): {
  ideas: IdeaPhrase[];
  count: number;
} {
  const { page } = useArnLocation();
  const { projectId } = useParams();
  const ideaTags = useMemo(() => ideaTagsFor(page, section, sub), [page, section, sub]);
  const ideaKinds = useMemo(() => ideaKindsFor(page, section, sub), [page, section, sub]);

  const { data: braindumps = [] } = useQuery({
    ...queries.braindumps(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const ideas = useMemo(
    () => resolveArnIdeas(braindumps as any[], ideaTags, ideaKinds, entity, storyScoped),
    [braindumps, ideaTags, ideaKinds, entity, storyScoped],
  );
  return { ideas, count: ideas.length };
}
