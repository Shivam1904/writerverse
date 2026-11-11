import { useEffect, useRef, useState } from 'react';

/**
 * useFieldList — REUSABLE keystroke + pointer behaviour for ANY list whose rows
 * each hold a single text field (ideas, beats, outline lines, …). Spread
 * `fieldProps(item)` on the row's <textarea> and `cardProps(item)` on the row
 * wrapper; manage the items array yourself (so the data shape stays yours).
 *
 * Field keystrokes:
 *   · Enter             → save + insert a new empty item right after; focus it.
 *   · Shift+Enter       → newline in the same field (native; we don't intercept).
 *   · Backspace (empty) → remove the item; focus the previous (caret at end).
 *                         Pass `onDeleteEmpty` when rows are saved somewhere, so
 *                         the removal is a real delete (not just a local drop).
 *   · ArrowDown → caret moves within the field; at the very END of the text it
 *                 focuses the next field (caret at start).
 *   · ArrowUp   → caret moves within the field; at the very START it focuses the
 *                 previous field (caret at end).
 *   · Alt/Option + ArrowDown / ArrowUp → jump straight to next / previous field.
 *
 * Card pointer behaviour:
 *   · click on the text   → caret lands where you click (native textarea).
 *   · click on whitespace → focuses the field (when you didn't drag).
 *   · mousedown on whitespace arms dragging; an actual drag reorders the list
 *     (or can leave the container). Dragging never starts from the textarea, so
 *     selecting text still works. Pair with a hover-revealed drag handle in CSS.
 *
 * Visual state for the consumer: `draggingId` (the row being dragged) and
 * `overId` (the row a drag is hovering) — style them however you like.
 *
 * The focused row is held locally (outside `items`) while the author types in
 * it, so a parent refresh — e.g. a server refetch replacing the items array —
 * can't overwrite their text or make the row vanish (SA-112). Render `rows`
 * (not your own items) to get that protection for the row itself.
 *
 * The only structural requirement: every item has a stable `id`.
 */

// Single guarded implementation (zero-width mount measurement explodes
// scrollHeight — the 24k-px braindump rows). Re-exported to keep callers' name.
import { autoGrow as autoGrowTextarea } from '../../ui/beat-field';
export { autoGrowTextarea };

export interface FieldListItem { id: string; }

interface Options<T extends FieldListItem> {
    items: T[];
    setItems: React.Dispatch<React.SetStateAction<T[]>>;
    /** read the field text out of an item */
    getText: (item: T) => string;
    /** return a copy of the item with new text */
    withText: (item: T, text: string) => T;
    /** make a fresh empty item (must have a unique id) */
    makeEmpty: () => T;
    /** drag-to-reorder (default true) */
    reorderable?: boolean;
    /** Backspace on an empty row. Default: drop it from `items` (fine for
     *  local-only lists). A list backed by a server must delete it there too,
     *  or the row comes back on the next refetch (SA-140). */
    onDeleteEmpty?: (item: T) => void;
}

export function useFieldList<T extends FieldListItem>({
    items, setItems, getText, withText, makeEmpty, reorderable = true, onDeleteEmpty,
}: Options<T>) {
    const els = useRef(new Map<string, HTMLTextAreaElement>());
    const pendingFocus = useRef<{ id: string; caret: 'start' | 'end' } | null>(null);
    const [armedId, setArmedId] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    // The row with focus: its last-seen copy + position, and the text typed
    // into it (null until the first keystroke). Cleared when focus leaves it.
    const [editing, setEditing] = useState<{ item: T; index: number; text: string | null } | null>(null);
    const itemsRef = useRef(items);
    itemsRef.current = items;

    // Rows to render: `items`, with the focused row put back if a refresh
    // dropped it (e.g. an unsaved new row the server doesn't know yet).
    let rows = items;
    if (editing && !items.some((x) => x.id === editing.item.id)) {
        rows = [...items];
        rows.splice(Math.min(editing.index, items.length), 0, editing.item);
    }

    // Track focus with native listeners, so callers can still pass their own
    // onFocus/onBlur to the field without breaking this.
    useEffect(() => {
        const idOf = (t: EventTarget | null) => {
            for (const [id, el] of els.current) if (el === t) return id;
            return null;
        };
        const onIn = (e: FocusEvent) => {
            const id = idOf(e.target);
            if (id == null) return;
            const index = itemsRef.current.findIndex((x) => x.id === id);
            if (index < 0) return;
            setEditing((cur) => (cur?.item.id === id ? cur : { item: itemsRef.current[index], index, text: null }));
        };
        const onOut = (e: FocusEvent) => {
            const id = idOf(e.target);
            if (id != null) setEditing((cur) => (cur?.item.id === id ? null : cur));
        };
        document.addEventListener('focusin', onIn);
        document.addEventListener('focusout', onOut);
        return () => {
            document.removeEventListener('focusin', onIn);
            document.removeEventListener('focusout', onOut);
        };
    }, []);

    function focusAt(id: string | undefined, caret: 'start' | 'end') {
        if (!id) return;
        const el = els.current.get(id);
        if (!el) return;
        el.focus();
        const pos = caret === 'start' ? 0 : el.value.length;
        el.setSelectionRange(pos, pos);
        autoGrowTextarea(el);
    }

    // After an add/remove re-renders the list, focus the queued field.
    useEffect(() => {
        const p = pendingFocus.current;
        if (!p) return;
        pendingFocus.current = null;
        focusAt(p.id, p.caret);
    });

    // Re-measure a field when its WIDTH changes after mount (the card's action
    // column settling, a grid column change, a window resize), or when a web
    // font finishes loading: either re-wraps the text, and the one-time mount
    // measurement would then hide its last line (wrt-140).
    const resizeObs = useRef<ResizeObserver | null>(null);
    const widths = useRef(new WeakMap<Element, number>());
    if (!resizeObs.current && typeof ResizeObserver !== 'undefined') {
        resizeObs.current = new ResizeObserver((entries) => {
            for (const e of entries) {
                const w = Math.round(e.contentRect.width);
                if (widths.current.get(e.target) === w) continue; // our own height change
                widths.current.set(e.target, w);
                autoGrowTextarea(e.target as HTMLTextAreaElement);
            }
        });
    }
    useEffect(() => {
        // (Re)attach: React dev runs effects twice, and the cleanup disconnects.
        els.current.forEach((el) => resizeObs.current?.observe(el));
        const regrowAll = () => els.current.forEach((el) => autoGrowTextarea(el));
        const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
        fonts?.addEventListener?.('loadingdone', regrowAll);
        return () => {
            fonts?.removeEventListener?.('loadingdone', regrowAll);
            resizeObs.current?.disconnect();
        };
    }, []);

    const register = (id: string, el: HTMLTextAreaElement | null) => {
        const prev = els.current.get(id);
        if (prev && prev !== el) resizeObs.current?.unobserve(prev);
        if (el) {
            els.current.set(id, el);
            if (prev !== el) resizeObs.current?.observe(el);
        } else {
            els.current.delete(id);
        }
    };

    /** insert a new empty item (after `afterId`, or at the end) and focus it. */
    const add = (afterId?: string) => {
        const fresh = makeEmpty();
        pendingFocus.current = { id: fresh.id, caret: 'start' };
        setItems((xs) => {
            if (afterId == null) return [...xs, fresh];
            const i = xs.findIndex((x) => x.id === afterId);
            const n = [...xs]; n.splice(i + 1, 0, fresh); return n;
        });
    };

    const fieldProps = (item: T) => ({
        ref: (el: HTMLTextAreaElement | null) => { register(item.id, el); autoGrowTextarea(el); },
        value: editing?.item.id === item.id && editing.text !== null ? editing.text : getText(item),
        rows: 1,
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const text = e.target.value;
            const index = rows.findIndex((x) => x.id === item.id);
            setEditing({ item: withText(item, text), index, text });
            setItems((xs) => xs.map((x) => (x.id === item.id ? withText(x, text) : x)));
            autoGrowTextarea(e.currentTarget);
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            const ta = e.currentTarget;
            const idx = rows.findIndex((x) => x.id === item.id);
            const collapsed = ta.selectionStart === ta.selectionEnd;

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                add(item.id);
                return;
            }
            // Shift+Enter → native newline (not intercepted).
            if (e.key === 'Backspace' && ta.value === '' && rows.length > 1) {
                e.preventDefault();
                const target = rows[idx - 1]?.id ?? rows[idx + 1]?.id;
                if (target) pendingFocus.current = { id: target, caret: 'end' };
                setEditing(null); // let the removal through
                if (onDeleteEmpty) onDeleteEmpty(item);
                else setItems((xs) => xs.filter((x) => x.id !== item.id));
                return;
            }
            // Option/Alt + Arrow → jump straight to the prev/next field.
            if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                const target = e.key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1];
                if (target) { e.preventDefault(); focusAt(target.id, e.key === 'ArrowDown' ? 'start' : 'end'); }
                return;
            }
            // Plain Arrow → the caret climbs/drops within the field normally; it
            // only hops to the next/prev field once it has reached the very END
            // (Down) or the very START (Up) of the text.
            if (e.key === 'ArrowDown' && collapsed && ta.selectionStart === ta.value.length && rows[idx + 1]) {
                e.preventDefault(); focusAt(rows[idx + 1].id, 'start'); return;
            }
            if (e.key === 'ArrowUp' && collapsed && ta.selectionStart === 0 && rows[idx - 1]) {
                e.preventDefault(); focusAt(rows[idx - 1].id, 'end'); return;
            }
        },
    });

    // mousedown on a real control / the field itself shouldn't arm a drag.
    const isInteractive = (t: EventTarget | null) =>
        !!(t as HTMLElement)?.closest?.('textarea, button, a, input, select, [data-no-drag]');

    const cardProps = (item: T) => ({
        draggable: reorderable && armedId === item.id,
        onMouseDown: (e: React.MouseEvent) => {
            if (isInteractive(e.target)) { if (armedId) setArmedId(null); return; }
            setArmedId(item.id); // arm dragging from anywhere on the card's whitespace
        },
        onMouseUp: () => { setArmedId(null); },
        onClick: (e: React.MouseEvent) => {
            // a plain click on whitespace (no drag) → focus the field
            if (draggingId || isInteractive(e.target)) return;
            els.current.get(item.id)?.focus();
        },
        onDragStart: (e: React.DragEvent) => {
            setDraggingId(item.id);
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', item.id); } catch { /* some browsers */ }
        },
        onDragOver: (e: React.DragEvent) => {
            if (!draggingId || !reorderable) return;
            e.preventDefault();
            if (overId !== item.id) setOverId(item.id);
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const from = draggingId;
            const to = item.id;
            if (from && to && from !== to) {
                setItems((xs) => {
                    const fi = xs.findIndex((x) => x.id === from);
                    const ti = xs.findIndex((x) => x.id === to);
                    if (fi < 0 || ti < 0) return xs;
                    const n = [...xs];
                    const [moved] = n.splice(fi, 1);
                    n.splice(ti, 0, moved);
                    return n;
                });
            }
            setOverId(null); setDraggingId(null); setArmedId(null);
        },
        onDragEnd: () => { setOverId(null); setDraggingId(null); setArmedId(null); },
    });

    return { rows, fieldProps, cardProps, add, draggingId, overId };
}
