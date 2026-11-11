import { useEffect, useRef, useState } from 'react';
import { Lightbulb, Trash2 } from 'lucide-react';
import { TagRow } from './TagRow';
import { PinStar } from './EditableBody';
import { TagPickerButton } from './TagPickerDropdown';
import { ideaColorOf } from './colorIdea';
import { annotationFailed, tagsOutOfDate, tmpId } from '../data';
import { Button, DragHandle, Card } from '../../../ui';
import { cn } from '../../../lib/utils';
import { aspectColor } from '../../../theme/aspects';
import { useFieldList } from '../../showcase/useFieldList';
import { useIdeaAutosave } from '../useIdeaAutosave';
import { ASSISTANT_NAME } from '../../../../config/lexicon';
import '../braindumps-items.css'; // keyframes: bd-focus-pulse (rail-focus card pulse)

/**
 * StreamView — the idea stream. Each row is a single editable text field driven
 * by the shared `useFieldList` (the same model as the showcase Ideas page):
 *   · click the card → focus its field; focused card shows a primary border
 *   · Enter → save + add a new idea below; Backspace (empty) → delete + focus prev
 *     (a saved idea goes through onDelete, so it gets the same Undo toast)
 *   · Arrows hop between fields; drag the card reorders the stream
 * Persistence stays braindumps-specific: typing updates the TanStack cache
 * optimistically (via useFieldList → writeItems). Edits to a saved idea are
 * autosaved 1.5 s after the last keystroke, and right away on blur or when the
 * page unmounts (useIdeaAutosave → onEditBody; SA-134). A fresh tmp row is
 * created on blur (onAddBraindump), or on unmount if it has text.
 * The focused row comes from `rows`, so a refetch mid-typing can't wipe it.
 *
 * The idea-tree rail's phrase click steers ?focus=<id>; the matching card gets a
 * one-shot `.bd-focused` pulse (BraindumpsPage scrolls it into view).
 */
export function StreamView({
  visibleItems,
  writeItems,
  onEditBody,
  onTogglePin,
  onAddBraindump,
  onEditTags,
  onDelete,
  onRetryAnnotate,
  onRetag,
  focusId,
}: any) {
  // Original text captured on focus so blur can revert (existing rows) or drop
  // (empty tmp rows) without a needless write.
  const originalTextRef = useRef<Record<string | number, string>>({});
  // Text typed into fresh, never-saved rows (tmp ids). Kept so leaving the page
  // can still create them, and so the leave warning knows they're unsaved.
  const newDraftsRef = useRef(new Map<string | number, string>());

  const autosave = useIdeaAutosave(
    (id, body) => onEditBody?.(id, body),
    () => [...newDraftsRef.current.values()].some((t) => t.trim() !== ''),
  );

  // Save a fresh row as a new idea (blur, or leaving the page). Same flow as
  // before SA-134: drop the tmp row so the add doesn't duplicate it; if the add
  // fails, put the typed text back as an unsaved row so it isn't lost.
  const commitNewRow = async (row: any, text: string) => {
    newDraftsRef.current.delete(row.id);
    delete originalTextRef.current[row.id];
    writeItems((prev: any[]) => prev.filter((it: any) => it.id !== row.id));
    const ok = await onAddBraindump?.(text);
    if (ok === false) {
      writeItems((prev: any[]) => [{ ...row, body: text }, ...prev]);
      newDraftsRef.current.set(row.id, text); // still unsaved: keep the leave warning on
    }
  };
  const commitNewRowRef = useRef(commitNewRow);
  commitNewRowRef.current = commitNewRow;

  // Route change unmounts the page without a blur: create any typed new rows.
  useEffect(
    () => () => {
      for (const [id, text] of [...newDraftsRef.current]) {
        if (text.trim()) void commitNewRowRef.current({ id, body: text, pinned: false, tags: [] }, text.trim());
      }
      newDraftsRef.current.clear();
    },
    [],
  );

  // Every keystroke: a saved idea is queued for autosave; a fresh row is only
  // remembered (it's created on blur). An emptied idea isn't saved — blur puts
  // its text back, Backspace deletes it.
  const onTyped = (row: any, text: string) => {
    if (String(row.id).startsWith('tmp-')) {
      newDraftsRef.current.set(row.id, text);
    } else if (text.trim()) {
      autosave.queue(row.id, text);
    } else {
      autosave.cancel(row.id);
    }
  };

  // Blur: save now. Empty → drop a fresh row, revert a saved idea.
  const onFieldBlur = async (row: any, value: string) => {
    const original = originalTextRef.current[row.id];
    const current = value.trim();
    if (String(row.id).startsWith('tmp-')) {
      if (!newDraftsRef.current.has(row.id) && original === undefined) return; // already handled
      newDraftsRef.current.delete(row.id);
      if (!current) {
        writeItems((prev: any[]) => prev.filter((it: any) => it.id !== row.id));
      } else if (original !== current) {
        await commitNewRow(row, current);
      }
    } else if (!current) {
      autosave.cancel(row.id);
      if (original !== undefined) {
        writeItems((prev: any[]) => prev.map((it: any) => (it.id === row.id ? { ...it, body: original } : it)));
      }
    } else {
      autosave.flush();
    }
    delete originalTextRef.current[row.id];
  };

  // The trash button: forget any unsaved edit so it isn't sent after the delete.
  const deleteRow = onDelete
    ? (id: any) => {
        autosave.cancel(id);
        newDraftsRef.current.delete(id);
        onDelete(id);
      }
    : undefined;

  // Backspace in an emptied field. A fresh tmp row was never saved, so just
  // drop it. A saved idea is really deleted (with Undo) — dropping it only from
  // the cache would let the next refetch bring it back (SA-140). Its saved text
  // goes back in first, so Undo (or a failed delete) restores the real idea.
  const deleteEmptyRow = (row: any) => {
    const original = originalTextRef.current[row.id];
    delete originalTextRef.current[row.id];
    autosave.cancel(row.id);
    newDraftsRef.current.delete(row.id);
    if (String(row.id).startsWith('tmp-')) {
      writeItems((prev: any[]) => prev.filter((it: any) => it.id !== row.id));
      return;
    }
    if (original !== undefined) {
      writeItems((prev: any[]) => prev.map((it: any) => (it.id === row.id ? { ...it, body: original } : it)));
    }
    onDelete?.(row.id);
  };

  const { rows, fieldProps, cardProps, draggingId, overId } = useFieldList<any>({
    items: visibleItems,
    setItems: writeItems,
    getText: (x) => x.body || '',
    withText: (x, body) => ({ ...x, body }),
    makeEmpty: () => ({ id: tmpId(), body: '', pinned: false, tags: [] }),
    onDeleteEmpty: deleteEmptyRow,
  });

  return (
    <div className="flex flex-col gap-[22px]">
      <section className="w-full">
        {/* One idea per row, read top to bottom: the words on the left, where
            they will show up on the right (wrt-139). Long text shows 2 lines
            until you click in. */}
        {rows.length > 0 && (
          <div
            className={cn(ROW_COLS, 'gap-2.5 px-[13px] pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground')}
            aria-hidden
          >
            <span />
            <span>Idea</span>
            <span>Shows up on</span>
            <span />
          </div>
        )}
        <ul className="flex flex-col list-none p-0 m-0 animate-fade-in [&>li+li]:!border-t-border">
          {rows.map((braindump: any) => (
            <StreamItem
              key={braindump.id}
              braindump={braindump}
              cardProps={cardProps(braindump)}
              fieldProps={fieldProps(braindump)}
              draggingId={draggingId}
              overId={overId}
              originalTextRef={originalTextRef}
              onTyped={onTyped}
              onFieldBlur={onFieldBlur}
              onTogglePin={onTogglePin}
              onEditTags={onEditTags}
              onDelete={deleteRow}
              onRetryAnnotate={onRetryAnnotate}
              onRetag={onRetag}
              isFocused={String(braindump.id) === String(focusId)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The idea list's columns, shared by the header and every row so they line
 *  up: drag grip · the idea · where it shows up · actions. */
const ROW_COLS = 'grid grid-cols-[16px_minmax(0,1.25fr)_minmax(0,1fr)_112px]';

function StreamItem({
  braindump,
  cardProps,
  fieldProps,
  draggingId,
  overId,
  originalTextRef,
  onTyped,
  onFieldBlur,
  onTogglePin,
  onEditTags,
  onDelete,
  onRetryAnnotate,
  onRetag,
  isFocused,
}: any) {
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const color = ideaColorOf(braindump.tags);

  return (
    <Card
      as="li"
      variant="idea"
      accent={color}
      pinned={!!braindump.pinned}
      dragging={draggingId === braindump.id}
      data-bd-id={String(braindump.id)}
      {...cardProps}
      className={cn(
        'group items-start gap-2.5 py-3.5 !rounded-none',
        ROW_COLS,
        // focused field → primary border (matches the showcase idea rows)
        'focus-within:border-[var(--terra-soft)]',
        overId === braindump.id && draggingId !== braindump.id && 'ring-2 ring-[var(--terra-soft)]',
        // rail phrase click → one-shot gold pulse (reuses the bd-focus-pulse keyframes)
        isFocused && 'rounded-lg animate-[bd-focus-pulse_1.7s_ease-out]',
      )}
    >
      {/* Column 1: the Ideas bulb (the page's own glyph, in the Ideas gold) marks
          each idea; on hover it gives way to the drag grip (mousedown arms a
          card reorder). */}
      <div className="relative flex h-[1.5em] items-center justify-center shrink-0">
        <Lightbulb
          size={14}
          strokeWidth={1.8}
          aria-hidden
          style={{ color: aspectColor('braindumps') }}
          className="transition-opacity group-hover:opacity-0"
        />
        <DragHandle className="absolute opacity-0 transition-opacity group-hover:opacity-70 active:cursor-grabbing" />
      </div>

      {/* Column 2: the idea's text (+ subtext) */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <textarea
          {...fieldProps}
          spellCheck
          placeholder="an idea…"
          className="ty-story-body m-0 w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-[var(--ink-4)] [&:not(:focus)]:max-h-[3.2em]"
          onFocus={(e) => {
            originalTextRef.current[braindump.id] = e.target.value;
          }}
          onChange={(e) => {
            fieldProps.onChange(e);
            onTyped(braindump, e.target.value);
          }}
          onBlur={(e) => onFieldBlur(braindump, e.target.value)}
        />
        {braindump.subtext && (
          <p className="ty-story-body mt-1.5 whitespace-pre-wrap pl-2 border-l border-border text-muted-foreground text-xs">
            {braindump.subtext}
          </p>
        )}
      </div>

      {/* Column 3: where it shows up (the tags), or the tagging placeholder */}
      <div className="min-w-0 [&>div]:mt-0">
        {braindump.tagging ? (
          <TaggingSkeleton />
        ) : (
          <>
            <TagRow
              tags={braindump.tags}
              aiData={braindump.aiData}
              onRemove={(t: string) =>
                onEditTags?.(braindump.id, (braindump.tags || []).filter((x: string) => x !== t))
              }
            />
            {/* The AI tagging failed — say so quietly and offer a re-run, so it
                isn't mistaken for an idea the AI found nothing in (SA-158). */}
            {onRetryAnnotate && annotationFailed(braindump) && (
              <span className="mt-[7px] inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-no-drag>
                Couldn't tag this idea.
                <Button
                  variant="link"
                  className="text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetryAnnotate(braindump.id);
                  }}
                >
                  Try again
                </Button>
              </span>
            )}
            {/* Edited since it was tagged — the tags may describe text that is
                gone. Re-tag only when the author asks (wrt-28). */}
            {onRetag && tagsOutOfDate(braindump) && (
              <span className="mt-[7px] inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-no-drag>
                Text changed since tagging.
                <Button
                  variant="link"
                  className="text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetag(braindump.id);
                  }}
                >
                  Re-tag
                </Button>
              </span>
            )}
          </>
        )}
      </div>

      {/* Column 4: + tag, the pin and delete — in their
          own column so they never cover the text (wrt-118); delete sits last,
          apart from + tag, so it's hard to hit by mistake (wrt-121).
          data-no-drag keeps them out of the drag arm. The pin shows on its own
          once set (PinStar handles its opacity). */}
      <div className="flex items-center justify-end gap-1" data-no-drag>
        <div className="flex items-center gap-1">
          <div
            className={cn(
              'transition-opacity duration-150',
              tagPickerOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <TagPickerButton
              open={tagPickerOpen}
              onOpenChange={setTagPickerOpen}
              tags={braindump.tags || []}
              onEditTags={(newTags: string[]) => onEditTags?.(braindump.id, newTags)}
            />
          </div>
          <PinStar pinned={!!braindump.pinned} onToggle={() => onTogglePin?.(braindump.id)} />
        </div>
        {onDelete && (
          <Button
            variant="destructive"
            size="icon"
            className="h-7 w-7 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            title="Delete idea"
            aria-label="Delete idea"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(braindump.id);
            }}
          >
            <Trash2 size={12} strokeWidth={1.8} />
          </Button>
        )}
      </div>
    </Card>
  );
}

/** While the AI tags an idea: grey pill shapes where the tags will land, and
 *  a plain line saying who is doing what (wrt-117). */
function TaggingSkeleton() {
  return (
    <span className="mt-[7px] inline-flex items-center gap-1.5" aria-live="polite">
      {[44, 58, 36].map((w) => (
        <span
          key={w}
          aria-hidden
          className="h-[18px] animate-pulse rounded-full"
          style={{ width: w, background: 'var(--surface-2)' }}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{ASSISTANT_NAME} is tagging…</span>
    </span>
  );
}
