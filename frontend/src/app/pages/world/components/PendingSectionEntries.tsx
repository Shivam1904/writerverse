import { Check, X } from 'lucide-react';
import { EntityMark } from '../../../components/EntityMark';
import { proposalEntityMark } from '../../../modules/proposal/ProposalRailCard';
import { Button, Card, Spark } from '../../../ui';
import type { PendingWorldItem, WorldSectionKind } from '../pendingSections';

/**
 * PendingSectionEntries — the World page's in-context surface for pending
 * "add to world" proposals. Renders each pending entry in its section's OWN
 * shape (a ghosted rule row / card / bullet), so a suggested rule reads as a
 * not-yet-accepted member of the Rules section rather than a separate widget.
 *
 * Returns a bare fragment of the section's leaf elements (<li> / Card) so the
 * parent drops it straight inside its own list/grid container. Accept / dismiss
 * call the proposal's own store callbacks, so resolving here clears the
 * chat-inline + toast surfaces in lockstep (one proposal, three surfaces).
 *
 * `kind` is the section's layout family: rules / places (top cards) / things
 * (side cards) / bullets (custom-tag lists).
 */
export function PendingSectionEntries({
  pending,
  kind,
}: {
  pending: PendingWorldItem[];
  kind: WorldSectionKind;
}) {
  if (!pending || pending.length === 0) return null;
  return (
    <>
      {pending.map((it) => (
        <PendingEntry key={String(it.proposal.proposalId)} item={it} kind={kind} />
      ))}
    </>
  );
}

function PendingActions({ item }: { item: PendingWorldItem }) {
  const { onAccept, onCancel } = item.proposal;
  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-6 w-6" title="Dismiss" onClick={onCancel}>
        <X size={13} />
      </Button>
      <Button variant="ai" size="sm" className="h-6 gap-1 px-2" title="Add to world" onClick={onAccept}>
        <Check size={12} /> Add
      </Button>
    </span>
  );
}

function PendingMark({ item, size }: { item: PendingWorldItem; size: number }) {
  const mark = proposalEntityMark(item.proposal.capability, item.proposal.result);
  if (mark) return <EntityMark kind={mark.kind} color={mark.color} size={size} />;
  return <Spark aria-hidden="true" style={{ fontSize: size * 0.6 }} />;
}

const FILL_PLATE = 'linear-gradient(165deg, color-mix(in srgb, var(--paper) 70%, var(--surface)) 0%, var(--surface-2) 100%)';

function PendingEntry({ item, kind }: { item: PendingWorldItem; kind: WorldSectionKind }) {
  if (kind === 'rules') {
    return (
      <li className="flex items-start gap-2.5 py-[7px] opacity-80">
        <span className="mt-2 h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--terra-deep)]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="ty-story-body text-[14px] italic">{item.title}</div>
          <div className="flex items-center justify-between gap-2.5">
            {item.from ? <span className="ty-system-caption">{item.from}</span> : <span />}
            <PendingActions item={item} />
          </div>
        </div>
      </li>
    );
  }

  if (kind === 'bullets') {
    return (
      <li className="flex items-center gap-2.5 py-[7px] opacity-80">
        <span className="text-[13px] text-[var(--ink-4)]">·</span>
        <div className="ty-story-body min-w-0 flex-1 text-[13px]">
          <span className="font-semibold">{item.title}</span>
          {item.line && <span className="text-muted-foreground"> — {item.line}</span>}
        </div>
        <PendingActions item={item} />
      </li>
    );
  }

  // things (side cards)
  if (kind === 'things') {
    return (
      <Card variant="pending" className="flex items-start gap-3 p-3">
        <div className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-[var(--r-sm)] border border-border" style={{ background: FILL_PLATE }}>
          <PendingMark item={item} size={24} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="ty-story-heading text-[13.5px]">{item.title}</div>
          {item.line && <p className="ty-story-body m-0 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{item.line}</p>}
          <div className="mt-1"><PendingActions item={item} /></div>
        </div>
      </Card>
    );
  }

  // places (top cards)
  return (
    <Card variant="pending" className="flex flex-col overflow-hidden p-0">
      <div className="grid aspect-[4/3] place-items-center border-b border-border px-3" style={{ background: FILL_PLATE }}>
        <span className="ty-story-heading text-balance text-center italic" style={{ fontSize: 19 }}>{item.title}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-3 pb-2.5 pt-2">
        {item.line && <p className="ty-story-body m-0 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{item.line}</p>}
        <div className="mt-1"><PendingActions item={item} /></div>
      </div>
    </Card>
  );
}
