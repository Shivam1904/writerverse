import { useQuery } from '@tanstack/react-query';
import { queries } from '../../queries';
import { callOp } from '../../gateway';
import { ARCHETYPE_TO_TYPE, type LensTypeKey, type WalkKey } from '../lens/lensLibrary';
import type { LensDef, LensScope } from './resolve';
import { normScope } from './scope';

/* catalogue.ts — the UNIFIED lens source (design choice B). The kit's shelves source
 * the real gauge-bank templates (each carries a `scope_type`), not the registry's
 * per-section questions. Each template is adapted to the `LensDef` shape the Shelf /
 * AttachBox / Verdict already render, plus the scope + template-id the attach/verdict
 * need. The ARN registry still supplies the SCOPE (via useArnKit); this supplies the
 * lenses + their scope_type; `lensFitsScope` is where the two meet. */

export interface CatalogueLens extends LensDef {
  /** lens scope vocabulary: character | story | relationship | object | location | … */
  scopeType: string;
  /** the bank template id — the bind ref + the verdict match key. */
  templateId: string;
  /** the raw normalized bank lens (for the attach box / future config). */
  raw: any;
  /** SECTION-pure lite lens (from get_section_lenses): which ARN node it belongs to,
   *  and a flag so attach uses the invent path (not template bind). */
  section?: string;
  sub?: string;
  isSection?: boolean;
  reads?: string[];
  /** Where this lens came from. Load-bearing: `isSection` lenses use the invent
   *  attach path (not template bind); `pack` lenses are display-only unless they
   *  name a real `templateId`. `type`/`walk` are the archetype + default walk. */
  origin?: 'bank' | 'section' | 'pack';
  type?: LensTypeKey;
  walk?: WalkKey;
  attachable?: boolean;
}

function toCatalogueLens(l: any): CatalogueLens {
  const id = l.id || l.lens_id || l.template_id;
  return {
    slug: id,
    question: l.name || l.ask || id,
    description: l.watches || l.why || '',
    intent: l.look_for || l.why || '',
    good: l.good || '',
    problem: l.off || '',
    scopeType: l.scope_type || 'story',
    templateId: id,
    raw: l,
    origin: 'bank',
    type: ARCHETYPE_TO_TYPE[l.type_id || l.type] || 'arc',
    walk: (l.axis?.walk as WalkKey) || undefined,
    attachable: !!id,
  };
}

/** The bank catalogue (shared bank templates), normalized to the kit's lens shape. */
export function useLensCatalogue(projectId: any): CatalogueLens[] {
  const { data } = useQuery({ ...queries.gaugeCatalogue(projectId), enabled: !!projectId });
  return (data?.templates ?? []).map(toCatalogueLens);
}

/** The lighter SECTION lens bank (get_section_lenses) — the curated per-section
 *  questions, tagged with the ARN node they belong to. Section-pure: never in the
 *  page bank, only the section shelves. */
export function useSectionLensCatalogue(projectId: any): CatalogueLens[] {
  const { data } = useQuery({
    queryKey: ['gauges', String(projectId ?? ''), 'section-lenses'],
    queryFn: async () => (await callOp(projectId, 'get_section_lenses', {}, 'Gauges'))?.templates ?? [],
    enabled: !!projectId,
    staleTime: 60_000,
  });
  return ((data as any[]) ?? []).map((l) => ({
    ...toCatalogueLens(l),
    reads: l.reads || [],
    section: l.section ?? undefined,
    sub: l.sub ?? undefined,
    isSection: true,
    origin: 'section' as const,
    type: ARCHETYPE_TO_TYPE[l.type_id || l.type] || 'arc',
    attachable: true,
  }));
}

/** A section-pure lens fits a node when its (section, sub) matches the ARN node. */
export function sectionLensFitsNode(lens: CatalogueLens, section?: string, sub?: string): boolean {
  return (lens.section || '') === (section || '') && (lens.sub || '') === (sub || '');
}

/** Which catalogue lenses fit a node's scope. No scope (page-level / unknown) → all
 *  (the attach box asks which). A character scope ALSO offers relationship (two-
 *  character) lenses — the second character is picked at attach. */
export function lensFitsScope(lens: CatalogueLens, scope?: LensScope): boolean {
  const want = scope?.scopeType ? normScope(scope.scopeType) : undefined;
  if (!want) return true;
  const has = normScope(lens.scopeType);
  if (has === want) return true;
  if (want === 'character' && has === 'relationship') return true;
  return false;
}
