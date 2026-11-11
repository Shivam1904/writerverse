import { useWriteStore } from './writeStore';
import { useWriteSelection } from './useWriteSelection';

/**
 * The ONE rule for "the current scene" on the Write page: the scene the author
 * most recently scrolled to or clicked (`activeSceneId` in the write store),
 * else the committed `?sc` from the URL. The margin highlight and Night Eyes'
 * "this scene" both use it, so they always agree.
 */
export function pickCurrentSceneId(
  activeSceneId: string | null | undefined,
  sc: string | null | undefined,
): string | null {
  return activeSceneId || sc || null;
}

export function useCurrentSceneId(): string | null {
  const activeSceneId = useWriteStore((s) => s.activeSceneId);
  const { sc } = useWriteSelection();
  return pickCurrentSceneId(activeSceneId, sc);
}
