import { stripIdeaColor } from './colorIdea';
import { useEntityTags } from './entityTags';
import { displayTag, entityTagOf, parseTag } from './typedTags';
import { useState } from 'react';
import { Chip, Button } from '../../../ui';
import { ideaDestinations } from '../../../modules/sectionMarker';

interface EntInfo {
  tag: string;
  kind: string | null;
  user: boolean;
  tags: string[];
}

function EntityTag({
  name,
  color,
  user,
  destinations,
  open,
  onToggle,
}: {
  name: string;
  color: string;
  user?: boolean;
  destinations: string[];
  open: boolean;
  onToggle?: () => void;
}) {
  // The chip says WHO and WHERE it goes: "Rosa → Backstory · Internal arc" are
  // sections on Rosa's page that will show this idea. Clicking opens the
  // editor below the row (one Remove there, not an × on every tag).
  const where = destinations.join(' · ');
  return (
    <Chip
      variant="entity"
      size="xs"
      dot={color}
      author={user}
      pressed={open}
      tooltip={where ? `Shows on ${name}'s page: ${destinations.join(', ')}` : undefined}
      onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
      role={onToggle ? 'button' : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onKeyDown={onToggle ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } } : undefined}
      aria-expanded={onToggle ? open : undefined}
      className={onToggle ? 'cursor-pointer' : undefined}
      data-no-drag
    >
      <span className="font-semibold">{name}</span>
      {where && <span className="text-muted-foreground">→ {where}</span>}
    </Chip>
  );
}

function EntityEditor({
  name,
  craft,
  onRemoveTag,
  onRemove,
  onDone,
}: {
  name: string;
  craft: string[];
  onRemoveTag?: (tag: string) => void;
  onRemove?: () => void;
  onDone: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-[11px]" data-no-drag>
      <span className="text-muted-foreground">{name}:</span>
      {craft.length === 0 && <span className="text-muted-foreground italic">no topics</span>}
      {craft.map((t) => (
        <Button
          key={t}
          variant="secondary"
          size="xs"
          aria-label={`Remove topic ${displayTag(t)} from ${name}`}
          onClick={(e) => { e.stopPropagation(); onRemoveTag?.(t); }}
          disabled={!onRemoveTag}
        >
          {displayTag(t)} <span aria-hidden="true" className="opacity-60">×</span>
        </Button>
      ))}
      {onRemove && (
        <Button variant="destructive" size="xs" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          Remove {name}
        </Button>
      )}
      <Button variant="ghost" size="xs" className="ml-auto" onClick={(e) => { e.stopPropagation(); onDone(); }}>
        Done
      </Button>
    </div>
  );
}

function UserTag({
  name,
  custom,
  onRemove,
}: {
  name: string;
  custom?: boolean;
  onRemove?: () => void;
}) {
  return (
    <Chip
      variant="tag"
      size="xs"
      onRemove={onRemove}
      data-no-drag
    >
      {custom && <span className="font-bold text-muted-foreground mr-0.5">#</span>}
      {name}
    </Chip>
  );
}

export function TagRow({
  tags,
  aiData,
  onRemove,
}: {
  tags: any;
  aiData?: any;
  onRemove?: (tag: string) => void;
}) {
  const { colorOf } = useEntityTags();
  const [editing, setEditing] = useState<string | null>(null);

  const visible: string[] = stripIdeaColor(tags) || [];
  if (!visible.length) return null;

  const ai = aiData || {};
  const entityTagsMap = new Map<string, string[]>();
  const aiEntityTags = new Set<string>();
  for (const e of (Array.isArray(ai.entities) ? ai.entities : [])) {
    const et = entityTagOf(e);
    if (!et) continue;
    aiEntityTags.add(et);
    entityTagsMap.set(et, (e.tags || []).filter(Boolean));
  }
  const aiCraft = new Set<string>((Array.isArray(ai.tags) ? ai.tags : []).filter(Boolean));

  const visibleCraft = new Set(visible.filter((t) => !parseTag(t).isEntity));
  const attributed = new Set<string>();
  for (const arr of entityTagsMap.values()) {
    for (const t of arr) {
      if (visibleCraft.has(t)) attributed.add(t);
    }
  }

  const seen = new Set<string>();
  const entities: EntInfo[] = [];
  const looseCraft: string[] = [];
  const userTags: string[] = [];
  for (const t of visible) {
    if (seen.has(t)) continue;
    seen.add(t);
    const parsed = parseTag(t);
    if (parsed.isEntity) {
      const own = (entityTagsMap.get(t) || []).filter((x) => visibleCraft.has(x));
      entities.push({
        tag: t,
        kind: parsed.kind,
        user: !aiEntityTags.has(t),
        tags: own,
      });
    } else if (aiCraft.has(t)) {
      if (!attributed.has(t)) looseCraft.push(t);
    } else {
      userTags.push(t);
    }
  }

  if (!entities.length && !looseCraft.length && !userTags.length) return null;

  // Every entity gets its own chip, grouped by kind (people together, places
  // together); the row wraps instead of hiding names behind '+N' (wrt-119).
  const kindOrder: string[] = [];
  for (const e of entities) {
    const k = e.kind || '_other';
    if (!kindOrder.includes(k)) kindOrder.push(k);
  }
  const ordered = kindOrder.flatMap((k) => entities.filter((e) => (e.kind || '_other') === k));

  const editingEnt = ordered.find((e) => e.tag === editing);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {ordered.map((e) => (
          <EntityTag
            key={e.tag}
            name={displayTag(e.tag)}
            color={colorOf(e.tag) || 'var(--terra)'}
            user={e.user}
            destinations={ideaDestinations(e.kind || '', e.tags)}
            open={editing === e.tag}
            onToggle={onRemove ? () => setEditing((cur) => (cur === e.tag ? null : e.tag)) : undefined}
          />
        ))}
        {looseCraft.map((t) => (
          <Chip
            key={t}
            variant="inside"
            size="xs"
            dot="var(--ink-4)"
            onRemove={onRemove ? () => onRemove(t) : undefined}
            data-no-drag
            className="text-muted-foreground font-semibold"
          >
            {displayTag(t)}
          </Chip>
        ))}
        {userTags.map((t) => {
          const isCustom = t.startsWith('#');
          return (
            <UserTag
              key={t}
              name={displayTag(t)}
              custom={isCustom}
              onRemove={onRemove ? () => onRemove(t) : undefined}
            />
          );
        })}
      </div>
      {editingEnt && (
        <EntityEditor
          name={displayTag(editingEnt.tag)}
          craft={editingEnt.tags}
          onRemoveTag={onRemove}
          onRemove={onRemove ? () => { onRemove(editingEnt.tag); setEditing(null); } : undefined}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export function renderQuotedItalics(text: string) {
  const m = text.match(/^([\s\S]*?)("[^"]*"|"[^"]*")([\s\S]*)$/);
  if (!m) return text;
  return (
    <>
      {m[1]}
      <em>{m[2]}</em>
      {m[3]}
    </>
  );
}
