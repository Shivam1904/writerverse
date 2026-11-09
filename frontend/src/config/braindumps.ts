/**
 * Braindumps — user-facing copy.
 *
 * The idea-tree's candidate entities (people the AI spotted but that aren't yet
 * real cast members) carry a Draft action. Its labels live here per the config
 * convention — don't inline them in the rail component.
 */
import { ASSISTANT_NAME } from './lexicon';

export const braindumpsCopy = {
  // What happens to an idea when it's added — the same plain line on the
  // first-run screen and under the list composer (wrt-111).
  taggingHint: `${ASSISTANT_NAME} tags each idea (character, world, plot…) as you add it.`,
  /** Placeholder of the composer under the ideas list. */
  composerPlaceholder: 'add an idea: a name, a place, a what-if…',
  // The "make a real character from this candidate" action in the idea tree.
  draftCharacter: {
    /** Resting label on a candidate entity branch. */
    label: 'Draft character',
    /** While the promote proposal is being drafted (post-click feedback). */
    pending: 'drafting…',
    /** Tooltip — says what the click does and where it lands. */
    title: 'Draft a real character from this — opens on the cast page to review',
  },
};
