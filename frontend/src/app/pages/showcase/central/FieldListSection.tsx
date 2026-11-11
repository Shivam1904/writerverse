import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useFieldList } from '../useFieldList';

type Field = { id: string; text: string };

/**
 * FieldListSection — a section body that's just a list of editable lines, driven
 * by the reusable useFieldList (Enter adds, Backspace removes, arrows hop, drag
 * reorders, click focuses). A coloured dot marks each row in the section tint,
 * plus an "+ add" affordance. Used by World sections and the character Arc.
 */
export function FieldListSection({ id, label, color, items: seed }: {
    id: string;
    label: string;   // lowercase noun for the placeholder / add button (e.g. "locations")
    color: string;
    items: string[];
}) {
    const [items, setItems] = useState<Field[]>(() => seed.map((t, i) => ({ id: `${id}-${i}`, text: t })));
    const seq = useRef(seed.length);
    const { fieldProps, cardProps, add, draggingId, overId } = useFieldList<Field>({
        items,
        setItems,
        getText: (x) => x.text,
        withText: (x, text) => ({ ...x, text }),
        makeEmpty: () => ({ id: `${id}-${seq.current++}`, text: '' }),
    });

    return (
        <div className="flex flex-col gap-0.5">
            {items.map((it) => (
                <div
                    key={it.id}
                    {...cardProps(it)}
                    className={cn(
                        'group flex items-start gap-2 rounded-md border border-transparent px-2 py-1 transition-colors hover:bg-[var(--paper)] focus-within:border-[var(--terra-soft)]',
                        draggingId === it.id && 'opacity-40',
                        overId === it.id && draggingId !== it.id && 'ring-1 ring-[var(--terra-soft)]',
                    )}
                >
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color, opacity: 0.8 }} />
                    <textarea
                        {...fieldProps(it)}
                        spellCheck
                        placeholder={`add to ${label}…`}
                        className="ty-story-body m-0 w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-[var(--ink-4)]"
                    />
                </div>
            ))}
            <button
                type="button"
                onClick={() => add()}
                className="mt-1 inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-[var(--ink-3)] transition-colors hover:text-[var(--terra-deep)]"
                style={{ fontSize: 11 }}
            >
                <Plus size={12} /> add {label}
            </button>
        </div>
    );
}
