import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The always-on title editor for chapter and scene rows on the grand outline.
 *
 * Unlike the old double-click `InlineEdit`, this is *always* an input — it reads
 * as plain heading text at rest and lights up on focus/hover. That kills "dead
 * air": a click anywhere in the row lands on a focusable target, and editing is
 * a single click. The field carries the `data-ol-*` markers the document-order
 * focus walk (`stepOutlineField`) and the selection effect rely on.
 *
 * It owns only transient editing state (a local draft + a debounced flush) so
 * model re-renders during the debounce window never reset the field or steal the
 * caret. The data lives in the caller (optimistic update + persistence via
 * `onSave`). The keyboard contract mirrors beats where it makes sense:
 *   · Enter            → add a child at the end and focus it (caller's onEnter)
 *   · Backspace-empty  → nothing (titles never self-delete; only beats do)
 *   · ↑/↓              → handled by the tree-level handler, not here (bubbles up)
 */

interface OutlineFieldInputProps {
  value: string;
  placeholder?: string;
  className?: string;
  /** 'act' | 'chapter' | 'scene' — drives the data-ol-kind marker. */
  kind: 'act' | 'chapter' | 'scene';
  /** This item's id (act / chapter / scene id). */
  itemId: string;
  /** Owning chapter id (same as itemId for a chapter row). */
  chapId: string;
  /** Scene id — only for scene rows. */
  sceneId?: string;
  /** Debounced persist of the edited title. */
  onSave: (text: string) => void;
  /** Enter — "add a child at the end and focus it". */
  onEnter: () => void;
  /** Focus/click — "this item is now the active chapter/scene" (URL select). */
  onFocusField: () => void;
}

export function OutlineFieldInput({
  value,
  placeholder,
  className,
  kind,
  itemId,
  chapId,
  sceneId,
  onSave,
  onEnter,
  onFocusField,
}: OutlineFieldInputProps) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const savedRef = useRef(value);
  const timerRef = useRef<any>(null);

  // Keep showing the model value while unfocused (e.g. an AI edit renames the
  // chapter); never override the field mid-edit.
  useEffect(() => {
    if (!focusedRef.current && value !== draftRef.current) {
      setDraft(value);
      savedRef.current = value;
    }
  }, [value]);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };
  useEffect(() => () => clearTimer(), []);

  const flush = useCallback(() => {
    clearTimer();
    const text = draftRef.current.trim();
    if (text === savedRef.current) return;
    savedRef.current = text;
    onSave(text);
  }, [onSave]);

  const scheduleSave = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(flush, 500);
  }, [flush]);

  return (
    <input
      data-ol-field=""
      data-ol-kind={kind}
      data-ol-id={itemId}
      data-ol-chap={chapId}
      data-ol-scene={sceneId}
      className={`ol-field-input ${className || ''}`}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      onFocus={() => { focusedRef.current = true; onFocusField(); }}
      onChange={(e) => { setDraft(e.target.value); scheduleSave(); }}
      onBlur={() => { focusedRef.current = false; flush(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          flush();
          onEnter();
          return;
        }
        if (e.key === 'Escape') {
          e.currentTarget.blur();
        }
        // ↑/↓ intentionally bubble to the tree-level nav handler.
        // Backspace on an empty title is a no-op (titles never self-delete).
      }}
    />
  );
}
