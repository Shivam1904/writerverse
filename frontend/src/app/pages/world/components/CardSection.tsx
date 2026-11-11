import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { PendingSectionEntries } from './PendingSectionEntries';
import { WorldEntityFields } from './WorldEntityFields';
import { Card, ColorDotPicker } from '../../../ui';
import { ASPECT_HEX_PALETTE } from '../../../theme/aspects';
import type { WorldCard } from '../data';
import type { PendingWorldItem } from '../pendingSections';
import type { FieldProposal } from '../../characters/components/FieldEdit';

/* The nameplate fill behind each card's initial / name (entries carry no
 * image). Inline (JSX) — kept out of any CSS file per the styling rules. */
const PLATE_FILL = 'linear-gradient(165deg, color-mix(in srgb, var(--paper) 70%, var(--surface)) 0%, var(--surface-2) 100%)';

function DeleteBtn({ onDelete, className }: { onDelete: () => void; className?: string }) {
  return (
    <button
      className={`absolute hidden h-5 w-5 place-items-center rounded border border-border bg-[rgba(255,255,255,.85)] text-[var(--ink-3)] hover:text-[#c33] group-hover:grid ${className ?? 'right-1.5 top-1.5'}`}
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      title="Remove"
    >
      <X size={13} />
    </button>
  );
}

function ProposalDot() {
  return <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--terra-deep)] align-middle" title="AI drafted a description — click to review" />;
}

/** A small colour dot pinned to a card corner, opening the swatch picker. */
function CardColorDot({
  item, blockColor, onColor,
}: {
  item: WorldCard;
  blockColor: string;
  onColor: (id: string, color: string) => void;
}) {
  return (
    <span
      className="absolute left-1.5 top-1.5 z-10 opacity-0 transition-opacity group-hover:opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      <ColorDotPicker
        color={(item.color || '').trim() || blockColor}
        value={item.color}
        defaultColor={blockColor}
        palette={ASPECT_HEX_PALETTE}
        onPick={(c) => onColor(item.id, c)}
        onReset={() => onColor(item.id, '')}
        size={12}
        title="Entity colour"
      />
    </span>
  );
}

function EditableCard({
  item,
  layout,
  proposal,
  blockColor,
  onUpdate,
  onColor,
  onDelete,
}: {
  item: WorldCard;
  layout: 'top' | 'side';
  proposal?: FieldProposal;
  blockColor: string;
  onUpdate: (id: string, patch: { title?: string; content?: string }) => void;
  onColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(!!proposal);
  const cardRef = useRef<HTMLElement>(null);

  // A freshly-drafted entity (e.g. just "made real") loads with an AI description
  // proposal on it — open it expanded once so the author sees the drafted fields
  // without hunting for the dot. Auto-expands only on the absent→present edge, so
  // it won't re-open after the author collapses it; a later proposal re-arms it.
  const autoExpandedRef = useRef(!!proposal);
  useEffect(() => {
    if (proposal && !autoExpandedRef.current) {
      autoExpandedRef.current = true;
      setEditing(true);
    } else if (!proposal) {
      autoExpandedRef.current = false;
    }
  }, [proposal]);

  // Click outside the card (while editing) → collapse. Deferred so a field
  // mid-edit blur-commits before the card stops rendering its inputs.
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setTimeout(() => setEditing(false), 0);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing]);

  const fields = (
    <WorldEntityFields
      name={item.name}
      description={item.line || ''}
      proposal={proposal}
      onSaveName={(v) => onUpdate(item.id, { title: v })}
      onSaveDescription={(v) => onUpdate(item.id, { content: v })}
    />
  );
  const openEdit = !editing ? () => setEditing(true) : undefined;
  const foot = item.from && (
    <div className="mt-auto flex flex-col items-start gap-1 pt-1">
      <div className="ty-system-caption">from {item.from}</div>
    </div>
  );

  if (layout === 'side') {
    return (
      <Card as="article" variant="item" ref={cardRef as any} onClick={openEdit} title={!editing ? 'Click to edit' : undefined}
        className="group relative flex cursor-pointer items-start gap-3 p-3">
        <div className="grid h-[68px] w-[68px] shrink-0 place-items-center overflow-hidden rounded-[var(--r-sm)] border border-border" style={{ background: PLATE_FILL }}>
          <span className="ty-story-heading italic" style={{ fontSize: 24 }}>{(item.name || '?').trim().charAt(0)}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {editing ? fields : (
            <>
              <div className="ty-story-heading text-[13.5px]">{item.name}{proposal && <ProposalDot />}</div>
              {item.line && <p className="ty-story-body m-0 line-clamp-3 text-[12px] leading-snug text-muted-foreground">{item.line}</p>}
            </>
          )}
          {foot}
        </div>
        <CardColorDot item={item} blockColor={blockColor} onColor={onColor} />
        <DeleteBtn onDelete={() => onDelete(item.id)} className="right-1.5 top-1.5" />
      </Card>
    );
  }

  return (
    <Card as="article" variant="item" ref={cardRef as any} onClick={openEdit} title={!editing ? 'Click to edit' : undefined}
      className="group relative flex cursor-pointer flex-col overflow-hidden p-0">
      <div className="grid aspect-[4/3] place-items-center border-b border-border px-3" style={{ background: PLATE_FILL }}>
        <span className="ty-story-heading text-balance text-center italic" style={{ fontSize: 19 }}>{item.name}{proposal && <ProposalDot />}</span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-3 pb-2.5 pt-2">
        {editing ? fields : (
          <>
            {item.line && <p className="ty-story-body m-0 line-clamp-3 text-[12px] leading-snug text-muted-foreground">{item.line}</p>}
          </>
        )}
        {foot}
      </div>
      <CardColorDot item={item} blockColor={blockColor} onColor={onColor} />
      <DeleteBtn onDelete={() => onDelete(item.id)} className="right-1.5 top-1.5" />
    </Card>
  );
}

function AddCardForm({
  layout,
  addLabel,
  onAdd,
  onCancel,
}: {
  layout: 'top' | 'side';
  addLabel: string;
  onAdd: (name: string, line: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [line, setLine] = useState('');

  const commit = () => {
    const trimName = name.trim();
    if (trimName) onAdd(trimName, line.trim());
    onCancel();
  };

  const inputs = (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <input
        className="ty-story-heading w-full rounded-[4px] border border-[var(--terra-soft)] bg-[var(--surface)] px-1.5 py-0.5 text-[13.5px] outline-none focus:border-[var(--terra)]"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); }}
        placeholder={`${addLabel} name`}
        autoFocus
      />
      <input
        className="ty-story-body w-full rounded-[4px] border border-[var(--terra-soft)] bg-[var(--surface)] px-1.5 py-0.5 text-[12px] outline-none focus:border-[var(--terra)]"
        value={line}
        onChange={(e) => setLine(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="One-line description"
      />
    </div>
  );

  if (layout === 'side') {
    return (
      <Card variant="item" className="flex items-start gap-3 p-3 ring-2 ring-[var(--terra-soft)]">
        <div className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-[var(--r-sm)] border border-border" style={{ background: PLATE_FILL }}>
          <span className="ty-story-heading italic opacity-40" style={{ fontSize: 24 }}>?</span>
        </div>
        {inputs}
      </Card>
    );
  }
  return (
    <Card variant="item" className="flex flex-col overflow-hidden p-0 ring-2 ring-[var(--terra-soft)]">
      <div className="grid aspect-[4/3] place-items-center border-b border-border" style={{ background: PLATE_FILL }}>
        <span className="ty-story-heading italic opacity-40" style={{ fontSize: 19 }}>?</span>
      </div>
      <div className="p-3">{inputs}</div>
    </Card>
  );
}

function AddTile({ layout, addLabel, onClick }: { layout: 'top' | 'side'; addLabel: string; onClick: () => void }) {
  return (
    <Card as="button" variant="dashed" onClick={onClick}
      className={`flex items-center justify-center gap-1.5 text-muted-foreground transition-colors hover:border-[var(--terra-soft)] hover:text-[var(--terra-deep)] ${layout === 'top' ? 'aspect-[4/3] flex-col' : 'p-3'}`}>
      <Plus size={layout === 'top' ? 20 : 16} />
      <span className="ty-system-label">{addLabel}</span>
    </Card>
  );
}

export function CardSection({
  items,
  ideas,
  addLabel,
  layout = 'top',
  pending,
  proposalFor,
  blockColor,
  onAdd,
  onUpdate,
  onColor,
  onDelete,
}: {
  items: WorldCard[];
  ideas?: React.ReactNode;
  addLabel: string;
  layout?: 'top' | 'side';
  pending?: PendingWorldItem[];
  proposalFor?: (id: string) => FieldProposal | undefined;
  /** The section's resolved colour — the default each entity derives from. */
  blockColor: string;
  onAdd: (name: string, line: string) => void;
  onUpdate: (id: string, patch: { title?: string; content?: string }) => void;
  onColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="mb-[26px]">
      <div className={layout === 'side' ? 'grid grid-cols-1 gap-2.5 sm:grid-cols-2' : 'grid grid-cols-2 gap-3 sm:grid-cols-3'}>
        {items.map((it) => (
          <EditableCard
            key={it.id}
            item={it}
            layout={layout}
            proposal={proposalFor?.(it.id)}
            blockColor={blockColor}
            onUpdate={onUpdate}
            onColor={onColor}
            onDelete={onDelete}
          />
        ))}
        <PendingSectionEntries pending={pending ?? []} kind={layout === 'side' ? 'things' : 'places'} />
        {adding ? (
          <AddCardForm layout={layout} addLabel={addLabel} onAdd={onAdd} onCancel={() => setAdding(false)} />
        ) : (
          <AddTile layout={layout} addLabel={addLabel} onClick={() => setAdding(true)} />
        )}
      </div>
      {ideas}
    </section>
  );
}
