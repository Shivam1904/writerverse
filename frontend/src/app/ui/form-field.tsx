import * as React from 'react';
import { cn } from '../lib/utils';
import { autoGrow } from './beat-field';

/**
 * Field — the inline-edit form field (character-studio FieldEdit, kit version).
 * Three states:
 *   normal       — the value renders in place; click → a transparent, auto-growing
 *                  field (expands with text, never clamped).
 *   placeholder  — empty: an italic "＋ add <label>" (labeled) or "— prompt" (inline).
 *   suggest      — a pending `proposed` turns it GREEN; accept/reject sit absolute
 *                  at the top-right (so accepting/rejecting never shifts the field).
 * `inline` drops the label and renders within a sentence (a madlibs blank).
 * `actionsAfter` puts ✓ / ✗ right after the value in the text flow instead of
 * floating them above it — for stacked rows, where "above" is the row before.
 */
export type FieldProposal = {
  value: string;
  onEdit?: (next: string) => void;
  onAccept?: (final: string) => void;
  onReject?: () => void;
  /** What the suggestion is for ("synopsis"), so ✓ / ✗ are named for screen
   *  readers: "Accept AI synopsis" / "Dismiss AI synopsis". */
  name?: string;
};

export function Field({
  label, value, placeholder, inline, proposed, onCommit, addLabel, className, actionsAfter,
}: {
  label?: React.ReactNode;
  value: string;
  placeholder?: string;
  inline?: boolean;
  proposed?: FieldProposal;
  onCommit?: (next: string) => void;
  addLabel?: string;
  className?: string;
  actionsAfter?: boolean;
}) {
  const active = !!proposed;
  const base = active ? (proposed!.value ?? '') : value;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(base);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => { if (!editing) setDraft(base); }, [base, editing]);
  React.useEffect(() => {
    if (editing && taRef.current) autoGrow(taRef.current);
  }, [editing, draft]);

  const save = (v: string) => (active ? proposed!.onEdit?.(v) : onCommit?.(v));
  const commit = () => { setEditing(false); if (draft !== base) save(draft); };
  const begin = (e: React.MouseEvent) => { e.stopPropagation(); setDraft(base); setEditing(true); };

  const emptyText = inline
    ? `— ${placeholder ?? 'fill'}`
    : (addLabel ?? `＋ add ${typeof label === 'string' ? label.toLowerCase() : '…'}`);

  let body: React.ReactNode;
  if (editing) {
    const common: any = {
      className: cn('kit-field-input', inline && 'kit-field-input--inline', active && 'is-proposed'),
      value: draft,
      autoFocus: true,
      placeholder,
      spellCheck: false,
      onChange: (e: any) => setDraft(e.target.value),
      onBlur: commit,
      onClick: (e: any) => e.stopPropagation(),
      onKeyDown: (e: any) => {
        if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setDraft(base); }
        if (e.key === 'Enter' && (inline || e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
      },
    };
    body = <textarea ref={taRef} rows={1} {...common} />;
  } else if (active) {
    body = <span className="kit-field-val is-proposed" onClick={begin} title="Click to edit">{base || placeholder || '—'}</span>;
  } else if (value) {
    body = <span className="kit-field-val" onClick={begin} title="Click to edit">{value}</span>;
  } else {
    body = <span className="kit-field-gap" onClick={begin} title="Click to add">{emptyText}</span>;
  }

  // Accept/reject are SEPARATE from the field — absolute in the container's
  // top-right corner — so the field's only difference when proposed is the green
  // tint, and accepting (green + buttons gone) never reflows the text.
  const what = proposed?.name ? ` AI ${proposed.name}` : '';
  const acts = active ? (
    <span className={actionsAfter ? 'ml-1.5 inline-flex items-center gap-0.5 align-middle' : 'kit-prop-acts'}>
      <button type="button" className="kit-prop-no" title="Reject" aria-label={what ? `Dismiss${what}` : undefined} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); proposed!.onReject?.(); }}>✗</button>
      <button type="button" className="kit-prop-yes" title="Accept" aria-label={what ? `Accept${what}` : undefined} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); proposed!.onAccept?.(draft); }}>✓</button>
    </span>
  ) : null;

  if (inline) return <span className={cn('kit-field--inline', className)}>{body}{acts}</span>;
  return (
    <div className={cn('kit-field', className)}>
      {label && <div className="kit-field-lbl">{label}</div>}
      {body}
      {acts}
    </div>
  );
}
