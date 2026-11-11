import { useCallback, useEffect, useRef, useState } from 'react';

/* ============================================================================
 * FieldEdit — the one inline-editor primitive used across the character studio.
 *
 * Resting state: the value renders in place (a span / p / h2 / blockquote);
 * a single click swaps it for an input or auto-growing textarea right where
 * the value lives. Commit on blur (and Enter for single-line / Cmd-Enter for
 * multi-line); Escape reverts. There is no form, no Save button — each field
 * persists itself via `onCommit`.
 *
 * Extracted verbatim from StudioHero (2026-06-08) so Identity / Arc / Voice all
 * share ONE editor and the green "proposed field" treatment stays identical.
 * ========================================================================== */

// A pending AI proposal for this field. In proposal mode the SAME field turns
// green and shows the proposed value; editing + blur saves the edit back into the
// proposal (onEdit, still pending); ✓ promotes it to the actual field, ✗ drops it.
export type FieldProposal = {
  value: string;
  onEdit: (next: string) => void;
  onAccept: (final: string) => void;
  onReject: () => void;
};

export function FieldEdit({
  value,
  onCommit,
  multiline = false,
  placeholder,
  restTag = 'span',
  restClassName,
  restNode,
  editClassName,
  title = 'Click to edit',
  stop = false,
  proposed,
}: {
  value: string;
  // May return a promise: while it is pending the field stays open, and a
  // rejection (or a resolved `false`) counts as a failed save.
  onCommit: (next: string) => unknown;
  multiline?: boolean;
  placeholder?: string;
  restTag?: 'span' | 'p' | 'h2' | 'blockquote';
  restClassName?: string;
  restNode?: any;
  editClassName?: string;
  title?: string;
  stop?: boolean;
  proposed?: FieldProposal;
}) {
  const active = !!proposed;
  // In proposal mode the field reflects/edits the PROPOSED value, and the blur-save
  // routes into the proposal (not the Character). Otherwise it's a plain field.
  const baseValue = active ? (proposed!.value ?? '') : value;
  const saveOnBlur: (next: string) => unknown = active ? proposed!.onEdit : onCommit;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(baseValue);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Keep the draft in sync with upstream changes while not actively editing.
  useEffect(() => { if (!editing) setDraft(baseValue); }, [baseValue, editing]);

  // Auto-grow the textarea to its content while editing (fully expands on focus).
  useEffect(() => {
    if (editing && multiline && taRef.current) {
      const el = taRef.current;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing, multiline, draft]);

  const begin = useCallback((e: React.MouseEvent) => {
    if (stop) e.stopPropagation();
    setDraft(baseValue);
    setFailed(false);
    setEditing(true);
  }, [stop, baseValue]);

  // Stay in edit mode until the save resolves, so the draft is never reset to the
  // old server value. A failed save (rejected promise or `false`) keeps the typed
  // text and shows an error; blurring / Enter again retries, Escape discards.
  const commit = useCallback(async () => {
    if (saving) return;
    if ((draft ?? '') === (baseValue ?? '')) { setEditing(false); return; }
    setSaving(true);
    try {
      const result = await saveOnBlur(draft);
      if (result === false) throw new Error('save failed');
      setFailed(false);
      setEditing(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }, [draft, baseValue, saveOnBlur, saving]);

  const cancel = useCallback(() => {
    setEditing(false); setFailed(false); setDraft(baseValue);
  }, [baseValue]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
  };
  const focusEnd = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();
    const n = el.value.length;
    try { el.setSelectionRange(n, n); } catch { /* number/email inputs throw; ignore */ }
  };

  // The field itself — editing input/textarea, or the click-to-edit display. A
  // pending proposal just adds the `is-proposed` green modifier to whichever.
  const greenCls = active ? ' is-proposed' : '';
  let field: any;
  if (editing) {
    field = multiline ? (
      <textarea
        ref={(el) => { taRef.current = el; }}
        className={`${editClassName ?? ''}${greenCls}`}
        value={draft}
        onClick={(e) => { if (stop) e.stopPropagation(); }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        readOnly={saving}
        rows={1}
        autoFocus
        placeholder={placeholder}
        onFocus={(e) => focusEnd(e.currentTarget)}
      />
    ) : (
      <input
        className={`${editClassName ?? ''}${greenCls}`}
        value={draft}
        autoFocus
        onClick={(e) => { if (stop) e.stopPropagation(); }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        readOnly={saving}
        onFocus={(e) => focusEnd(e.currentTarget)}
        spellCheck={false}
        placeholder={placeholder}
      />
    );
  } else {
    const props: any = { className: `${restClassName ?? ''}${greenCls}`, onClick: begin, title };
    // In proposal mode the display shows the proposed value (not the saved one).
    const body = active ? (baseValue || placeholder || '—') : (restNode ?? (value || placeholder || '—'));
    field = restTag === 'p' ? <p {...props}>{body}</p>
      : restTag === 'h2' ? <h2 {...props}>{body}</h2>
        : restTag === 'blockquote' ? <blockquote {...props}>{body}</blockquote>
          : <span {...props}>{body}</span>;
  }

  if (editing && failed) {
    field = (
      <>
        {field}
        <span role="alert" className="block text-[12px] text-[var(--clay)]">
          Couldn't save. Your text is still here; click in the box, then press Enter or click away to try again.
        </span>
      </>
    );
  }

  if (!active) return field;

  // Proposal mode: the green field + ✓ accept / ✗ reject. `onMouseDown` prevents
  // the field's blur-save from firing before the click (no save→accept race).
  // Block fields (p/blockquote) get `cst-prop--block`: studio.css makes the green
  // span the full committed-field width (no clamp) so accepting never reflows the
  // text. The class is inert outside `.cst2-root` (World keeps its own cst-prop).
  const blockField = restTag === 'p' || restTag === 'blockquote';
  return (
    <span className={`cst-prop${blockField ? ' cst-prop--block' : ''}`}>
      {field}
      <span className="cst-prop-actions">
        <button type="button" className="cst-prop-no" title="Reject"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); proposed!.onReject(); }}>✗</button>
        <button type="button" className="cst-prop-yes" title="Accept"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); proposed!.onAccept(draft); }}>✓</button>
      </span>
    </span>
  );
}
