/* scope.ts — the ONE scope vocabulary for the lens kit.
 *
 * The backend sends `scope_type` as one of: story | character | object |
 * location | relationship. The frontend's thread/ARN layer uses a wider set
 * (item, theme, rule, other). `normScope` collapses the frontend vocabulary
 * to the backend's at the ONE boundary (useArnKit.deriveScope); everything
 * downstream uses the canonical set. */

export type ScopeType = 'story' | 'character' | 'object' | 'location' | 'relationship';

const NORM: Record<string, ScopeType> = {
  story: 'story', character: 'character', object: 'object', location: 'location',
  relationship: 'relationship',
  item: 'object', theme: 'story', rule: 'story', other: 'story',
};

export function normScope(raw: string | undefined): ScopeType {
  return NORM[(raw ?? '').trim().toLowerCase()] ?? 'story';
}

export const SCOPE_COUNT: Record<ScopeType, 0 | 1 | 2> = {
  story: 0, character: 1, object: 1, location: 1, relationship: 2,
};

export const SCOPE_LABELS: Record<ScopeType, string> = {
  story: 'the whole story', character: 'character', object: 'item',
  location: 'location', relationship: 'relationship',
};

/** Case-insensitive string normalizer for scope/slug matching. */
export const normStr = (s: any) => String(s ?? '').trim().toLowerCase();
