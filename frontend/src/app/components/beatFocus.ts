import { useEffect } from 'react';

/**
 * The one cross-instance behaviour beat surfaces share that a lone input can't
 * own by itself: Alt+↑/↓ hopping edit focus from the first/last beat of one
 * list into a beat of the *adjacent* list (e.g. the next scene). The target
 * beat isn't a textarea yet — only the editing beat is — so we can't just
 * `.focus()` it. Instead we broadcast its id on the document and the list that
 * owns it opens it for editing (which mounts its <BeatInput>, which focuses on
 * mount). One bus for every surface (outline today; threads cards / chapter
 * rail can adopt the same helpers) so there's a single channel, not one per
 * surface as the old hand-rolled copies had.
 *
 * Every navigable field (chapter title, scene title, beat row) must carry
 * `data-ol-field` for the walk to find neighbours; a beat row additionally
 * carries `data-beat-key="<id>"` so it can be named for the open-signal.
 */

const EDIT_EVENT = 'wv2beat:edit';

/**
 * Hop edit focus to the adjacent FIELD in document order across the whole
 * outline — chapter titles, scene titles and beats are all marked `data-ol-field`
 * and walked as one flat list, so ↑/↓ flows chapter → its scenes → their beats →
 * next chapter, exactly like the visual order. The currently-editing input is the
 * active element when nav fires, so we start the walk from there. Call after
 * flushing the current draft.
 *
 * Title fields are always-mounted inputs → we just `.focus()` the target (its
 * own onFocus syncs the URL selection). A beat field's textarea only mounts when
 * it's open, so when the target is a not-yet-open beat we broadcast its id and
 * the owning <BeatList> opens it (mounting + focusing its <BeatInput>).
 */
export function stepOutlineField(dir: 1 | -1, selector = '[data-ol-field]') {
  const active = document.activeElement as HTMLElement | null;
  const cur = active?.closest(selector);
  if (!cur) return;
  const fields = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const i = fields.indexOf(cur as HTMLElement);
  if (i < 0) return;
  const target = fields[i + dir];
  if (!target) return;

  // A title field IS the input; a beat field is a row that contains one only
  // while it's open. Focus a mounted input directly; otherwise open the beat.
  const input = (target.matches('input, textarea')
    ? target
    : target.querySelector('input, textarea')) as HTMLInputElement | HTMLTextAreaElement | null;
  if (input) {
    input.focus();
    const len = input.value.length;
    try { input.setSelectionRange(len, len); } catch { /* inputs that don't support it */ }
    input.scrollIntoView({ block: 'nearest' });
    return;
  }
  const beatId = target.getAttribute('data-beat-key');
  if (beatId) document.dispatchEvent(new CustomEvent(EDIT_EVENT, { detail: { id: beatId } }));
}

/**
 * Subscribe to the bus. `open(id)` runs when a beat is targeted; `owns(id)`
 * guards so only the list holding that beat reacts. Pass stable callbacks
 * (useCallback) so this subscribes once.
 */
export function useBeatEditSignal(owns: (id: string) => boolean, open: (id: string) => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      if (id && owns(id)) open(id);
    };
    document.addEventListener(EDIT_EVENT, handler as EventListener);
    return () => document.removeEventListener(EDIT_EVENT, handler as EventListener);
  }, [owns, open]);
}
