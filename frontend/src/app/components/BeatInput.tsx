import { useEffect, useRef } from 'react';

/**
 * The shared beat editor: an auto-growing textarea that turns raw keystrokes
 * into the semantic intents every beat surface needs and emits normal typing
 * via onChange. It owns *only* input mechanics — focus-on-mount, auto-grow, and
 * the key→intent mapping (Enter = add the next beat, Alt+↑/↓ = hop focus,
 * Backspace-on-empty = drop this beat). The surface owns the data: where a new
 * beat goes, how it persists, what the row looks like.
 *
 * This is the seam we cut on: the keyboard contract is identical everywhere, so
 * it lives here once; the row layout and the backend mutation differ per
 * surface, so they stay with the caller. First used by the grand outline's
 * BeatList; the threads cards and chapter rail can drop it into their own rows.
 */

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export interface BeatInputProps {
  /** Live draft text — the caller owns it so re-renders never reset the field. */
  value: string;
  placeholder?: string;
  className?: string;
  /** Gate Backspace-on-empty (e.g. don't drop the only beat in a list). */
  allowDeleteEmpty?: boolean;
  /** Normal typing. */
  onChange: (text: string) => void;
  /** Enter (no shift) — "save and add the next beat below". */
  onEnter: () => void;
  /** Alt+↑/↓ — "hop edit focus to the previous/next beat". */
  onNavigate: (dir: 1 | -1) => void;
  /** Backspace on an empty field — "drop this beat". */
  onDeleteEmpty: () => void;
  onBlur: () => void;
}

export function BeatInput({
  value,
  placeholder = 'Write a beat…',
  className,
  allowDeleteEmpty = true,
  onChange,
  onEnter,
  onNavigate,
  onDeleteEmpty,
  onBlur,
}: BeatInputProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // The textarea only mounts when its beat opens for editing, so focus + grow
  // run once on mount and the cursor lands at the end.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
    el.scrollIntoView({ block: 'nearest' });
    autoGrow(el);
  }, []);

  return (
    <textarea
      ref={(el) => { ref.current = el; autoGrow(el); }}
      className={className}
      rows={1}
      value={value}
      placeholder={placeholder}
      spellCheck
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { onChange(e.target.value); autoGrow(e.currentTarget); }}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onEnter();
          return;
        }
        if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault();
          onNavigate(e.key === 'ArrowDown' ? 1 : -1);
          return;
        }
        if (e.key === 'Backspace' && e.currentTarget.value === '' && allowDeleteEmpty) {
          e.preventDefault();
          onDeleteEmpty();
        }
      }}
    />
  );
}
