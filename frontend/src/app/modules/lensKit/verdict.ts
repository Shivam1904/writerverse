import type { LensScope } from './resolve';
import { type RealWalk, type Where } from '../lens/lensLibrary';
import { SCOPE_LABELS, normScope, normStr } from './scope';

/* verdict.ts — node-lens chart lookup. The verdict types + the generic gauge
 * chart→verdict mapper live in modules/lens/LensVerdict (shared with the lens
 * attach panel); this keeps only the scope-aware chart lookup and re-exports the
 * shared pieces. */

export type { VerdictBar, VerdictConflict, MappedVerdict } from '../lens/LensVerdict';
export { chartToVerdict } from '../lens/LensVerdict';

const norm = normStr;

/** Find the board chart for a node lens. Matches on the `arn_lens` / `section_lens`
 *  stamp (slug), gated by scope: a character lens by scope.name, a thread lens by
 *  thread_ref. Falls back to the chart name = the question. */
export function findLensChart(
  charts: any[],
  slug: string,
  scope: LensScope,
  question: string,
): any | undefined {
  const slugN = norm(slug);
  const isThread = scope.kind === 'thread';
  const scopeMatches = (ch: any) =>
    isThread ? ch?.thread_ref === scope.id : norm(ch?.scope?.name) === norm(scope.name);

  return (charts || []).find((ch) => {
    if (!scopeMatches(ch)) return false;
    // bank-template binds (design choice B): the chart references the template id.
    if (norm(ch?.template_id) === slugN || norm(ch?.lens_id) === slugN) return true;
    const arnSlug = ch?.arn_lens?.slug ?? ch?.section_lens?.slug;
    if (arnSlug && norm(arnSlug) === slugN) return true;
    return norm(ch?.name) === norm(question);
  });
}

/** A bound chart's lens identity — the section-pure slug if it carries one, else the
 *  bank template id. Used to mark shelf cards as attached. */
export function chartSlug(ch: any): string {
  return ch?.arn_lens?.slug || ch?.section_lens?.slug || ch?.template_id || ch?.lens_id || ch?.id || '';
}

/** Does a bound chart belong to this lens? Matches by chartSlug OR the chart name
 *  (== the lens question) — the stable join for bank charts whose slug is a preset/
 *  binding id, not the shelf lens id. The one place chart↔lens identity is decided. */
export function chartMatchesLens(ch: any, lens: { slug?: string; question?: string }): boolean {
  const keys = new Set([chartSlug(ch), ch?.name].filter(Boolean).map(norm));
  return (!!lens.slug && keys.has(norm(lens.slug))) || (!!lens.question && keys.has(norm(lens.question)));
}

/** Every binding of these lenses, ANYWHERE on the board. Bindings are NOT filtered
 *  by where-you-are — only the lens list is. So once a lens appears on a surface,
 *  all of its bindings/verdicts show there. */
export function chartsForLenses(charts: any[], lenses: { slug?: string; question?: string }[]): any[] {
  return (charts || []).filter((ch) => lenses.some((l) => chartMatchesLens(ch, l)));
}

/** A bound chart's little "scope · walk · tick · thread" note, for a verdict
 *  heading. Walk comes from the REAL axis (axis.walk), the tick is its granularity. */
// A walk becomes a plain "reads …" source phrase — "walk" is not a user-facing
// noun (LANGUAGE.md §3). The thread walk names the thread it reads.
const WALK_SOURCE: Record<RealWalk, string> = {
  story: 'the draft',
  outline: 'the outline',
  thread: 'this thread',
};

export function chartNote(ch: any): string {
  const walk = (ch?.axis?.walk as RealWalk) || (ch?.thread_ref ? 'thread' : 'outline');
  const tick = ch?.axis?.tick;
  const scopeName = ch?.scope?.name || SCOPE_LABELS[normScope(ch?.scope?.type)];
  // "about Rand · reads the draft, scene by scene" — subject, then how it's read.
  const source = walk === 'thread' ? (ch?.thread_label || 'this thread') : WALK_SOURCE[walk];
  const cadence = tick ? `, ${tick} by ${tick}` : '';
  return [`about ${scopeName}`, `reads ${source}${cadence}`].join(' · ');
}

/** Where a lens surface is — the ONE context every shared util keys off. A section
 *  surface (arn node) carries its scope + ARN section/sub; a page surface carries
 *  which page + the in-view entity. */
export type LensContext =
  | { kind: 'section'; scope: LensScope; section?: string; sub?: string }
  | { kind: 'page'; where: Where; id?: string };

/** The single attached-state derivation: which bound charts belong on a surface,
 *  straight from the BOARD (no localStorage). Replaces the section's per-node
 *  filter AND the page's per-page filter — one function, two branches.
 *
 *  · section — scope-matched, then filtered by the section's LENS LIST: a binding
 *    belongs here iff it's scoped to this node AND its lens is one of THIS section's
 *    lenses (the caller passes the resolved list — `useLensesFor`). Bindings whose
 *    lens isn't part of the section (e.g. bank lenses, now page-only) are ignored.
 *  · page — the page's relevant bindings (threads page = all; character page =
 *    that character; outline/chapters = every non-thread binding). */
export function bindingsFor(
  charts: any[],
  ctx: LensContext,
  sectionLenses: { slug?: string; question?: string }[] = [],
): any[] {
  if (ctx.kind === 'page') {
    const { where, id } = ctx;
    return (charts || []).filter((ch) => {
      const tref = ch?.thread_ref;
      switch (where) {
        case 'threads': return true;
        case 'character': return ch?.scope?.type === 'character' && (!id || norm(ch?.scope?.name) === norm(id));
        case 'outline':
        case 'chapters': return !tref;
        default: return false;
      }
    });
  }
  const { scope } = ctx;
  const isThread = scope.kind === 'thread';
  // an entity node matches EVERY binding on that entity — including ones bound
  // along a thread walk (thread_ref set). (Previously `&& !ch.thread_ref` hid those,
  // so a thread-walk lens never ticked / showed on the character section.)
  const scopeMatches = (ch: any) =>
    isThread ? ch?.thread_ref === scope.id : norm(ch?.scope?.name) === norm(scope.name);
  return (charts || []).filter(
    (ch) => scopeMatches(ch) && sectionLenses.some((l) => chartMatchesLens(ch, l)),
  );
}

/** Section-node shorthand over `bindingsFor` — kept for useArnKit's call site.
 *  `sectionLenses` is the section's RESOLVED lens list (useLensesFor), not the
 *  whole catalogue. */
export function chartsForNode(
  charts: any[],
  sectionLenses: { slug?: string; question?: string }[],
  scope: LensScope,
  section?: string,
  sub?: string,
): any[] {
  return bindingsFor(charts, { kind: 'section', scope, section, sub }, sectionLenses);
}
