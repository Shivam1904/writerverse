import { useRef, useState } from 'react';

/**
 * Double-click-to-edit text span, shared by the grand-outline page and the
 * chapter rail. Commits on Enter / blur, cancels on Escape. When `html` is set
 * the value may carry inline markup: it is shown as plain text (tags stripped),
 * never injected as HTML.
 */

function stripHtml(s: string): string {
  // DOMParser builds an inert document: no scripts run, no images load.
  return new DOMParser().parseFromString(s, 'text/html').body.textContent || '';
}

export interface InlineEditProps {
  value: string;
  itemType: string;
  itemId: string;
  onUpdate: (itemType: string, itemId: string, fields: { text?: string; kind?: string }) => void;
  className?: string;
  placeholder?: string;
  html?: boolean;
}

export function InlineEdit({ value, itemType, itemId, onUpdate, className, placeholder, html }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!editing) {
    const props: any = {
      className: `${className || ''} ot-editable`,
      onDoubleClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        setDraft(stripHtml(value));
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      },
      title: 'Double-click to edit',
    };
    const shown = html && value ? stripHtml(value) : value;
    return <span {...props}>{shown || placeholder || '—'}</span>;
  }

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onUpdate(itemType, itemId, { text: draft.trim() });
  };

  return (
    <input
      ref={inputRef}
      className={`ot-inline-input ${className || ''}`}
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      autoFocus
    />
  );
}
