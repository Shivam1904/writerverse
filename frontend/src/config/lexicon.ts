/**
 * lexicon — the one canonical user-facing word per concept.
 *
 * Word meanings for humans: docs/product/glossary.md.
 * Nav labels, page titles, chips, and buttons IMPORT these constants instead of
 * hard-coding strings, so two surfaces can't drift apart (the Lenses-nav →
 * "Gauges"-title split is the cautionary tale).
 *
 * Lens naming is deliberately absent — the lens surfaces are being replanned
 * separately; don't add LENS constants here until that plan lands.
 */

/** The assistant has ONE name. Page personas may only appear in a lockup. */
export const ASSISTANT_NAME = 'Night Eyes';

/** "Night Eyes · The Reader" — never a bare persona name. */
export const assistantLockup = (persona?: string) =>
  persona ? `${ASSISTANT_NAME} · ${persona}` : ASSISTANT_NAME;

/**
 * The proposal verb pair. Flavor verbs that carry meaning ("Make real",
 * "Birth them", "Add to story") are allowed; "Apply" / "Apply changes" are not
 * (they read as a third verb beside Accept/Dismiss).
 */
export const PROPOSAL_ACTIONS = {
  accept: 'Accept',
  dismiss: 'Dismiss',
} as const;

/**
 * The author's word for a raw note (model `Braindump`). Never "Brain Dump" or
 * "Braindump" on screen: code names stay, the screen says Ideas (wrt-116).
 */
export const IDEAS = { page: 'Ideas', one: 'idea' } as const;

/** The universal promotion verb (braindump → character / world entity / place). */
export const PROMOTE_VERB = 'Make real';

/**
 * Empty-field placeholder voice: quiet instruction, lowercase serif.
 * ("none yet" / "N/A" / bare "—" are forbidden.)
 * `passive` is for read-only rows that fill themselves as the story grows.
 */
export const PLACEHOLDER = {
  passive: 'takes shape as you write',
} as const;
