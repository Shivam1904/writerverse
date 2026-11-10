import type { Hint } from './types';

/**
 * DEMO_HINTS — one sample per page, mixing both intents, so the card and every
 * per-page template are visible without a hints service wired in. Drop these
 * into SuggestionsRail (mapped to <HintRailCard>) to preview, the same way
 * DEMO_PROPOSALS stands in for real proposals there.
 *
 * Not exported from the barrel as "real" data — purely a dev fixture.
 */
export const DEMO_HINTS: Hint[] = [
  {
    id: 'demo:characters',
    page: 'characters',
    intent: 'tip',
    data: { names: ['Mara Vance', 'Joren', 'The Ferryman', 'Light', 'Tina'] },
  },
  {
    id: 'demo:characters-empty',
    page: 'characters',
    intent: 'start',
    data: { line: "No one's on stage yet. Who is this story about?" },
  },
  {
    id: 'demo:threads',
    page: 'plot-threads',
    intent: 'start',
    data: { line: 'No threads to pull yet. What tension runs through the book?' },
  },
  {
    id: 'demo:outline',
    page: 'outline',
    intent: 'tip',
    data: { acts: 3, chapters: 12 },
  },
  {
    id: 'demo:world',
    page: 'world',
    intent: 'start',
    data: { line: 'Your story has no premise yet — a logline, a hunch.', section: 'Premise' },
  },
  {
    id: 'demo:braindumps',
    page: 'braindumps',
    intent: 'tip',
    data: {
      line: 'You left an idea half-captured.',
      excerpt: '…what if the ferryman remembers every face he’s carried across?',
    },
  },
  {
    id: 'demo:lenses',
    page: 'lenses',
    intent: 'tip',
    data: { line: 'The voice lens reads Chapter 7 as lighter than its neighbours.' },
  },
  {
    // start-intent lens nudge: nothing watching yet (terracotta + "Open lenses" CTA).
    id: 'demo:lenses-start',
    page: 'lenses',
    intent: 'start',
    data: { line: 'Nothing’s watching your story yet — pick a lens and it watches as you write.' },
  },
  {
    // tip: a bound trajectory lens caught a dip — the kind of catch a lens surfaces.
    id: 'demo:lenses-drift',
    page: 'lenses',
    intent: 'tip',
    data: { line: 'Trust between Mara & Joren dipped twice in Act II — worth a look?' },
  },
  {
    // tip: a balance/coverage lens flagged an under-served subplot.
    id: 'demo:lenses-balance',
    page: 'lenses',
    intent: 'tip',
    data: { line: 'Three subplots, but one barely gets a scene — the balance lens flagged it.' },
  },
  {
    id: 'demo:chapters',
    page: 'chapters',
    intent: 'tip',
    data: { line: 'Your draft is taking shape.', words: 18420 },
  },
];
