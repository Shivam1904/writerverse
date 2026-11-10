import { useParams } from 'react-router-dom';
import { MARKER_REGISTRY } from './registry';

/* useArnLocation — the ARN's first two parts (page · id), derived straight from the
 * URL. This REPLACES the old <MarkerScope> context wrapper: a node's page/id are a
 * property of the route it's mounted on, not something to thread through React
 * context.
 *
 *   · id   — the URL entity param (e.g. characterId).
 *   · page — the registry key that route maps to (the URL path segment differs:
 *            /characters/:characterId → the "character-studio" registry node).
 *
 * Returns page '' when the route isn't a registered ARN page — the kit then
 * degrades (no ARN ⇒ no lenses/ideas). Add a branch here as each page is wired. */
export function useArnLocation(): { page: string; id?: string } {
  const { characterId, section } = useParams();
  // character studio: /characters/:characterId → registry key differs from the path.
  if (characterId) return { page: 'character-studio', id: characterId };
  // any other section page whose URL slug IS a registry key (e.g. 'plot-threads').
  // No entity id — those pages aren't scoped to one entity.
  if (section && section in MARKER_REGISTRY) return { page: section };
  return { page: '' };
}
