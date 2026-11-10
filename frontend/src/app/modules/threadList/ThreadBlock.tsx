import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, MoreHorizontal, LucideMerge, SlidersHorizontal } from 'lucide-react';
import { ThreadBeats } from './ThreadBeats';
import { SectionMarker } from '../sectionMarker';
import { Button, Input, ColorDotPicker } from '../../ui';
import { CHARACTER_COLOR_SHADES, ASPECT_HEX_PALETTE } from '../../theme/aspects';
import { cn } from '../../lib/utils';
import {
  ArnAiRewrite, ArnLensButton, ArnLensReport,
  useArn, useArnUiStore,
} from '../arnKit';
import { useLensStore } from '../lensKit';
import { threadHeading } from '../../pages/threads/components/ThreadRow';
import { GlossyStoryIcon } from '../../components/StoryIconsRegistry';

/* ThreadBlock — one plot thread inside <ThreadsList>. Reusable; presentational
 * for now (reads beats off the passed `thread`). It owns its own view state.
 *
 * Two modes:
 *   · list  — header (the arnKit heading cluster) + the editable beat list
 *   · merge — same editable beat list, but the dot becomes a number and each beat
 *             is a drag source for the grand outline
 *
 * The list-header icons come from the shared arnKit, keyed by this thread's ARN
 * (`<section>:thread:<id>`): a muted info eye, the ghost AI-rewrite diamond, the
 * digital-eye lens indicator (+ its inline attach box), expand/collapse, and the
 * kebab menu. All reveal on hover except the lens once a lens is attached. */

/* The block's kebab menu (rename / edit scope / delete). Lives here, not in arnKit — these are
 * thread concerns, and the menu styling (tl-block-menu / tl-menu-pop) is threadList's.
 * Reveals on hover with the rest of the head unless revealOnHover={false}. */
const MENU_REVEAL = 'opacity-0 transition-opacity duration-150 group-hover/block:opacity-100 focus-within:opacity-100';
type BlockMenuItem = { label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void };

function BlockMenu({ items, revealOnHover = true }: { items: BlockMenuItem[]; revealOnHover?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  if (!items.length) return null;
  return (
    <span className={cn('tl-block-menu', open && 'open', !open && revealOnHover && MENU_REVEAL)} ref={ref} onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn('text-muted-foreground hover:bg-secondary hover:text-foreground', open && 'bg-secondary text-foreground')}
        title="More"
        aria-label="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={15} strokeWidth={1.8} />
      </Button>
      {open && (
        <div className="tl-menu-pop">
          {items.map((it, i) => (
            <button key={i} type="button" className={cn('tl-menu-item', it.danger && 'danger')}
              onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon} {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function ThreadBlock({
  projectId,
  thread,
  focused,
  onFocus,
  onRename,
  onEdit,
  onDelete,
  onColor,
  markerSection,
  externalExpand,
  onWeave,
}: {
  projectId?: string;
  thread: any;
  focused: boolean;
  onFocus: () => void;
  markerSection?: string;
  externalExpand?: boolean;
  onRename?: (id: string, name: string) => void;
  /** Open the Edit-storyline dialog (name + scope) for this thread. */
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Set/clear this thread's colour override ('' clears → derived default). */
  onColor?: (id: string, color: string) => void;
  /** Open the dedicated merge workspace for this thread (the weave button). */
  onWeave?: () => void;
}) {
  // This thread's ARN (`<section>:thread:<id>`, page/id derived from the URL)
  // keys the kit's expand state — the block READS it for its body instead of
  // owning open/closed. Absent on the standalone Threads page (URL has no ARN
  // page + no markerSection), where it falls back to `focused`.
  const node = { section: markerSection ?? '', sub: 'thread' as const, item: thread.id };
  const arn = useArn(node);
  const expanded = useArnUiStore((s) => !!s.expanded[arn]);
  const toggleExpanded = useArnUiStore((s) => s.toggleExpanded);
  const setExpanded = useArnUiStore((s) => s.setExpanded);
  // Analysis mode rides the lens indicator: when the digital-eye lens box is open
  // for this thread's ARN, the beats render in 'analysis' view (red markers +
  // inline contradiction hints from useThreadBeats.contradictionsFor).
  const lensOpen = useLensStore((s) => !!s.open[arn]);

  // Inline rename — the header title swaps to an input (opened from the menu).
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(thread?.name ?? '');
  useEffect(() => { setNameDraft(thread?.name ?? ''); }, [thread?.name]);
  const startRename = () => { setNameDraft(thread?.name ?? ''); setRenaming(true); };
  const commitName = () => {
    setRenaming(false);
    const next = (nameDraft || '').trim();
    if (next && next !== thread?.name) onRename?.(thread.id, next);
    else setNameDraft(thread?.name ?? '');
  };

  const beats: any[] = thread?.beats ?? [];
  const real = beats.filter((b) => b.kind !== 'heading');
  const hasProposal = beats.some((b) => b.proposal != null);
  // the lens stays "Can’t attach" until there's an actual text beat to watch.
  const filled = real.some((b) => String(b.text ?? '').trim().length > 0);

  // Re-key <ThreadBeats> on the pending-proposal signature so a new / accepted /
  // rejected AI beat proposal reseeds it (the green overlay); plain edits don't.
  const propSig = beats
    .filter((b) => b.proposal)
    .map((b) => `${b.id}:${b.proposal.id}`)
    .join('|') || 'none';

  const menuItems: BlockMenuItem[] = [];
  if (onRename) menuItems.push({ label: 'Rename', icon: <Pencil size={13} strokeWidth={1.8} />, onClick: startRename });
  if (onEdit) menuItems.push({ label: 'Change scope', icon: <SlidersHorizontal size={13} strokeWidth={1.8} />, onClick: () => onEdit(thread.id) });
  if (onDelete) menuItems.push({ label: 'Delete', icon: <Trash2 size={13} strokeWidth={1.8} />, danger: true, onClick: () => onDelete(thread.id) });

  // Body open: on an ARN page the kit's per-ARN expand store owns it — UNLESS the
  // list owns multi-open (externalExpand, e.g. Plot Threads' Expand-all), where we
  // follow `focused`. No ARN page → always `focused`.
  const usesStore = !!markerSection && !externalExpand;
  const open = usesStore ? expanded : focused;
  const onHeadClick = () => { onFocus(); if (usesStore) toggleExpanded(arn); };
  // Opening the lens box must always REVEAL the body (the lens report lives inside
  // it) — expand only, never collapse/toggle. The lens indicator stops click
  // propagation, so we catch it on the capture phase before that runs.
  const ensureExpanded = () => { if (usesStore) setExpanded(arn, true); else if (!open) onFocus(); };
  const h = threadHeading(thread.scope);
  const actualColor = thread.color;
  // No scope (older or chat-made threads) reads as a whole-story thread.
  const isStory = !thread.scope || thread.scope.type === 'story';
  return (
    <div id={`thr-block-${thread.id}`} className={`rounded-md border border-[var(--line)]  tl-block group/block${open ? ' is-focused' : ''}`}>
      <div className={`tl-block-head  group/block${open ? ' is-focused' : ''}`} onClick={onHeadClick} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onHeadClick(); } }}>


        {onColor ? (
          <span onClick={(e) => e.stopPropagation()} className="inline-flex align-middle">
            <ColorDotPicker
              color={actualColor}
              value={thread.colorOverride}
              defaultColor={thread.colorDefault}
              palette={CHARACTER_COLOR_SHADES.concat(ASPECT_HEX_PALETTE)}
              onPick={(c) => onColor(thread.id, c)}
              onReset={() => onColor(thread.id, '')}
              size={12}
              title="Thread colour"
            />
          </span>
        ) : (
          <GlossyStoryIcon
            className="inline-flex align-middle"
            iconKey={'thread'}
            title={h?.label ?? 'Story'}
            color={actualColor}
            size={12}
          />
        )}

        {renaming ? (
          <Input
            value={nameDraft}
            wrapClassName="flex-1"
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); commitName(); }
              if (e.key === 'Escape') { setNameDraft(thread?.name ?? ''); setRenaming(false); }
            }}
          />
        ) : (
          <span className="ty-story-caption" style={{ color: actualColor, fontWeight: 700 }}><em>{thread.name}</em></span>
        )}
        <span className="ty-story-caption" style={{ color: 'var(--muted-foreground)' }}>- </span>

        {!isStory ? (<>
          <span className="ty-story-caption" style={{ color: 'var(--accent-foreground)' }}> {thread.scope?.name}'s </span>
          <span className="ty-story-caption" style={{ color: 'var(--muted-foreground)' }}>{thread.scope?.type} thread</span>
        </>) : (<>
          <span className="ty-story-caption" style={{ color: 'var(--accent-foreground)' }}> Story </span>
          <span className="ty-story-caption" style={{ color: 'var(--muted-foreground)' }}>thread</span>
        </>)}

        {markerSection && <SectionMarker section={markerSection} sub="thread" item={thread.id} label={thread.name} />}
        {/* {thread.tag && <span className="tl-block-tag">{thread.tag}</span>} */}
        {/* <span className="tl-block-meta">{covered}/{real.length}</span> */}
        {hasProposal && (
          <span
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lens-green)', display: 'inline-block', marginLeft: 4 }}
            title="Has pending AI suggestions"
          />
        )}
        <span className="tl-spacer" />

        {/* arnKit heading cluster — only where the thread resolves to an ARN (a
            ARN page, e.g. the character studio). Reveal on hover; the
            lens pins open once attached. */}
        {markerSection ? (
          <>
            <ArnAiRewrite {...node} name={thread.name} />
            <span className="inline-flex" onClickCapture={ensureExpanded}>
              <ArnLensButton {...node} name={thread.name} owner={thread.scope?.name} scopeType={thread.scope?.type} filled={filled} />
            </span>
            {onWeave && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                title="Merge this thread into the grand outline"
                onClick={(e) => { e.stopPropagation(); onWeave(); }}>
                <LucideMerge size={12} />
              </Button>
            )}
            {/* <ArnExpand {...node} expanded={open} onToggle={onHeadClick} /> */}
            <BlockMenu items={menuItems} />
          </>
        ) : (
          <BlockMenu items={menuItems} revealOnHover={false} />
        )}
      </div>

      {open && (
        <div className="tl-block-body">
          {markerSection && <ArnLensReport {...node} name={thread.name} owner={thread.scope?.name} scopeType={thread.scope?.type} filled={filled} />}
          <ThreadBeats key={propSig} projectId={projectId} thread={thread} view={lensOpen ? 'analysis' : 'normal'} />
        </div>
      )}
    </div>
  );
}
