import * as React from 'react';

/**
 * BeatField — the ONE always-on beat/line input. A borderless auto-growing
 * textarea that turns raw keystrokes into the shared field-list contract (the
 * same one the braindumps stream uses via useFieldList): the keyboard behaviour
 * lives here once; the row layout, marker, drag and persistence stay with each
 * caller (the kit BeatList, the grand outline, …).
 *
 * Contract:
 *   · Enter             → onEnter ("add the next beat below").
 *   · Shift+Enter       → native newline (not intercepted).
 *   · Backspace (empty) → onDeleteEmpty (gated by allowDeleteEmpty).
 *   · Tab / Shift+Tab   → onCycle(±1) — cycle kind (omit onCycle to disable).
 *   · ArrowDown         → caret moves within the field; at the very END it calls
 *                         onNavigate(1,'start').
 *   · ArrowUp           → at the very START it calls onNavigate(-1,'end').
 *   · Alt+↑/↓           → onNavigate straight to prev/next.
 *   onNavigate returns whether it moved focus; only then is the key prevented.
 *
 * The caller owns `value` (controlled) so re-renders never reset the field.
 */

export type BeatFieldCaret = 'start' | 'end';

export interface BeatFieldProps {
  value: string;
  placeholder?: string;
  className?: string;
  /** Gate Backspace-on-empty (e.g. don't drop the only beat in a list). */
  allowDeleteEmpty?: boolean;
  /** Focus + caret-to-end once on mount (e.g. a freshly added row). */
  autoFocusEnd?: boolean;
  /** Expose the textarea node for external focus management. */
  inputRef?: (el: HTMLTextAreaElement | null) => void;
  onChange: (text: string) => void;
  onEnter: () => void;
  /** Tab — cycle this row's kind. Omit to leave Tab to the browser. */
  onCycle?: (dir: 1 | -1) => void;
  onDeleteEmpty: () => void;
  /** Alt+↑/↓ or a boundary ↑/↓ — hop focus. Return true if handled. */
  onNavigate?: (dir: 1 | -1, caret: BeatFieldCaret) => boolean;
  onBlur?: () => void;
  onFocus?: () => void;
}

export function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  // Never measure at zero width: pre-layout the text wraps one character per
  // line and scrollHeight explodes (observed 24k-px textareas in the braindumps
  // stream), and nothing re-measures until the next edit. Retry after layout.
  if (el.clientWidth === 0) {
    requestAnimationFrame(() => {
      if (el.isConnected && el.clientWidth > 0) autoGrow(el);
    });
    return;
  }
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export function BeatField({
  value, placeholder, className, allowDeleteEmpty = true, autoFocusEnd = false,
  inputRef, onChange, onEnter, onCycle, onDeleteEmpty, onNavigate, onBlur, onFocus,
}: BeatFieldProps) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!autoFocusEnd) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    const n = el.value.length;
    el.setSelectionRange(n, n);
    autoGrow(el);
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <textarea
      ref={(el) => { ref.current = el; autoGrow(el); inputRef?.(el); }}
      className={className}
      rows={1}
      value={value}
      placeholder={placeholder}
      spellCheck
      onChange={(e) => { onChange(e.target.value); autoGrow(e.currentTarget); }}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={(e) => {
        const ta = e.currentTarget;
        const collapsed = ta.selectionStart === ta.selectionEnd;
        if (e.key === 'Tab' && onCycle) { e.preventDefault(); onCycle(e.shiftKey ? -1 : 1); return; }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter(); return; }
        if (e.key === 'Backspace' && ta.value === '' && allowDeleteEmpty) { e.preventDefault(); onDeleteEmpty(); return; }
        if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          if (onNavigate?.(e.key === 'ArrowDown' ? 1 : -1, e.key === 'ArrowDown' ? 'start' : 'end')) e.preventDefault();
          return;
        }
        if (e.key === 'ArrowDown' && collapsed && ta.selectionStart === ta.value.length) {
          if (onNavigate?.(1, 'start')) e.preventDefault();
          return;
        }
        if (e.key === 'ArrowUp' && collapsed && ta.selectionStart === 0) {
          if (onNavigate?.(-1, 'end')) e.preventDefault();
        }
      }}
    />
  );
}
