/**
 * What-to-do-next hints — the single "start the next foundational thing" nudge.
 *
 * When a foundational item type is still empty, nudge the author to start it.
 * Only ONE shows at a time, picked in NEXT_ORDER (project meta → characters →
 * threads → outline). `countKey` matches the shell's presence counts; `to` is
 * the section the card navigates to.
 *
 * Extracted from SuggestionsRail so BOTH the rail (which renders it as a
 * <HintRailCard>) and collectLiveHints (which serialises it for Night Eyes)
 * select from the SAME table — they can't drift.
 */
export type NextType = 'project' | 'character' | 'thread' | 'outline';

export interface NextStepHint {
  /** Stable id, e.g. 'next:character'. */
  id: string;
  /** Destination section — drives the card's glyph + navigation. */
  page: string;
  /** The one-line nudge copy. */
  line: string;
  /** The CTA verb. */
  cta: string;
}

export const NEXT_META: Record<
  NextType,
  { countKey: string; line: string; cta: string; to: string }
> = {
  project: {
    countKey: 'projectMeta',
    line: 'Your story has no premise yet — a logline, a paragraph, a hunch.',
    cta: 'Set the premise',
    to: 'world',
  },
  character: {
    countKey: 'characters',
    line: "No one's on stage yet. Who is this story about?",
    cta: 'Add a character',
    to: 'characters',
  },
  thread: {
    countKey: 'threads',
    line: 'No threads to pull yet. What tension runs through the book?',
    cta: 'Start a thread',
    to: 'plot-threads',
  },
  outline: {
    countKey: 'outline',
    line: 'No shape yet — lay down the acts and chapters.',
    cta: 'Build the outline',
    to: 'outline',
  },
};

const NEXT_ORDER: NextType[] = ['project', 'character', 'thread', 'outline'];

// Which next-step types each page nudges toward. A page omits its OWN type
// (you're already there to add it). `project` is a candidate on every page listed
// here. Routes NOT listed show no what-to-do-next hint. ("ideas" — the braindumps
// Canvas view — shares the braindumps route, so it gets the same set.) `world` is
// the project-meta page itself: it carries the other nudges, and the project-meta
// hint shows there without its (self-targeting) button — see the rail's render.
const PAGE_NEXT_TYPES: Record<string, NextType[]> = {
  chapters: ['character', 'thread'],
  // 'character' is omitted here: the braindumps page already carries the
  // `initz:start-characters` init card ("Give the story a pulse"), so a second
  // "Add a character" what-to-do-next nudge would duplicate it.
  braindumps: ['thread'],
  characters: ['thread', 'outline'],
  // 'outline' is omitted here: once a thread exists the plot-threads page already
  // carries an init card that nudges the outline (`initz:start-outline-from-thread`
  // at 1 thread, `initz:outline-from-threads` at ≥2), so a second "Build the
  // outline" what-to-do-next nudge would duplicate it.
  'plot-threads': ['character'],
  lenses: ['thread', 'outline'],
  world: ['character', 'thread', 'outline'],
};

/**
 * The single active what-to-do-next hint for this page: the highest-priority
 * empty type this page opts into, or null. Callers gate on their own
 * "presence loaded" flag before calling (a half-loaded store reads every count
 * as 0 and would flash a stale nudge).
 */
export function nextStepHint({
  section,
  counts,
}: {
  section?: string;
  counts: Record<string, number>;
}): NextStepHint | null {
  const pageTypes = section ? PAGE_NEXT_TYPES[section] : undefined;
  if (!pageTypes) return null;
  const nextType = NEXT_ORDER.find(
    (t) =>
      (t === 'project' || pageTypes.includes(t)) &&
      (counts[NEXT_META[t].countKey] ?? 0) === 0,
  );
  if (!nextType) return null;
  const meta = NEXT_META[nextType];
  return { id: `next:${nextType}`, page: meta.to, line: meta.line, cta: meta.cta };
}
