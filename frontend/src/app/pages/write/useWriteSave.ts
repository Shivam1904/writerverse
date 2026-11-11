import { useCallback, useEffect } from 'react';
import { callOp } from '../../gateway';
import { useWriteStore } from './writeStore';
import { isProseParkedForRedirect } from './unsavedStash';

// Build the save_scene_content args. When no prose is loaded for the scene
// (cache miss: a rename or entity-link on a scene the author never typed in),
// omit `content` entirely so the backend leaves the stored prose untouched.
// Sending an empty doc here would wipe the scene.
export function buildSaveArgs(
  sceneId: any,
  contentById: Record<string, any>,
  sceneText: string | undefined,
) {
  const content = contentById[sceneId];
  return {
    scene_id: String(sceneId),
    // Loaded content is the author's real document, so clearing a scene on
    // purpose must still save (the backend refuses empty-over-prose otherwise).
    ...(content !== undefined && { content, allow_empty: true }),
    // Keep the save instant — pipelines don't run inline here; we fire
    // analyze_scene after so the LLM calls never block the editor.
    auto_analyze: false,
    ...(sceneText !== undefined && { text: sceneText }),
  };
}

function findSceneText(data: any, sceneId: any): string | undefined {
  for (const ch of data.chapters) {
    const sc = ch.scenes.find((s: any) => s.id === sceneId);
    if (sc) return sc.text ?? undefined;
  }
  return undefined;
}

// Backoff before each retry of a failed save. Bounded, so a down backend ends
// in the page-level "save failed" banner instead of retrying forever. The save
// is an idempotent whole-doc write keyed by scene id, so re-sending is safe.
export const SAVE_RETRY_DELAYS_MS = [1000, 3000, 8000];

// Retry only when the server never answered (network error) or answered 5xx.
// A 4xx is a real answer (refused, not found): retrying won't change it.
function isTransient(err: any): boolean {
  const status = err?.response?.status;
  return status === undefined || (status >= 500 && status <= 599);
}

async function callWithRetry(run: () => Promise<unknown>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!isTransient(err) || attempt >= SAVE_RETRY_DELAYS_MS.length) throw err;
      await new Promise((r) => setTimeout(r, SAVE_RETRY_DELAYS_MS[attempt]));
    }
  }
}

// Shared across hook instances: scenes with a save in flight, and those asked
// to save again meanwhile (the in-flight save re-runs for them).
const inFlight = new Set<any>();
const resavePending = new Set<any>();

export function useWriteSave(
  projectId: string | undefined,
  // When any scene-analysis pipeline is on, fire analyze_scene AFTER the save so
  // the pipelines run in the background (the save itself stays instant). The
  // analysis writes invalidate `outline`, which refetches the marginalia.
  analyzeAfterSave = false,
) {
  const dirtySceneIds = useWriteStore((s) => s.dirtySceneIds);
  const setSaveStatus = useWriteStore((s) => s.setSaveStatus);
  const clearDirty = useWriteStore((s) => s.clearDirty);

  const saveScene = useCallback(
    async (sceneId: any) => {
      if (!projectId) return;
      // Read the freshest content/title straight from the store at call time —
      // a debounced auto-save fires after a delay, so a snapshot captured when
      // it was scheduled would be stale. Reading here also keeps saveScene's
      // identity stable across keystrokes.
      // A save is already in flight: ask it to go round again once it lands,
      // so words typed meanwhile are sent instead of dropped.
      if (inFlight.has(sceneId)) {
        resavePending.add(sceneId);
        return;
      }
      inFlight.add(sceneId);
      try {
        for (;;) {
          const { contentById, data } = useWriteStore.getState();
          const sentContent = contentById[sceneId];
          const sentText = findSceneText(data, sceneId);
          // A failed scene stays 'error' (banner up) until a save lands.
          if (useWriteStore.getState().saveStatusById[sceneId] !== 'error') {
            setSaveStatus(sceneId, 'saving');
          }
          await callWithRetry(() =>
            callOp(
              projectId,
              'save_scene_content',
              buildSaveArgs(sceneId, contentById, sentText),
            ),
          );
          // Only mark clean if what's on screen is what we just sent.
          const now = useWriteStore.getState();
          const changed =
            now.contentById[sceneId] !== sentContent ||
            findSceneText(now.data, sceneId) !== sentText;
          const requested = resavePending.delete(sceneId);
          if (changed || requested) continue;
          break;
        }
        setSaveStatus(sceneId, 'saved');
        clearDirty(sceneId);
        setTimeout(() => setSaveStatus(sceneId, 'idle'), 1500);
        // Background analysis. Fire-and-forget: the X-Invalidates response
        // triggers the `outline` refetch that surfaces the new marginalia.
        if (analyzeAfterSave) {
          callOp(projectId, 'analyze_scene', { scene_id: String(sceneId) }).catch(
            () => {},
          );
        }
      } catch (err) {
        console.error('Failed to save scene', { sceneId, err });
        setSaveStatus(sceneId, 'error');
      } finally {
        inFlight.delete(sceneId);
        resavePending.delete(sceneId);
      }
    },
    [projectId, setSaveStatus, clearDirty, analyzeAfterSave],
  );

  const saveAllDirty = useCallback(async () => {
    for (const sceneId of dirtySceneIds) {
      await saveScene(sceneId);
    }
  }, [dirtySceneIds, saveScene]);

  // Leave guard: the 1.5 s autosave debounce means a closed/reloaded tab can
  // drop the last words. Ask the browser to confirm while anything is dirty,
  // and fire the saves as soon as the page is hidden (tab switch, mobile
  // background, the last event we reliably get before a close).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useWriteStore.getState().dirtySceneIds.size === 0) return;
      if (isProseParkedForRedirect()) return; // dead-session redirect, prose is stashed
      e.preventDefault();
      e.returnValue = '';
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      for (const sceneId of useWriteStore.getState().dirtySceneIds) {
        void saveScene(sceneId);
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [saveScene]);

  return { saveScene, saveAllDirty, hasUnsavedChanges: dirtySceneIds.size > 0 };
}
