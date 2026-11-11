import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Spark } from '../../../ui';
import { GenerateIdeasPopover } from '../../../components/GenerateIdeasPopover';

/* DraftActions — the shared draft affordance for the threads page sections.
 * Layout: a standalone primary "Create thread" button (labelled in the Create
 * section, icon-only + in the Threads section) followed by a single AI ✦ button.
 * Clicking the ✦ expands it IN PLACE into three identical AI buttons:
 *   ✦ Create           → extract user plot
 *   ✦ Expand from ideas → generate (the braindump popover, anchored to this button)
 *   ✦ Invent scaffold   → the invent path
 * Selecting Create/Invent fires and collapses; "Expand from ideas" opens the
 * generate popover BELOW itself (the menu stays open so it can anchor it).
 * Built from the Button kit only. */
export function DraftActions({
  primaryLabel,
  onCreateThread,
  onCreate,
  onInvent,
  braindumps,
  onGenerateOpen,
  onGenerate,
}: {
  /** label on the primary create button; omit for an icon-only + (Threads) */
  primaryLabel?: string;
  onCreateThread: () => void;
  onCreate: () => void;
  onInvent: () => void;
  braindumps: any[];
  /** called when the generate popover opens (lets the page load braindumps) */
  onGenerateOpen: () => void;
  onGenerate: (sel: { focus: string[]; all: string[]; added: string[] }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);     // AI menu expanded
  const [genOpen, setGenOpen] = useState(false); // generate popover
  const ref = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);

  // Collapse the AI menu on outside click — but NOT while the generate popover
  // is open (it's portaled to <body>, so its clicks would read as "outside").
  useEffect(() => {
    if (!open || genOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, genOpen]);

  // Selecting an action does NOT collapse the menu — only an outside click does.
  const openGenerate = () => { onGenerateOpen(); setGenOpen(true); };
  const closeGenerate = () => setGenOpen(false);

  return (
    <div ref={ref} className="flex items-center gap-2">
      <Button variant="primary" size="sm" title="Create thread" aria-label="Create thread" onClick={onCreateThread}>
        <Plus size={15} />{primaryLabel ? ` ${primaryLabel}` : ''}
      </Button>

      {!open ? (
        <Button variant="ai" size="sm" title="Draft with Night Eyes" aria-label="Draft with Night Eyes" onClick={() => setOpen(true)}>
          <Spark />
        </Button>
      ) : (
        <>
          <Button variant="ai" size="sm" onClick={onCreate}><Spark /> Create</Button>
          <Button ref={expandRef} variant="ai" size="sm" onClick={openGenerate}><Spark /> Expand from ideas</Button>
          <Button variant="ai" size="sm" onClick={onInvent}><Spark /> Invent scaffold</Button>
        </>
      )}

      <GenerateIdeasPopover
        open={genOpen}
        onClose={closeGenerate}
        anchorRef={expandRef as any}
        braindumps={braindumps}
        title="Generate a plot thread"
        hint="Built from these ideas — untick any to leave out, or jot a new one. The rest stay in mind as context."
        generateLabel="Generate thread"
        busyLabel="Generating…"
        addPlaceholder="add an idea for this thread…"
        saveNote="New ideas are saved to your braindumps."
        onGenerate={onGenerate}
      />
    </div>
  );
}
