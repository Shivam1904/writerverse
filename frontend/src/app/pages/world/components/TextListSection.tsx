import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { PendingSectionEntries } from './PendingSectionEntries';
import { WorldEntityFields } from './WorldEntityFields';
import { ColorDotPicker } from '../../../ui';
import { ASPECT_HEX_PALETTE } from '../../../theme/aspects';
import type { WorldBullet } from '../data';
import type { PendingWorldItem } from '../pendingSections';
import type { FieldProposal } from '../../characters/components/FieldEdit';

function InlineBulletEdit({
  item,
  proposal,
  blockColor,
  onUpdate,
  onColor,
  onDelete,
}: {
  item: WorldBullet;
  proposal?: FieldProposal;
  blockColor: string;
  onUpdate: (id: string, patch: { title?: string; content?: string }) => void;
  onColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(!!proposal);
  const rowRef = useRef<HTMLLIElement>(null);

  // A freshly-drafted entry (e.g. just "made real") loads with an AI description
  // proposal — open it expanded once so the author sees the drafted fields. Fires
  // only on the absent→present edge, so it won't re-open after a manual collapse.
  const autoExpandedRef = useRef(!!proposal);
  useEffect(() => {
    if (proposal && !autoExpandedRef.current) {
      autoExpandedRef.current = true;
      setEditing(true);
    } else if (!proposal) {
      autoExpandedRef.current = false;
    }
  }, [proposal]);

  // Click outside the row (while editing) → collapse. Deferred so a field
  // mid-edit blur-commits before the row stops rendering its inputs.
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setTimeout(() => setEditing(false), 0);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing]);

  return (
    <li className="group relative grid grid-cols-[12px_1fr_auto] items-center gap-[9px] border-b border-dotted border-border py-[7px] last:border-b-0" ref={rowRef}>
      <span className="grid place-items-center" onClick={(e) => e.stopPropagation()}>
        <ColorDotPicker
          color={(item.color || '').trim() || blockColor}
          value={item.color}
          defaultColor={blockColor}
          palette={ASPECT_HEX_PALETTE}
          onPick={(c) => onColor(item.id, c)}
          onReset={() => onColor(item.id, '')}
          size={11}
          title="Entity colour"
        />
      </span>
      <div className="min-w-0">
        {editing ? (
          <WorldEntityFields
            name={item.name || ''}
            description={item.text}
            proposal={proposal}
            onSaveName={(v) => onUpdate(item.id, { title: v })}
            onSaveDescription={(v) => onUpdate(item.id, { content: v })}
          />
        ) : (
          <span className="ty-story-body cursor-text rounded-[3px] text-[13px] hover:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]" onClick={() => setEditing(true)} title="Click to edit">
            {item.name ? (
              <>
                <span className="font-semibold">{item.name}</span>
                {item.text && <span className="text-muted-foreground">&nbsp;—&nbsp;{item.text}</span>}
              </>
            ) : (
              <span className="text-muted-foreground">{item.text}</span>
            )}
            {proposal && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--terra-deep)] align-middle" title="AI drafted a description — click to review" />}
            {item.from && <span className="ty-system-caption">&nbsp;·&nbsp;{item.from}</span>}
          </span>
        )}
      </div>
      <button
        className="absolute right-0 top-1.5 hidden h-5 w-5 place-items-center rounded text-[var(--ink-3)] hover:text-[#c33] group-hover:grid"
        onClick={() => onDelete(item.id)}
        title="Remove"
      >
        <X size={13} />
      </button>
    </li>
  );
}

export function TextListSection({
  items,
  ideas,
  addLabel,
  pending,
  proposalFor,
  blockColor,
  onAdd,
  onUpdate,
  onColor,
  onDelete,
}: {
  items: WorldBullet[];
  ideas?: React.ReactNode;
  addLabel: string;
  sectionId: string;
  pending?: PendingWorldItem[];
  proposalFor?: (id: string) => FieldProposal | undefined;
  /** The section's resolved colour — the default each entity derives from. */
  blockColor: string;
  onAdd: (name: string, text: string) => void;
  onUpdate: (id: string, patch: { title?: string; content?: string }) => void;
  onColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const addRef = useRef<HTMLInputElement>(null);

  const commitAdd = () => {
    const trimmed = newText.trim();
    if (trimmed) {
      onAdd('', trimmed);
      setNewText('');
      setAdding(false);
    } else {
      setAdding(false);
    }
  };

  return (
    <section className="mb-[26px]">
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((it) => (
          <InlineBulletEdit
            key={it.id}
            item={it}
            proposal={proposalFor?.(it.id)}
            blockColor={blockColor}
            onUpdate={onUpdate}
            onColor={onColor}
            onDelete={onDelete}
          />
        ))}
        <PendingSectionEntries pending={pending ?? []} kind="bullets" />
      </ul>
      {ideas}
      {adding ? (
        <div className="pt-2">
          <input
            ref={addRef}
            className="ty-story-body w-full rounded-[4px] border border-[var(--terra-soft)] bg-[var(--surface)] px-1.5 py-1 text-[13px] outline-none focus:border-[var(--terra)]"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAdd();
              if (e.key === 'Escape') { setNewText(''); setAdding(false); }
            }}
            placeholder={`Add a ${addLabel}…`}
            autoFocus
          />
        </div>
      ) : (
        <button
          className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] text-[var(--ink-3)] transition-colors hover:text-[var(--terra-deep)]"
          onClick={() => {
            setAdding(true);
            setTimeout(() => addRef.current?.focus(), 0);
          }}
        >
          <Plus size={12} /> {addLabel}
        </button>
      )}
    </section>
  );
}
