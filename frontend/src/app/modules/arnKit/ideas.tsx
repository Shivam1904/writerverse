import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Tooltip } from '../../ui';
import { PhraseParagraph } from '../../ui/phrase';
import { cn } from '../../lib/utils';
import { useArn } from './useArnKit';
import { useArnUiStore } from './useArnUi';
import { useArnIdeas } from './useArnIdeas';

/* arnKit idea atoms — the "from your braindumps" box, as a button/box pair keyed
 * by the node's ARN (the same shape the lens uses: <ArnLensButton> toggles,
 * <ArnLensReport> renders). The button is a lightbulb + count; the box renders
 * the resolved phrases. Both self-resolve their phrases from the ARN registry's
 * ideaTags via useArnIdeas — the page passes nothing but the node + entity.
 *
 * Selection is captured locally; what to do with the selection is deferred. */

export interface ArnIdeaNodeProps {
  section: string;
  sub?: string;
  item?: string;
  /** the entity (character) whose mentions scope the phrases. */
  entity?: any;
  /** story-level box (the lenses themes) — skip the entity-mention filter. */
  storyScoped?: boolean;
  /** hide the whole affordance (the studio's global "show ideas" master toggle). */
  hidden?: boolean;
}

const CAT_DOT: Record<string, string> = {
  Character: 'var(--terra)',
  Dialogue: 'var(--gold)',
  World: 'var(--sage)',
  Theme: 'var(--clay)',
  Plot: 'var(--ink-3)',
};

/* ── the lightbulb toggle — count of braindump ideas for this node; click toggles
 *    the box. Hidden when the node has no ideas (mirrors the old strip's null). */
export function ArnIdeaButton({ section, sub, item, entity, storyScoped, hidden }: ArnIdeaNodeProps) {
  const arn = useArn({ section, sub, item });
  const { count } = useArnIdeas({ section, sub, item, entity, storyScoped });
  const open = useArnUiStore((s) => !!s.ideasOpen[arn]);
  const toggleIdeas = useArnUiStore((s) => s.toggleIdeas);
  if (hidden || count === 0) return null;
  return (
    <Tooltip content={`${count} idea${count === 1 ? '' : 's'} from your braindumps`}>
      <button
        type="button"
        aria-label={`${count} ideas from your braindumps`}
        aria-pressed={open}
        onClick={(e) => { e.stopPropagation(); toggleIdeas(arn); }}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors',
          open ? 'text-[var(--gold)]' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Lightbulb size={13} strokeWidth={2} />
        <span className="font-sans text-[10px] font-bold tabular-nums">{count}</span>
      </button>
    </Tooltip>
  );
}

/* ── the idea box (body slot) — renders the resolved phrases when open. Phrases
 *    are selectable (click toggles a highlight); the selection action is deferred. */
export function ArnIdeaBox({ section, sub, item, entity, storyScoped, hidden }: ArnIdeaNodeProps) {
  const arn = useArn({ section, sub, item });
  const { ideas } = useArnIdeas({ section, sub, item, entity, storyScoped });
  const open = useArnUiStore((s) => !!s.ideasOpen[arn]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (hidden || !open || ideas.length === 0) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="mb-2.5">
      {/* <div className="mb-2 font-sans text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {ideas.length} from your braindumps
      </div> */}
      <PhraseParagraph
        phrases={ideas.map((idea) => ({
          text: idea.text,
          dot: CAT_DOT[idea.cat] || 'var(--ink-3)',
          selected: selected.has(idea.id),
          selectable: true,
          onClick: () => toggle(idea.id),
        }))}
      />
    </div>
  );
}
