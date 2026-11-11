import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { PendingSectionEntries } from './PendingSectionEntries';
import type { WorldRule } from '../data';
import type { PendingWorldItem } from '../pendingSections';

function InlineRuleEdit({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: WorldRule;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rule.text);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== rule.text) {
      onUpdate(rule.id, trimmed);
    } else {
      setDraft(rule.text);
    }
  };

  return (
    <li className="group relative grid grid-cols-[12px_1fr] gap-[9px] border-b border-dotted border-border py-[7px] last:border-b-0">
      <span className="mt-2 h-[5px] w-[5px] rounded-full bg-[var(--terra-deep)]" />
      <div className="flex min-w-0 flex-col gap-0.5">
        {editing ? (
          <input
            ref={inputRef}
            className="ty-story-body w-full rounded-[4px] border border-[var(--terra-soft)] bg-[var(--surface)] px-1.5 py-0.5 text-[14px] italic outline-none focus:border-[var(--terra)]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setDraft(rule.text); setEditing(false); }
            }}
            autoFocus
          />
        ) : (
          <div
            className="ty-story-body cursor-text rounded-[3px] text-[14px] italic hover:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]"
            onDoubleClick={() => {
              setDraft(rule.text);
              setEditing(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            title="Double-click to edit"
          >
            {rule.text}
          </div>
        )}
        {rule.from && <span className="ty-system-caption">{rule.from}</span>}
      </div>
      <button
        className="absolute right-0 top-1 hidden h-5 w-5 place-items-center rounded text-[var(--ink-3)] hover:text-[#c33] group-hover:grid"
        onClick={() => onDelete(rule.id)}
        title="Remove rule"
      >
        <X size={13} />
      </button>
    </li>
  );
}

export function RulesSection({
  rules,
  ideas,
  pending,
  onAdd,
  onUpdate,
  onDelete,
}: {
  rules: WorldRule[];
  ideas?: React.ReactNode;
  pending?: PendingWorldItem[];
  onAdd: (text: string) => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const addRef = useRef<HTMLInputElement>(null);

  const commitAdd = () => {
    const trimmed = newText.trim();
    if (trimmed) {
      onAdd(trimmed);
      setNewText('');
      setAdding(false);
    } else {
      setAdding(false);
    }
  };

  return (
    <section className="mb-[26px]">
      <ol className="m-0 flex list-none flex-col border-l-[1.5px] border-[var(--terra-soft)] p-0 pl-4">
        {rules.map((r) => (
          <InlineRuleEdit key={r.id} rule={r} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
        <PendingSectionEntries pending={pending ?? []} kind="rules" />
      </ol>

      {ideas}

      {adding ? (
        <div className="pt-2">
          <input
            ref={addRef}
            className="ty-story-body w-full rounded-[4px] border border-[var(--terra-soft)] bg-[var(--surface)] px-1.5 py-1 text-[14px] outline-none focus:border-[var(--terra)]"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAdd();
              if (e.key === 'Escape') { setNewText(''); setAdding(false); }
            }}
            placeholder="A rule your world keeps…"
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
          <Plus size={12} /> rule
        </button>
      )}
    </section>
  );
}
