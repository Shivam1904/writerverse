import { useEffect, useRef } from 'react';
import { Eye, ChevronRight } from 'lucide-react';
import { Button, Spark, Tooltip } from '../../ui';
import { cn } from '../../lib/utils';
import { useChatStore } from '../chat/useChatStore';
import { useLensStore, LensKit, useSectionLensCatalogue, sectionLensFitsNode } from '../lensKit';
import { useArnKit } from './useArnKit';
import { useArnUiStore } from './useArnUi';
import { LensIndicator } from './LensIndicator';
import { GhostDiamond } from './GhostDiamond';

/* arnKit button atoms — the heading cluster a parent drops in PER NODE, naming
 * only the node's ARN parts (section / sub / item). Each atom reads the registry +
 * live state through useArnKit and owns its slice of per-ARN state.
 *
 * CANONICAL CLUSTER ORDER — maintain everywhere a heading shows these (render in
 * this order, skipping any that don't apply):
 *     eye (ArnInfoEye) → diamond (ArnAiRewrite/ai-ask) → lens (ArnLensButton) →
 *     expand (ArnExpand) → menu (BlockMenu/kebab)
 *
 * Reveal-on-hover: every atom hides until the whole node block is hovered (the
 * block must carry the `group/block` class). The lens indicator is the exception —
 * once a lens is attached it stays visible. Pass `revealOnHover={false}` to always
 * show. */

export interface ArnNodeProps {
  section: string;
  sub?: string;
  item?: string;
}

/** Lens / rewrite atoms also take the entity's display name — the one runtime bit
 *  the ARN can't hold (used for the character-lens verdict match + AI prompts). */
type ArnLensNodeProps = ArnNodeProps & { name?: string; owner?: string; scopeType?: string };

const REVEAL = 'opacity-0 transition-opacity duration-150 group-hover/block:opacity-100 focus-within:opacity-100 focus-visible:opacity-100';

function revealCls(reveal: boolean) {
  return reveal ? REVEAL : '';
}

/* ── info eye — muted, non-interactive: "Writerverse reads this for better writing." */
export function ArnInfoEye({ revealOnHover = true }: { revealOnHover?: boolean }) {
  return (
    <Tooltip content="Writerverse reads this for better writing.">
      <span
        className={cn('inline-flex h-5 w-5 items-center justify-center text-muted-foreground/70', revealCls(revealOnHover))}
        aria-label="Writerverse reads this section"
      >
        <Eye className="h-3.5 w-3.5" strokeWidth={1.7} />
      </span>
    </Tooltip>
  );
}

/* ── lens indicator — the digital eye; click toggles the inline lens box. Mode is
 *    derived from (filled? · attached? · verdict). Stays visible once attached. */
export function ArnLensButton({ section, sub, item, name, owner, scopeType, filled = true, revealOnHover = true }: ArnLensNodeProps & { filled?: boolean; revealOnHover?: boolean }) {
  const { arn, lensMode, lensCount, attachedCount, projectId } = useArnKit({ section, sub, item, filled, name, owner, scopeType });
  const toggleOpen = useLensStore((s) => s.toggleOpen);
  // the indicator shows when the section bank has questions for this node, or
  // one's already attached. Bank lenses are page-only — they don't light the eye.
  const sectionFits = useSectionLensCatalogue(projectId).filter((l) => sectionLensFitsNode(l, section, sub)).length;
  if (!attachedCount && sectionFits === 0) return null;
  // attached (any live mode) ⇒ always show; otherwise reveal on hover.
  const pinned = attachedCount > 0;
  return (
    <span className={cn('inline-flex', !pinned && revealCls(revealOnHover))}>
      <LensIndicator
        mode={lensMode}
        count={lensCount}
        onClick={(e) => { e.stopPropagation(); toggleOpen(arn); }}
      />
    </span>
  );
}

/* ── the lens box (body slot) — renders the picker / verdict when the lens is open. */
export function ArnLensReport({ section, sub, item, name, owner, scopeType, filled = true }: ArnLensNodeProps & { filled?: boolean }) {
  const { arn, label, scope, projectId } = useArnKit({ section, sub, item, filled, name, owner, scopeType });
  const open = useLensStore((s) => !!s.open[arn]);
  if (!open) return null;
  // arn uses a SUBSET of the lens kit — the section slice; it sources its own
  // catalogue (section bank + main bank), fed the scope + section/sub arn derived.
  return <div className="sl-report"><LensKit type="section" arn={arn} label={label} scope={scope} projectId={projectId} section={section} sub={sub} /></div>;
}

/* ── ghost AI diamond → expand-in-place rewrite input. Closed = the quiet ghost
 *    spark; click opens a small (optional) input with a Rewrite button; submit
 *    seeds Night Eyes scoped to this node. */
export function ArnAiRewrite({ section, sub, item, name, revealOnHover = true }: ArnLensNodeProps & { revealOnHover?: boolean }) {
  const { arn, label } = useArnKit({ section, sub, item, name });
  // the kit seeds + opens Night Eyes itself — the parent isn't involved.
  const setSeed = useChatStore((s) => s.setSeed);
  const openChat = useChatStore((s) => s.open);
  const open = useArnUiStore((s) => !!s.rewrite[arn]?.open);
  const draft = useArnUiStore((s) => s.rewrite[arn]?.draft ?? '');
  const openRewrite = useArnUiStore((s) => s.openRewrite);
  const closeRewrite = useArnUiStore((s) => s.closeRewrite);
  const setDraft = useArnUiStore((s) => s.setDraft);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const submit = () => {
    const who = name ? ` “${name}”` : '';
    const text = draft.trim();
    const prompt = text
      ? `Let's rewrite the ${label.toLowerCase()}${who}: ${text}`
      : `Let's rewrite the ${label.toLowerCase()}${who} — what's working, what to sharpen, and a stronger version.`;
    setSeed(prompt);
    openChat();
    closeRewrite(arn);
  };

  if (!open) {
    return (
      <span className={cn('inline-flex', revealCls(revealOnHover))}>
        <GhostDiamond
          state="quiet"
          size={24}
          title="Rewrite with Night Eyes"
          onClick={(e) => { e.stopPropagation(); openRewrite(arn); }}
        />
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-input bg-[var(--surface)] pl-3 pr-1 py-0.5 focus-within:border-[var(--gold)]"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(arn, e.target.value)}
        placeholder="special instructions"
        className="w-32 bg-transparent font-serif text-[12.5px] text-foreground outline-none transition-all duration-150 placeholder:text-muted-foreground/60 focus:w-56"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.preventDefault(); closeRewrite(arn); }
        }}
      />
      <Button variant="ai" size="sm" title="Rewrite with Night Eyes" onClick={(e) => { e.stopPropagation(); submit(); }}>
        <Spark /> Rewrite
      </Button>
    </span>
  );
}

/* ── expand / collapse chevron. Uncontrolled by default — the kit owns the per-ARN
 *    expand state (useArnUiStore). Pass `expanded`+`onToggle` to make it CONTROLLED
 *    instead (e.g. the Plot Threads page where the list owns multi-open + Expand-all). */
export function ArnExpand({ section, sub, item, expanded, onToggle, revealOnHover = true }: ArnNodeProps & {
  expanded?: boolean; onToggle?: () => void; revealOnHover?: boolean;
}) {
  const { arn } = useArnKit({ section, sub, item });
  const storeExpanded = useArnUiStore((s) => !!s.expanded[arn]);
  const toggleExpanded = useArnUiStore((s) => s.toggleExpanded);
  const isOpen = expanded ?? storeExpanded;
  const toggle = onToggle ?? (() => toggleExpanded(arn));
  // the chevron always reveals on hover, but reads as "open" once expanded.
  return (
    <span className={cn('inline-flex', !isOpen && revealCls(revealOnHover))}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:bg-secondary hover:text-foreground"
        title={isOpen ? 'Collapse' : 'Expand'}
        aria-label={isOpen ? 'Collapse' : 'Expand'}
        aria-expanded={isOpen}
        onClick={(e) => { e.stopPropagation(); toggle(); }}
      >
        <ChevronRight className={cn('h-4 w-4 transition-transform duration-150', isOpen && 'rotate-90')} strokeWidth={1.8} />
      </Button>
    </span>
  );
}
