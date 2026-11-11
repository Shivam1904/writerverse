/**
 * TagPickerDropdown — the "+ tag" popover for a braindump item, built on the kit.
 *
 * Surface + outside-click + anchoring come from the kit `Popover`. The three
 * sections are composed from kit primitives:
 *   · colour swatches  — kit `Swatch` (+ one inline "no colour" slash swatch)
 *   · #custom-tag input — kit `Input` with a trailing add `Button`
 *   · category accordion — chevron · dot · title rows (Tailwind), kit `Chip`
 *     (variant="button", `pressed` = on) for each selectable tag.
 *
 * Layout-only Tailwind here; all visual treatment lives in the kit components.
 */
import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { Popover, Chip, Swatch, Input, Button } from '../../../ui';
import { cn } from '../../../lib/utils';
import { useEntityTags } from './entityTags';
import { displayTag } from './typedTags';
import { IDEA_COLORS, ideaColorOf, withIdeaColor } from './colorIdea';

function TagPickerBody({ tags, onEditTags }: {
  tags: string[];
  onEditTags: (tags: string[]) => void;
}) {
  const { groups } = useEntityTags();
  const [customInput, setCustomInput] = useState('');
  const tagSet = new Set(tags);
  const current = ideaColorOf(tags);
  const setColor = (c: string | null) => onEditTags(withIdeaColor(tags, c));

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    const seeded = new Set(tags);
    for (const g of groups) {
      if (seeded.has(g.title) || g.items.some((it: any) => seeded.has(it.tag))) init.add(g.key);
    }
    return init;
  });

  function toggle(tag: string) {
    const next = new Set(tagSet);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onEditTags(Array.from(next));
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addCustom() {
    const raw = customInput.trim().replace(/^#/, '');
    if (!raw) return;
    const tag = `#${raw}`;
    if (!tagSet.has(tag)) onEditTags([...tags, tag]);
    setCustomInput('');
  }

  return (
    <div className="flex flex-col">
      {/* colour swatches */}
      <div className="flex items-center justify-center gap-2 border-b border-border px-3 pb-2.5">
        {/* no colour — the diagonal-slash swatch */}
        <button
          type="button"
          title="No colour"
          aria-label="No colour"
          aria-pressed={!current}
          onClick={() => setColor(null)}
          className="h-[18px] w-[18px] rounded-full transition-transform hover:scale-110"
          style={{
            background: 'var(--surface-2)',
            backgroundImage:
              'linear-gradient(135deg, transparent 44%, var(--ink-3) 44%, var(--ink-3) 56%, transparent 56%)',
            boxShadow: !current
              ? '0 0 0 2px var(--surface), 0 0 0 3.5px var(--ink-3)'
              : 'inset 0 0 0 1px var(--line-2)',
          }}
        />
        {IDEA_COLORS.map((c) => (
          <Swatch
            key={c}
            color={c}
            selected={current === c}
            onClick={() => setColor(current === c ? null : c)}
            title={c}
            aria-label={`Colour ${c}`}
          />
        ))}
      </div>

      {/* custom tag */}
      <div className="border-b border-border px-2.5 py-2.5">
        <Input
          variant="text"
          fieldSize="sm"
          placeholder="#custom-tag"
          // Fill the ~268px popup so the add button stays inside it.
          wrapClassName="flex w-full"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          trailingAction={
            <Button
              variant="ghost"
              size="icon-sm"
              className="-mr-1.5 shrink-0"
              onClick={addCustom}
              aria-label="Add custom tag"
            >
              <Plus size={14} />
            </Button>
          }
        />
      </div>

      {/* categories */}
      <div className="flex flex-col pt-1">
        {groups.map((group: any) => {
          const isOpen = expanded.has(group.key);
          return (
            <div key={group.key} className="flex flex-col">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggleExpand(group.key)}
                className="flex min-h-[30px] w-full items-center gap-2 px-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]"
              >
                <ChevronRight
                  size={12}
                  strokeWidth={2}
                  className={cn('shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')}
                />
                <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: group.color }} />
                <span className="flex-1 truncate font-sans text-[12px] font-bold text-foreground">{group.title}</span>
              </button>
              {isOpen && (
                <div className="flex flex-wrap gap-1.5 px-2.5 pb-2 pl-[26px] pt-1">
                  {group.items.map((it: any) => (
                    <Chip
                      key={it.tag}
                      variant="button"
                      size="sm"
                      dot={it.entity ? group.color : undefined}
                      pressed={tagSet.has(it.tag)}
                      onClick={() => toggle(it.tag)}
                      className="cursor-pointer"
                      title={displayTag(it.tag)}
                    >
                      {/* Long names (a full character name) end in "…" instead of
                          widening the popup into a sideways scroll. */}
                      <span className="min-w-0 truncate">{displayTag(it.tag)}</span>
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "+ tag" trigger + the kit Popover. Controlled so the card can pin its gutter. */
export function TagPickerButton({ open, onOpenChange, tags, onEditTags }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: string[];
  onEditTags: (tags: string[]) => void;
}) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      width={268}
      className="max-h-[360px] overflow-y-auto p-0 py-2.5"
      trigger={
        <Button variant="dashed" size="xs" title="Edit tags">
          <Plus size={11} /> tag
        </Button>
      }
    >
      <TagPickerBody tags={tags} onEditTags={onEditTags} />
    </Popover>
  );
}
