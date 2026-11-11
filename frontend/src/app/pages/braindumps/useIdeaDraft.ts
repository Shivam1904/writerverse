import { useCallback, useEffect, useRef, useState } from 'react';

/** Where a project's unsent "new idea" text is kept on this device. */
export const ideaDraftKey = (projectId: string | undefined) =>
  projectId ? `wv:idea-draft:${projectId}` : undefined;

function readDraft(key: string | undefined): string {
  if (!key) return '';
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

/** Returns false when the browser would not store it (private mode, full). */
function writeDraft(key: string | undefined, text: string): boolean {
  if (!key) return false;
  try {
    if (text.trim()) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * useIdeaDraft — the text of a "new idea" box that hasn't been sent yet (the
 * Ideas page's top composer and the first-run brain-dump box share it).
 *
 * The text is kept on this device (localStorage, one draft per project) as the
 * author types, and comes back when the page opens again. Nothing is created
 * on the server until the author presses Enter: creating an idea starts AI
 * tagging, so a half-typed line must never become an idea on its own.
 *
 * If the browser refuses to store the draft, closing or reloading the tab
 * asks to confirm while there's text in the box (the same "leave this page?"
 * guard the Write page uses). When the draft is stored, nothing would be lost,
 * so there's no prompt.
 *
 * Call `clear()` once the idea is sent.
 */
export function useIdeaDraft(key: string | undefined) {
  const [text, setTextState] = useState(() => readDraft(key));
  const unstored = useRef(false); // text in the box that storage refused

  // Another project's page reuses this component: show that project's draft.
  const shownKey = useRef(key);
  useEffect(() => {
    if (shownKey.current === key) return;
    shownKey.current = key;
    unstored.current = false;
    setTextState(readDraft(key));
  }, [key]);

  const setText = useCallback(
    (next: string) => {
      setTextState(next);
      unstored.current = !writeDraft(key, next) && next.trim() !== '';
    },
    [key],
  );

  const clear = useCallback(() => setText(''), [setText]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!unstored.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return { text, setText, clear };
}
