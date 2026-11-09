import * as React from 'react';
import { ChevronRight, Lightbulb } from 'lucide-react';
import { cn } from '../lib/utils';
import { Chip } from './chip';
import { EntityDot } from './marks';

export interface PhraseTag {
  label: string;
  /** optional tiny colour dot (entity/idea colour) */
  dot?: string;
}

/** Bold the first two words (a scannable lede, so the list reads as ideas). */
function renderLead(children: React.ReactNode): React.ReactNode {
  if (typeof children !== 'string') return children;
  const words = children.trim().split(/\s+/);
  if (words.length <= 2) return <b className="kit-phrase-lead">{children}</b>;
  return (
    <>
      <b className="kit-phrase-lead">{words.slice(0, 2).join(' ')}</b>{' '}
      {words.slice(2).join(' ')}
    </>
  );
}

/** A muted, tight chevron toggle that does not draw attention. */
function TagToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" className="kit-phrase-toggle" aria-expanded={open} aria-label="tags" onClick={onClick}>
      <ChevronRight size={10} strokeWidth={2} className={cn('transition-transform', open && 'rotate-90')} />
    </button>
  );
}

function InsideTags({
  tags, onRemoveTag, inline,
}: { tags: PhraseTag[]; onRemoveTag?: (l: string) => void; inline?: boolean }) {
  return (
    <span className={inline ? 'kit-phrase-tags-inline' : 'kit-phrase-tags'}>
      {tags.map((t) => (
        <Chip key={t.label} variant="inside" size="xs" dot={t.dot} onRemove={onRemoveTag ? () => onRemoveTag(t.label) : () => { }}>
          {t.label}
        </Chip>
      ))}
    </span>
  );
}

/**
 * Phrase — a single phrase / half-sentence (serif, bold lede) for grid or
 * one-line `clamp` lists. Carries an expandable inside-tag chip list (collapsed).
 */
export function Phrase({
  children, tags, clamp, defaultOpen = false, onRemoveTag, className, dot,
}: {
  children: React.ReactNode;
  tags?: PhraseTag[];
  clamp?: boolean;
  defaultOpen?: boolean;
  onRemoveTag?: (label: string) => void;
  className?: string;
  dot?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const hasTags = !!tags && tags.length > 0;
  return (
    <div className={cn('kit-phrase', clamp && 'is-clamp', className)}>
      <div className="flex items-baseline gap-1">
        {dot && <EntityDot color={dot} className="mr-1.5 shrink-0" />}
        <span className="kit-phrase-tx">{renderLead(children)}</span>
        {hasTags && <TagToggle open={open} onClick={() => setOpen((o) => !o)} />}
      </div>
      {hasTags && open && <InsideTags tags={tags!} onRemoveTag={onRemoveTag} />}
    </div>
  );
}

/** One phrase inside a paragraph: lead + rest + inline (collapsed) tag list. */
function ParaPhrase({
  text, tags, onRemoveTag, dot, selected, onClick,
}: {
  text: string;
  tags?: PhraseTag[];
  onRemoveTag?: (l: string) => void;
  dot?: string;
  selected?: boolean;
  onClick?: () => void;
  selectable?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const hasTags = !!tags && tags.length > 0;
  const clickable = !!onClick;

  const handleClick = (e: React.MouseEvent) => {
    if (clickable) {
      const target = e.target as HTMLElement;
      if (target.closest('.kit-phrase-toggle') || target.closest('.kit-chip-inside')) {
        return;
      }
      onClick();
    }
  };

  return (
    <span
      className={cn(
        'kit-phrase-piece inline items-center rounded-[var(--r-xs)] px-1 py-0.5 transition-colors select-none',
        clickable && 'cursor-pointer hover:bg-secondary/40',
        selected && 'bg-secondary/60 text-foreground'
      )}
      onClick={handleClick}
    >
      {/* {selectable && (
        <span className="inline-flex align-middle mr-1">
          <Checkbox
            checked={!!selected}
            onChange={() => { }}
            round
            className="h-3.5 w-3.5 pointer-events-none"
          />
        </span>
      )} */}

      {(
        <span className="inline-flex align-middle mr-1">
          <Lightbulb size={10} strokeWidth={2.5} className="pointer-events-none align-center mb-0.5" />
        </span>
      )}
      {dot && (
        <span className="inline-flex align-middle mr-1.5">
          <EntityDot color={dot} className="shrink-0" />
        </span>
      )}
      <span className={`kit-phrase-tx inline ${selected ? 'bg-secondary rounded-[var(--r-xs)] px-1 py-0.5' : ''}`}>
        {renderLead(text)}
      </span>
      {hasTags && <TagToggle open={open} onClick={() => setOpen((o) => !o)} />}
      {hasTags && open && <InsideTags tags={tags!} onRemoveTag={onRemoveTag} inline />}
    </span>
  );
}

/**
 * PhraseParagraph — the whole phrase LIST forms a single paragraph, phrases
 * separated by an ellipsis. Each phrase keeps its bold lede + its own collapsed
 * inside-tag list.
 */
export function PhraseParagraph({
  phrases, onRemoveTag, className,
}: {
  phrases: {
    text: string;
    tags?: PhraseTag[];
    dot?: string;
    selected?: boolean;
    onClick?: () => void;
    selectable?: boolean;
  }[];
  onRemoveTag?: (label: string) => void;
  className?: string;
}) {
  return (
    <p className={cn('kit-phrase-para', className)}>
      {phrases.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="kit-phrase-sep"> … </span>}
          <ParaPhrase
            text={p.text}
            tags={p.tags}
            onRemoveTag={onRemoveTag}
            // dot={p.dot}
            selected={p.selected}
            onClick={p.onClick}
            selectable={p.selectable}
          />
        </React.Fragment>
      ))}
    </p>
  );
}
