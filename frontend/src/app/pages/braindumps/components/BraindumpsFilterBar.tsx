import { Fragment } from 'react';
import { ideaColorOf, isColorIdea } from './colorIdea';
import { useEntityTags } from './entityTags';
import { displayTag } from './typedTags';
import { Chip, Input } from '../../../ui';

/**
 * BraindumpsFilterBar — the Ideas page filter + search strip, below the header.
 * Updated to use unified Chip and Input components from the design system.
 */
export function BraindumpsFilterBar({
  items,
  query,
  onQueryChange,
  active,
  onFilterChange,
}: {
  items: any[];
  query: string;
  onQueryChange: (q: string) => void;
  active: string;
  onFilterChange: (f: string) => void;
}) {
  const { groups, groupOf, titleOf, isEntity } = useEntityTags();
  const total = items.length;
  if (total === 0) return null;

  const pinnedCount = items.filter((i) => i.pinned).length;

  // Tally every distinct tag actually present on the ideas (idea-count, deduped
  // within an idea). The color-tag is handled separately as a swatch, below.
  const tally = new Map<string, number>();
  for (const it of items) {
    for (const t of new Set<string>(it.tags || [])) {
      if (t && !isColorIdea(t)) tally.set(t, (tally.get(t) || 0) + 1);
    }
  }

  // Split present tags into groups (via the index) vs uncategorised (custom
  // #tags). A tag equal to its heading title is the lead, not a leaf chip.
  const groupLeaves = new Map<string, { tag: string; count: number; entity: boolean }[]>();
  const seenOrder: string[] = [];
  const flatTags: { key: string; label: string; count: number }[] = [];
  for (const [t, n] of tally) {
    const key = groupOf(t);
    if (!key) { flatTags.push({ key: `tag:${t}`, label: t.replace(/^#/, ''), count: n }); continue; }
    if (!groupLeaves.has(key)) { groupLeaves.set(key, []); seenOrder.push(key); }
    if (titleOf(key) !== t) groupLeaves.get(key)!.push({ tag: t, count: n, entity: isEntity(t) });
  }
  // Group idea-count = ideas with any tag resolving to that group key.
  const groupCount = (key: string) =>
    items.filter((it) => (it.tags || []).some((t: string) => groupOf(t) === key)).length;
  const colorByKey = new Map(groups.map((g) => [g.key, g.color] as const));
  const inOrder = groups.map((g) => g.key).filter((k) => groupLeaves.has(k));
  const orderedKeys = [...inOrder, ...seenOrder.filter((k) => !inOrder.includes(k))];
  const presentGroups = orderedKeys.map((key) => ({
    key,
    title: titleOf(key) ?? key,
    color: colorByKey.get(key) ?? '',
    count: groupCount(key),
    leaves: groupLeaves.get(key)!.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
  }));
  flatTags.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // Which group (if any) the active filter belongs to — drives which sublist is open.
  const activeGroup = active.startsWith('tag:') ? groupOf(active.slice(4)) : null;

  // Colour filters — one swatch per accent colour actually in use.
  const colorTally = new Map<string, number>();
  for (const it of items) {
    const c = ideaColorOf(it.tags);
    if (c) colorTally.set(c, (colorTally.get(c) || 0) + 1);
  }
  const colorFilters = [...colorTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => ({ key: `color:${c}`, color: c, count: n }));

  // No lone "All": it only earns its place once another filter exists.
  const hasFilters = pinnedCount > 0 || colorFilters.length > 0 || presentGroups.length > 0 || flatTags.length > 0;

  const chip = (key: string, label: string, count: number) => (
    <Chip
      key={key}
      variant="filter"
      pressed={active === key}
      count={count}
      onClick={() => onFilterChange(key)}
      role="button"
      tabIndex={0}
    >
      {label}
    </Chip>
  );

  return (
    <div className="flex items-center flex-wrap gap-1.5 pb-1.5">
      {hasFilters && chip('all', 'All', total)}
      {pinnedCount > 0 && chip('pinned', 'Pinned', pinnedCount)}
      {colorFilters.map((f) => (
        <Chip
          key={f.key}
          variant="filter"
          pressed={active === f.key}
          count={f.count}
          dot={f.color}
          onClick={() => onFilterChange(f.key)}
          role="button"
          tabIndex={0}
          title={`Colour ${f.color}`}
        />
      ))}

      {presentGroups.map((g) => {
        const headActive = active === `group:${g.key}`;
        const open = headActive || activeGroup === g.key;
        return (
          <Fragment key={g.key}>
            <Chip
              variant="filter"
              pressed={open}
              count={g.count}
              dot={g.color}
              onClick={() => onFilterChange(`group:${g.key}`)}
              role="button"
              tabIndex={0}
              title={`Filter to the ${g.title} group`}
            >
              {g.title}
            </Chip>
            {open && g.leaves.map((lf) => {
              const key = `tag:${lf.tag}`;
              return (
                <Chip
                  key={key}
                  variant="filter"
                  pressed={active === key}
                  count={lf.count}
                  dot={lf.entity ? g.color : undefined}
                  onClick={() => onFilterChange(key)}
                  role="button"
                  tabIndex={0}
                  className="font-medium px-2"
                >
                  {displayTag(lf.tag)}
                </Chip>
              );
            })}
          </Fragment>
        );
      })}

      {flatTags.map((f) => (
        <Chip
          key={f.key}
          variant="filter"
          pressed={active === f.key}
          count={f.count}
          onClick={() => onFilterChange(f.key)}
          role="button"
          tabIndex={0}
        >
          {f.label}
        </Chip>
      ))}

      <span className="flex-1" />

      <Input
        variant="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search ideas…"
        aria-label="Search ideas"
        wrapClassName="w-[160px]"
      />
    </div>
  );
}
