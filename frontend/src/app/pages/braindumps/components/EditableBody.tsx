/**
 * EditableBody — inline click-to-edit on an braindump's body.
 *
 * Click → contentEditable. Enter saves (no shift), Esc cancels, blur saves.
 * While editing, the parent item gets draggable=false (caller's job) so a
 * text selection doesn't accidentally start a drag.
 *
 * Renders the static body through `renderQuotedItalics` so a quoted phrase
 * inside still pulls italics; in edit mode we render plain text (writing
 * inside <em> tags would be more annoying than helpful).
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderQuotedItalics } from './TagRow';
import { displayTag } from './typedTags';
import { cn } from '../../../lib/utils';
import { Button } from '../../../ui';

// One AI-extracted phrase, with the pack it belongs to. Used to underline the
// phrase inside the body and reveal its pack + tags on hover.
type PhraseMark = { text: string; tags: string[]; packLabel: string };

/* Find each phrase inside the body — case- and whitespace-tolerant (the LLM
 * "preserves wording" but spacing/case drift), first occurrence only, no
 * overlaps. Phrases that can't be located are simply skipped ("if you can find
 * the phrase…"). Returns accepted match ranges in document order. */
function buildPhraseMatches(body: string, phrases: PhraseMark[]) {
  const matches: { start: number; end: number; mark: PhraseMark }[] = [];
  for (const p of phrases) {
    const needle = (p.text || '').trim();
    if (needle.length < 4) continue;
    const pat = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    let re: RegExp;
    try {
      re = new RegExp(pat, 'i');
    } catch {
      continue;
    }
    const m = re.exec(body);
    if (m && m[0]) matches.push({ start: m.index, end: m.index + m[0].length, mark: p });
  }
  // Longest-first at a tie so a bigger phrase wins the slot; then drop overlaps.
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      out.push(m);
      lastEnd = m.end;
    }
  }
  return out;
}

const normPhrase = (s: string) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function renderBody(body: string, phrases?: PhraseMark[], highlightText?: string): any {
  if (!phrases || !phrases.length) return renderQuotedItalics(body);
  const matches = buildPhraseMatches(body, phrases);
  if (!matches.length) return renderQuotedItalics(body);
  const focusNorm = normPhrase(highlightText || '');
  const nodes: any[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) {
      nodes.push(<Fragment key={`t${i}`}>{renderQuotedItalics(body.slice(cursor, m.start))}</Fragment>);
    }
    const tags = m.mark.tags || [];
    const focused = focusNorm.length > 0 && normPhrase(m.mark.text) === focusNorm;
    nodes.push(
      <span className={cn('underline decoration-dotted decoration-amber-500/50 cursor-help relative group/tip', focused && 'bg-amber-100 dark:bg-amber-950/40 rounded px-0.5')} key={`h${i}`}>
        {body.slice(m.start, m.end)}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/tip:flex flex-col gap-1 p-2 bg-popover text-popover-foreground text-xs rounded shadow border z-50 whitespace-nowrap" contentEditable={false}>
          <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">{m.mark.packLabel}</span>
          {tags.length > 0 && <span className="text-[11px]">{tags.map(displayTag).join(' · ')}</span>}
        </span>
      </span>,
    );
    cursor = m.end;
  });
  if (cursor < body.length) {
    nodes.push(<Fragment key="tend">{renderQuotedItalics(body.slice(cursor))}</Fragment>);
  }
  return nodes;
}

export function EditableBody({
  body,
  onSave,
  onEditingChange,
  className = 'body',
  collapsible = false,
  phrases,
  highlightText,
}: {
  body: string;
  onSave: (next: string) => Promise<boolean | void> | boolean | void;
  onEditingChange?: (editing: boolean) => void;
  className?: string;
  // When true, a long body is clamped with a "see more" / "see less" toggle.
  // Stream view opts in; the canvas cards stay free-flowing.
  collapsible?: boolean;
  // AI-extracted phrases to underline in the body (hover → pack + tags). Optional.
  phrases?: PhraseMark[];
  // When set, the phrase mark whose text matches gets an `is-focused` highlight
  // (rail phrase click → focus the idea + spotlight that phrase).
  highlightText?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  // A long body is clamped only while collapsed (not editing, not expanded).
  const clamped = collapsible && !editing && !expanded;

  // Notify parent so it can drop draggable while we're inside the field.
  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  // Measure overflow while clamped so we know whether to offer "see more".
  // Skipped when expanded/editing so the flag survives the expanded state.
  useLayoutEffect(() => {
    if (!clamped) return;
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 2);
  }, [body, clamped]);

  function enterEdit() {
    if (editing) return;
    setEditing(true);
    // Defer focus to after the contentEditable attribute lands on the node.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.innerText = body;
      el.focus();
      // Place caret at the end so the writer can keep typing.
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  }

  async function commit() {
    if (!editing) return;
    const next = (ref.current?.innerText || '').trim();
    if (!next || next === body) {
      // Empty or unchanged — back out of edit mode without a write.
      if (ref.current) ref.current.innerText = body;
      setEditing(false);
      return;
    }
    const ok = await onSave(next);
    if (ok === false) {
      // Save failed — restore the original text.
      if (ref.current) ref.current.innerText = body;
    }
    setEditing(false);
  }

  function cancel() {
    if (ref.current) ref.current.innerText = body;
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  return (
    <>
      <p
        // Key on the mode so React fully remounts the node at each edit
        // boundary. Otherwise the manual `el.innerText = body` (edit mode) and
        // React-rendered children (view mode) co-own this node: React loses
        // track of the innerText text node and, on exit, appends the rendered
        // body after it — duplicating the whole text at the end.
        key={editing ? 'edit' : 'view'}
        ref={ref}
        className={cn(className, clamped && 'line-clamp-3', editing && 'outline-none border-b border-border')}
        contentEditable={editing}
        suppressContentEditableWarning
        onClick={enterEdit}
        onBlur={() => void commit()}
        onKeyDown={onKeyDown}
        title={editing ? '' : 'click to edit'}
      >
        {editing ? null : renderBody(body, phrases, highlightText)}
      </p>
      {collapsible && !editing && (overflowing || expanded) && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground mt-1 justify-start font-medium"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? 'see less' : 'see more'}
        </Button>
      )}
    </>
  );
}

/**
 * PinStar — click to toggle pinned. Sits in the card's action column, beside + tag.
 */
export function PinStar({
  pinned,
  onToggle,
  className = '',
}: {
  pinned: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={pinned ? 'unpin' : 'pin'}
      aria-label={pinned ? 'unpin' : 'pin'}
      aria-pressed={pinned}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-[3px] leading-none transition-opacity',
        pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-70',
        className
      )}
      style={{
        fontSize: 15,
        color: pinned ? 'var(--gold)' : 'var(--ink-4)',
        filter: pinned
          ? 'drop-shadow(0 0 3px color-mix(in srgb, var(--gold) 40%, transparent))'
          : undefined,
      }}
    >
      {pinned ? '★' : '☆'}
    </button>
  );
}
