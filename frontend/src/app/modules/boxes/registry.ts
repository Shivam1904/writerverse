import { PeopleSmall } from './views/PeopleSmall';
import { ItemsSmall } from './views/ItemsSmall';
import { RulesSmall } from './views/RulesSmall';

/**
 * Box kinds — one per story-element type. A box is a typed, view-having module
 * (the suggestions pattern, generalized): each kind declares its label, empty
 * copy, the page-data key it reads, its source Operation, and its view types.
 *
 * Adding a new type (a future y_item: locations, factions, …) = one entry here
 * + its view component(s) + its read Operation. Each box will eventually carry
 * its own Frame; the page Frame composes the frames of the boxes it shows.
 *
 * View types: 'small' built now; 'big' / 'full' are named-but-future (like the
 * suggestions module shipped one view with the rest deferred). Loose / any.
 *
 * `prominence` sets the visual weight: 'primary' boxes are featured (the page
 * lays them out full-width + focused); 'secondary' boxes sit in the quiet grid.
 */
export const BOXES = {
  people: {
    label: 'The people',
    emptyText: "No one's on the page yet.",
    dataKey: 'people',
    source: 'get_characters', // ✅ Operation
    views: { small: PeopleSmall }, // big / full → future
    defaultView: 'small',
    prominence: 'primary', // the cast is the focus
  },
  items: {
    label: 'Things',
    emptyText: 'Nothing in play yet.',
    dataKey: 'items',
    source: 'get_items', // ✅ Operation (reads discovery.elements.items)
    views: { small: ItemsSmall },
    defaultView: 'small',
    prominence: 'secondary',
  },
  rules: {
    label: 'Rules',
    emptyText: 'No rules yet.',
    dataKey: 'rules',
    source: 'get_rules', // ✅ Operation (reads discovery.elements.rules)
    views: { small: RulesSmall },
    defaultView: 'small',
    prominence: 'secondary',
  },
};
