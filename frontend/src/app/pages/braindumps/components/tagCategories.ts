// Tag Categories for Braindumps — the ROOT > group > tag taxonomy.
//
// CANONICAL SOURCE is now the backend: `backend/config/braindump_tags.yml`,
// fetched via the `get_braindump_tag_categories` op (queries.braindumpTagCategories
// → entityTags.tsx). This hardcoded copy is the OFFLINE / first-paint FALLBACK
// only — keep it in sync with the YAML, but the backend wins when reachable.
//
// Six lean categories: Character (who they are + feel + look), Plot (events,
// conflicts, turns), World (setting, systems, history, atmosphere), Dialogue,
// Theme, and Other (anything else / craft notes). ENTITIES (people, places,
// things, threads) are NOT here — they merge into the tag UI from live project
// data (entityTags.tsx). Every tag is unique across categories (no tag appears
// in two groups), and World facets stay distinct from the archived `Entity`
// type-tags (`magic_rule`/`tech_rule`/`setting`, never bare magic/.../location).
//
// Each group carries a `color` — the dot colour for every tag in that group
// (independent of an idea's own colour, see colorIdea.ts). Tags themselves stay
// plain strings in the JSON tags list; the colour is derived from the group.
import { aspectColor } from '../../../theme/aspects';

// The former "Entity" group — pulled out of the active categories (entities are
// modelled elsewhere now). Kept here, commented, because we'll want this list
// back later (e.g. wiring braindump entity-tags to real entities).
// const braindumpEntityTags = { color: '#5f7fb5', tags: ['character', 'location', 'object', 'item', 'organization', 'faction', 'creature', 'technology', 'magic', 'vehicle', 'building', 'landmark', 'weapon', 'tool'] };

// Category dot-colours come from the aspect palette (theme/aspects.ts), one
// DIFFERENT colour per category, so the dot alone tells the author which
// category a tag is in; the filter bar's category chips double as the legend
// (wrt-123). Keep the backend YAML (braindumps/ai/braindump_tags.yml) in sync.
export const braindumpTagCategories: Record<string, { color: string; tags: string[] }> = {
  'Character': { color: aspectColor('characters'), tags: ['appearance', 'backstory', 'motivation', 'flaw', 'relationship', 'emotion'] },
  'Plot':      { color: aspectColor('story'),      tags: ['event', 'conflict_external', 'conflict_internal', 'goal', 'turning_point', 'resolution', 'flashback'] },
  'World':     { color: aspectColor('world'),      tags: ['setting', 'society', 'history', 'religion', 'magic_rule', 'tech_rule', 'atmosphere'] },
  'Dialogue':  { color: aspectColor('proposals'),  tags: ['dialogue', 'confrontation', 'monologue', 'catchphrase'] },
  'Theme':     { color: aspectColor('factions'),   tags: ['theme', 'motif', 'lesson'] },
  'Other':     { color: aspectColor('braindumps'), tags: ['idea', 'question', 'todo', 'research', 'plot_hole'] },
};

// Flat tag → group-colour map: the dot colour for a known braindump tag.
// Category labels are themselves selectable as tags (capitalized, so they never
// collide with the snake_case leaves), so they map to their own group colour too.
const TAG_COLOR: Record<string, string> = {};
for (const [category, { color, tags }] of Object.entries(braindumpTagCategories)) {
  TAG_COLOR[category] = color;
  for (const t of tags) TAG_COLOR[t] = color;
}

/** The group dot-colour for a tag, or undefined for unknown / #custom tags. */
export function tagColor(tag: string): string | undefined {
  return TAG_COLOR[tag];
}

// Flat tag → category-name map. A category label maps to itself (it's a tag
// too); each leaf maps to its group. Tags are unique across categories, so the
// mapping is unambiguous (matching TAG_COLOR).
const TAG_CATEGORY: Record<string, string> = {};
for (const [category, { tags }] of Object.entries(braindumpTagCategories)) {
  TAG_CATEGORY[category] = category;
  for (const t of tags) TAG_CATEGORY[t] = category;
}

/** The category a tag belongs to, or undefined for unknown / #custom tags.
 *  Used as the static fallback for the merged entity-tag index (entityTags.tsx). */
export function tagCategory(tag: string): string | undefined {
  return TAG_CATEGORY[tag];
}
