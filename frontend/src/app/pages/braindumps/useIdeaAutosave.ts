import { useCallback, useEffect, useRef } from 'react';

/** Quiet time after the last keystroke before an edited idea is saved. */
export const IDEA_AUTOSAVE_MS = 1500;

// Ids keep their own type (server ids are numbers, unsaved rows `tmp-…`).
type Id = string | number;
type Save = (id: Id, body: string) => Promise<boolean | void> | boolean | void;

/**
 * useIdeaAutosave — saves edits to EXISTING ideas while the author types
 * (SA-134). Same pattern as the Write page's autosave:
 *   · `queue(id, text)` on every keystroke; one save runs 1.5 s after the
 *     last one (never one save per keystroke).
 *   · `flush()` saves everything waiting right now (blur, page hidden, and
 *     automatically when the component unmounts, e.g. a route change).
 *   · while anything is unsaved, closing/reloading the tab asks to confirm.
 * A failed save keeps the text waiting, so the next flush retries it and the
 * leave warning stays on. (The gateway already shows the red problem toast.)
 * One save per idea at a time: text typed during a save is sent after it.
 *
 * Only edits go through here. New, never-saved rows keep their own create
 * flow, and nothing here asks the AI to re-tag an edited idea.
 *
 * `alsoDirty` lets the caller add its own unsaved state to the leave warning.
 */
export function useIdeaAutosave(save: Save, alsoDirty: () => boolean = () => false) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const alsoDirtyRef = useRef(alsoDirty);
  alsoDirtyRef.current = alsoDirty;

  const pending = useRef(new Map<Id, string>()); // id → latest unsaved text
  const inFlight = useRef(new Set<Id>());
  const timer = useRef<number | null>(null);

  const saveOne = useCallback(async (id: Id) => {
    if (inFlight.current.has(id)) return; // the running save picks up newer text
    inFlight.current.add(id);
    try {
      while (pending.current.has(id)) {
        const body = pending.current.get(id)!;
        pending.current.delete(id);
        let ok: boolean | void = false;
        try {
          ok = await saveRef.current(id, body);
        } catch {
          ok = false;
        }
        if (ok === false) {
          // Keep it unsaved (unless newer text already replaced it).
          if (!pending.current.has(id)) pending.current.set(id, body);
          break;
        }
      }
    } finally {
      inFlight.current.delete(id);
    }
  }, []);

  const clearTimer = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const flush = useCallback(() => {
    clearTimer();
    for (const id of [...pending.current.keys()]) void saveOne(id);
  }, [saveOne]);

  const queue = useCallback(
    (id: Id, text: string) => {
      pending.current.set(id, text);
      clearTimer();
      timer.current = window.setTimeout(flush, IDEA_AUTOSAVE_MS);
    },
    [flush],
  );

  /** Forget unsaved text for an idea (emptied, reverted or deleted). */
  const cancel = useCallback((id: Id) => {
    pending.current.delete(id);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const dirty = pending.current.size > 0 || inFlight.current.size > 0 || alsoDirtyRef.current();
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    // Hidden tab (switch, mobile background) is the last event we reliably get
    // before a close, so save then.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // Unmount (route change): React fires no blur, so save what's waiting now.
      flush();
    };
  }, [flush]);

  return { queue, flush, cancel };
}
