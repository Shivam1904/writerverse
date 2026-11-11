import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Active chapter / focused scene live entirely in the URL (?chap=<id>&sc=<id>),
 * not in the write store. The chapter rail and the editor both read the same
 * params, so they stay in lockstep, selection survives a refresh, and it's
 * shareable. Contract:
 *   - no `chap` → the editor falls back to the first chapter (caller decides).
 *   - no `sc`   → no scene is focused (perfectly fine — chapter-only view).
 * Clicking a rail row just navigates here; nothing else holds selection state.
 */
export function useWriteSelection() {
  const [params, setParams] = useSearchParams();
  const chap = params.get('chap');
  const sc = params.get('sc');

  // Set/clear chap + sc in one go. `replace` so chapter/scene hopping doesn't
  // flood the back stack (mirrors the old store-only, history-free behaviour).
  const select = useCallback(
    (chapId: any, sceneId: any) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (chapId == null || chapId === '') next.delete('chap');
          else next.set('chap', String(chapId));
          if (sceneId == null || sceneId === '') next.delete('sc');
          else next.set('sc', String(sceneId));
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { chap, sc, select };
}
