import { PROPOSAL_ACTIONS } from '../../../config/lexicon';

export interface ProposalSurface {
  confirmType: 'content_review' | 'mutation_confirm' | 'cost_confirm';
  page: string;
  acceptLabel: string;
  inlineLabel: string;
}

/**
 * How a pending proposal reads on the right-rail card and in its accept receipt,
 * keyed by capability. Only Route.PROPOSE capabilities create Proposal rows, so
 * every key here must be one; the backend test `test_proposal_surfaces` checks it.
 */
export const PROPOSAL_SURFACES: Record<string, ProposalSurface> = {
  // --- content_review ---
  run_merge_rough_into_grand: {
    confirmType: 'content_review',
    page: 'outline.diff_tree',
    // Real accept: the button applies the merge. On the rail card,
    // clicking the card body (not the button) navigates to the outline to
    // review the result.
    acceptLabel: 'Accept',
    inlineLabel: 'Your outline has been sprinkled',
  },
  generate_thread: {
    confirmType: 'content_review',
    page: 'threads.card',
    acceptLabel: 'Accept thread',
    inlineLabel: 'New thread',
  },
  // Sibling of generate_thread (description-based, chained off the story slice
  // of run_init_elements). Same result shape + same accept → same rendering.
  generate_thread_from_description: {
    confirmType: 'content_review',
    page: 'threads.card',
    acceptLabel: 'Accept thread',
    inlineLabel: 'New thread',
  },
  run_user_wishes_rough: {
    confirmType: 'content_review',
    page: 'threads.card',
    acceptLabel: 'Accept plot',
    inlineLabel: 'Extract user plot',
  },

  // Extract elements (Braindumps) — one run fans out into per-type proposals
  // (story / characters / items / rules), each its own card. All share this
  // capability, so the rail card renderer is shared; accept is run-level
  // (per type) via the generic accept_proposal.
  run_init_elements: {
    confirmType: 'content_review',
    page: 'braindumps.elements',
    acceptLabel: 'Add to story',
    inlineLabel: 'Extracted elements',
  },

  update_project_meta: {
    confirmType: 'content_review',
    page: 'world.meta',
    acceptLabel: PROPOSAL_ACTIONS.accept,
    inlineLabel: 'Update story details',
  },

  // "Make real" queues this: an AI-drafted description for a just-promoted world
  // entry, proposed as a content edit. Accept writes it onto the row.
  draft_world_entity: {
    confirmType: 'content_review',
    page: 'world.section',
    acceptLabel: 'Add description',
    inlineLabel: 'Draft description',
  },

  // The enrichment half of promote: the button's promote_to_character WRITE creates
  // the cast row immediately, then queues this proposal (description + external/
  // internal arcs) as an EDIT to that row. Surfaces in CharacterSuggestions on the
  // Characters page; accept fills the existing character's blank arc fields.
  enrich_promoted_character: {
    confirmType: 'content_review',
    page: 'characters.suggestions',
    acceptLabel: PROPOSAL_ACTIONS.accept,
    inlineLabel: 'Enrich character',
  },

  // Night Eyes' edit-character tool lands the SAME character_edit proposal as the
  // enrichment — rendered identically (the studio overlay keys off the shape, not
  // the capability). Same `characters` section → suppressed on the characters page.
  propose_character_edit: {
    confirmType: 'content_review',
    page: 'characters.suggestions',
    acceptLabel: PROPOSAL_ACTIONS.accept,
    inlineLabel: 'Edit character',
  },

  // Night Eyes' beat add/edit on a plot thread. One proposal per beat; the
  // Threads page already shows each one inline as a green beat with its own
  // accept/reject, so `threads.*` hides the rail card there (same as the
  // generate_thread cards above) and the receipt points back to Threads.
  propose_insert_beat: {
    confirmType: 'content_review',
    page: 'threads.beats',
    acceptLabel: 'Add beat',
    inlineLabel: 'Add a beat',
  },
  propose_update_beat: {
    confirmType: 'content_review',
    page: 'threads.beats',
    acceptLabel: PROPOSAL_ACTIONS.accept,
    inlineLabel: 'Edit a beat',
  },

  // --- mutation_confirm ---
  add_worldbuilding: {
    confirmType: 'mutation_confirm',
    page: 'world.section',
    acceptLabel: 'Add to world',
    inlineLabel: 'Add worldbuilding',
  },
};
