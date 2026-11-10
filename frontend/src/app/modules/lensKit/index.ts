/* lensKit — the lens UI standard. One home for every lens surface: the section
 * slice (today) and, folded in later, the page boards + the unattached inventory.
 *
 * Entry: <LensKit type="section" | "page" | "inventory" … />, keyed by a node ARN +
 * the scope the caller derives. Components come in variants (shelf · attach · verdict).
 * The lens's OWN identity/type system lives in modules/lens/lensLibrary.ts — this
 * kit renders lenses; it doesn't define what a lens IS. */

// typed entry + the section facade
export { LensKit, type LensKitType } from './LensKit';
export { SectionLens } from './SectionLens';

// components + their variants
export { LensShelf, type ShelfVariant } from './Shelf';
export { LensAttachContainer } from './AttachBox';
export { LensVerdict, VerdictLite, type VerdictVariant } from './VerdictCard';

// the unified bank catalogue (design choice B) + the lighter section bank + filters
export {
  useLensCatalogue, useSectionLensCatalogue, lensFitsScope, sectionLensFitsNode,
  type CatalogueLens,
} from './catalogue';

// per-ARN attach + box-open state
export { useLensStore } from './useLensStore';

// lens types + y_items util
export {
  lensYItems,
  type LensDef, type LensScope,
} from './resolve';

// the SINGLE attach engine — what a lens needs, defaults, and the bind chain
export {
  lensReq, defaultChoice, applyAttach,
  type LensReq, type AttachChoice, type AttachContext, type ScopeRef,
} from './attach';

// engine: verdict lookup/mapping + board → node selectors
export { findLensChart, chartToVerdict, chartsForNode, chartSlug, bindingsFor } from './verdict';
export type { VerdictBar, VerdictConflict, MappedVerdict, LensContext } from './verdict';

// canonical scope vocabulary — the ONE set of scope words + string normalizer
export { normScope, normStr, SCOPE_COUNT, SCOPE_LABELS, type ScopeType } from './scope';

// the shared "where am I → lenses + context" layer
export { useLensesFor, useLensContext } from './select';
export type { LensContextBundle } from './select';
