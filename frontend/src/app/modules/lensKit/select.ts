import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadCharacters } from '../../pages/characters/data';
import { queries } from '../../queries';
import { type WalkKey, type Where } from '../lens/lensLibrary';
import {
  useLensCatalogue, useSectionLensCatalogue, lensFitsScope, sectionLensFitsNode,
  type CatalogueLens,
} from './catalogue';
import type { LensScope } from './resolve';
import type { AttachContext } from './attach';
import { type LensContext } from './verdict';

/* select.ts — the shared "where am I → what lenses + what context" layer. Both
 * surfaces (section + page) read through these instead of rolling their own:
 *   · useLensesFor   — the available lenses for a context (catalogue/section/pack)
 *   · useLensContext — the gathered scope + cast + threads + AttachContext
 *   · bindingsFor    — the attached charts (re-exported from verdict.ts)
 * `getLensesFor` decides INSIDE whether to pull the bank, the section bank, the
 * page pack, or a mix — the caller just says where it is. */

export { bindingsFor, type LensContext } from './verdict';

/** The available lenses for a surface — ONE selector, deciding the source inside.
 *   · section — section-pure (this node) ONLY. Bank lenses are page-only.
 *   · page    — the bank, scope-filtered to the page (the hardcoded pack is gone;
 *               the bank IS the library now). A character page filters to that
 *               character's scope; threads/outline/chapters have no single scope
 *               so they offer the whole bank. */
export function useLensesFor(projectId: any, ctx: LensContext): CatalogueLens[] {
  const bank = useLensCatalogue(projectId);
  const sectionCat = useSectionLensCatalogue(projectId);
  return useMemo(() => {
    if (ctx.kind === 'section') {
      // Section shelves show ONLY section-pure lenses. Bank lenses are page-only.
      return sectionCat.filter((l) => sectionLensFitsNode(l, ctx.section, ctx.sub));
    }

    if (ctx.where === 'character' && ctx.id) {
      const scope: LensScope = { kind: 'entity', id: ctx.id, name: ctx.id, owner: ctx.id, scopeType: 'character' };
      return bank.filter((l) => lensFitsScope(l, scope));
    }

    if (ctx.where === 'threads') {
      const threadLenses = new Set([
        'character_arc_beats',
        'does_hero_grow',
        'enemies_to_allies',
        'relationship_heat',
        'condition',
        'whos_driving',
        'whos_where',
        'the_key_object',
      ]);
      return bank.filter((l) => threadLenses.has(l.templateId));
    }

    if (ctx.where === 'outline') {
      const outlineLenses = new Set([
        'mood_map',
        'scene_energy',
        'scene_types',
        'tension_curve',
        'loose_ends',
        'story_skeleton',
        'genre_promise',
        'who_knows_secret',
      ]);
      return bank.filter((l) => outlineLenses.has(l.templateId));
    }

    return bank;
  }, [bank, sectionCat, ctx]);
}

export interface LensContextBundle {
  projectId?: string;
  scope?: LensScope;
  where?: Where;
  id?: string;
  threads: any[];
  cast: any[];
  board: { charts: any[]; scenes: any[] };
  /** ready to hand to the attach picker. */
  attach: AttachContext;
}

/** Gather everything an attach needs from where I am — the "fitness" util. The
 *  section passes its ARN-derived `scope`; a page passes `where`/`id` and the
 *  scope is derived (character page → that character, else left to the picker). */
export function useLensContext(input: {
  projectId?: string; scope?: LensScope; where?: Where; id?: string;
}): LensContextBundle {
  const { projectId, where, id } = input;
  const { data: cast = [] } = useQuery({
    queryKey: ['characters_lite', String(projectId ?? '')], enabled: !!projectId, staleTime: 60_000,
    queryFn: async () => (await loadCharacters(projectId))?.characters ?? [],
  });
  const { data: threadData } = useQuery({ ...queries.plotThreads(projectId), enabled: !!projectId, staleTime: 60_000 });
  const threads = (threadData as any)?.threads ?? [];
  const { data: board = { charts: [], scenes: [] } } = useQuery({ ...queries.gaugesBoard(projectId), enabled: !!projectId });

  const scope: LensScope | undefined = input.scope
    ?? (where === 'character' && id ? { kind: 'entity', id, name: id, owner: id, scopeType: 'character' } : undefined);

  return useMemo(
    () => ({ projectId, scope, where, id, threads, cast, board, attach: { scope, where, id, threads } }),
    [projectId, scope, where, id, threads, cast, board],
  );
}

export type { WalkKey, Where };
