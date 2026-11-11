/**
 * Story so far — box config. Declares which boxes the page shows, in order, with
 * each one's view, visibility, and layout width:
 *   - people → always shown · half  ┐ share the top row
 *   - items  → has-data    · half  ┘
 *   - rules  → has-data    · full  (stretches across, below both)
 * (User-controllable later — this is the default. The page Frame will compose
 * the frames of whichever boxes are shown.) Kinds/views: modules/boxes/registry.ts.
 */
export const STORY_SO_FAR_BOXES = [
  { kind: 'people', view: 'small', visibleWhen: 'always', width: 'half' },
  { kind: 'items', view: 'small', visibleWhen: 'has-data', width: 'half' },
  { kind: 'rules', view: 'small', visibleWhen: 'has-data', width: 'full' },
];
