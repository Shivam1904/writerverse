import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';
import { queries } from '../queries';
import { useEntityTagIndex } from '../pages/braindumps/components/entityTags';
import { displayTag, entityTagOf, formatTag, parseTag } from '../pages/braindumps/components/typedTags';
import { updateBraindump } from '../pages/braindumps/data';
import { SectionMark } from '../components/SectionMark';
import { callOp } from '../gateway';
import { braindumpsCopy } from '../../config/braindumps';
import './ideaTree.css';

// Entity kind → the glossy SectionMark glyph (person / thread / location / item /
// rule / magic / faction / culture / history / creature; 'world' falls to the
// initial token). So an entity branch wears its world-mark, not a flat bead.
const KIND_GLYPH: Record<string, string> = {
  char: 'person', plot: 'thread', loc: 'location', item: 'item', rule: 'rule',
  magic: 'magic', faction: 'faction', culture: 'culture', history: 'history',
  creature: 'creature', world: 'world',
};

// Category title → its SectionMark glyph (the same marks the World page wears),
// rendered light + small on the heading. Categories without a world/entity glyph
// (World / Dialogue / Theme / Other / custom) keep the flat square bead.
const _CAT_GLYPH: Record<string, string> = {
  Character: 'person', Plot: 'thread',
  Places: 'location', Items: 'item', Rules: 'rule', Magic: 'magic',
  Factions: 'faction', Culture: 'culture', History: 'history', Creatures: 'creature',
};

const SUBJECT_KINDS = new Set(['char', 'loc', 'item', 'faction', 'creature', 'magic', 'rule', 'culture', 'history']);

// Cap a branch's phrase list; the rest hides behind a "show N more".
const PHRASE_LIMIT = 20;

/* ── The idea tree (phrase-centric) ──
 * Braindumps' second rail. Hierarchy:
 *   Category (Character / Plot / Places / …)
 *     ▸ Entity  (char[Tony Stark] → "Tony Stark")
 *         · phrase text          → click focuses + highlights it on the page
 *             co-entities (glossy) + craft tags          (the phrase's annotation)
 *     ▸ unattached tags          (phrases with category tags but NO entity)
 *         ▸ tag (motivation)
 *             · phrase text
 * No idea text is shown — the leaves are the AI-extracted phrases. Clicking an
 * entity / tag / category filters the page (?filter=); clicking a phrase focuses
 * its idea (?focus=&fp=). Built from `ai_data.phrases` across every idea. */

function hashColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % 8;
  return `var(--idea-${idx + 1}, #b9b2a6)`;
}
function catColorOf(key: string, colorOf: (t: string) => string | undefined): string {
  return colorOf(key) || hashColor(key);
}

interface PhraseRef { text: string; ideaId: any; phraseIdx: number; tags: string[]; co: string[] }
interface BranchNode { tag: string; name: string; color: string; phrases: PhraseRef[] }
interface CatNode { key: string; title: string; color: string; order: number; entities: BranchNode[]; unattached: BranchNode[] }

/* One phrase leaf: the fragment text (click → focus its idea) over a faint meta
 * line of the phrase's OTHER entities (glossy) + its craft tags (flat). */
function PhraseRow({
  phrase, dragId, focusTo, colorOf,
}: { phrase: PhraseRef; dragId: string; focusTo: (id: any, text: string) => string; colorOf: (t: string) => string | undefined }) {
  // Draggable: drop onto an entity branch head to attach that entity to this
  // phrase (writes ai_data.phrases[i].entities). PointerSensor's 5px threshold
  // keeps a plain click on the link a focus-navigation, not a drag.
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: dragId,
    data: { kind: 'phrase', ideaId: phrase.ideaId, phraseIdx: phrase.phraseIdx, text: phrase.text },
  });
  const hasMeta = phrase.co.length > 0 || phrase.tags.length > 0;
  return (
    <li ref={setNodeRef} className={`bd-ph bd-ph--drag${isDragging ? ' is-dragging' : ''}`} {...listeners} {...attributes}>
      <Link className="bd-ph-link" to={focusTo(phrase.ideaId, phrase.text)} title="Focus this idea · drag onto an entity to tag it">
        <span className="bd-ph-tx">{phrase.text}</span>
      </Link>
      {hasMeta && (
        <span className="bd-ph-meta">
          {phrase.co.map((et) => (
            <span className="bd-ph-ent" key={`c-${et}`} title={`entity · ${displayTag(et)}`}>
              <span className="d" style={{ background: colorOf(et) || 'var(--terra)' }} />
              {displayTag(et)}
            </span>
          ))}
          {phrase.tags.map((t) => (
            <span className="bd-ph-tag" key={`t-${t}`}>
              <span className="d" style={{ background: colorOf(t) || 'var(--ink-4)' }} />
              {displayTag(t)}
            </span>
          ))}
        </span>
      )}
    </li>
  );
}

/* One branch (an entity, or an unattached craft tag): head (mark/bead + name +
 * count + collapse) over its phrase leaves. Entity branches wear a glossy world
 * mark (`glyph`); tag branches keep a flat bead. Head click filters the page to
 * this tag. A long phrase list is capped at PHRASE_LIMIT behind a "show N more". */
function Branch({
  node, glyph, real, kind, aliasPrimary, onPromote, onUnalias, fallbackColor, branchKey, dropTag, activeDrag,
  filterTo, focusTo, colorOf, open, onToggle,
}: {
  node: BranchNode; glyph?: string; real?: boolean; kind?: string; aliasPrimary?: string;
  onPromote?: () => void; onUnalias?: () => Promise<any> | void; fallbackColor: string;
  branchKey: string; dropTag?: string; activeDrag?: string | null;
  filterTo: (tag: string) => string; focusTo: (id: any, text: string) => string;
  colorOf: (t: string) => string | undefined; open: boolean; onToggle: () => void;
}) {
  const color = node.color || fallbackColor;
  const [showAll, setShowAll] = useState(false);
  const [showPromote, setShowPromote] = useState(false);
  // Entity branches (dropTag set) are phrase drop targets; tag branches aren't.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${branchKey}`, data: { kind: 'entity-branch', dropTag }, disabled: !dropTag,
  });
  // A non-real char CANDIDATE is a merge source — drag its head onto a real
  // character to fold it in as an alias. The branch-link doubles as the drag
  // handle; PointerSensor's 5px threshold keeps a plain click a filter-nav (same
  // as PhraseRow). Hook stays unconditional; `disabled` gates it.
  const canMerge = kind === 'char' && !real && !aliasPrimary;
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({
    id: `merge:${branchKey}`, data: { kind: 'char-merge', name: node.name }, disabled: !canMerge,
  });
  // Light only VALID targets for the active drag: a merge drag lights only real
  // character branches; a phrase drag lights any entity branch.
  const validTarget = activeDrag === 'char-merge' ? !!(real && kind === 'char') : !!dropTag;
  const overClass = isOver && validTarget
    ? (activeDrag === 'char-merge' ? ' is-merge-over' : ' is-drop-over') : '';
  const shown = showAll ? node.phrases : node.phrases.slice(0, PHRASE_LIMIT);
  const more = node.phrases.length - shown.length;
  // An entity branch: a REAL entity (in the project) wears its glossy world mark;
  // an AI-proposed CANDIDATE wears a flat tinted box. A tag branch keeps a bead.
  const mark = !glyph
    ? <span className="bd-node" />
    : real
      ? <span className="bd-emark"><SectionMark glyph={glyph} color={color} label={node.name} size={15} /></span>
      : <span
          className={`bd-emark bd-emark--box${onPromote ? ' is-draftable' : ''}`}
          style={{ ['--node-c' as any]: color }}
          title={onPromote ? 'Draft character' : 'not yet a real entity'}
        />;
  return (
    <div ref={setDropRef} className={`bd-branch${open ? ' is-open' : ''}${glyph ? ' has-mark' : ''}${canMerge ? ' is-mergeable' : ''}${isDragging ? ' is-dragging' : ''}${overClass}`} style={{ ['--node-c' as any]: color }}>
      <div className="bd-branch-head">
        <button type="button" className="bd-chev" onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'}>
          <ChevronRight size={12} strokeWidth={2} />
        </button>
        <Link
          ref={canMerge ? setDragRef : undefined}
          className="bd-branch-link"
          to={filterTo(node.tag)}
          onClick={onPromote ? (e: any) => { e.preventDefault(); e.stopPropagation(); setShowPromote(v => !v); } : undefined}
          title={canMerge ? `Show ideas — ${node.name} · drag onto a character to merge` : `Show ideas — ${node.name}`}
          {...(canMerge ? listeners : {})}
        >
          {mark}
          <span className="bd-branch-nm">{node.name}</span>
        </Link>
        {aliasPrimary && <AliasTag primary={aliasPrimary} filterTo={filterTo} onUnalias={onUnalias} />}
      </div>
      {showPromote && onPromote && (
        <div className="bd-promote-row">
          <PromoteButton onPromote={onPromote} />
        </div>
      )}
      {open && (
        <ul className="bd-phrases">
          {shown.map((p, i) => (
            <PhraseRow key={`${branchKey}:${p.ideaId}:${p.phraseIdx}:${i}`} dragId={`${branchKey}:${i}`} phrase={p} focusTo={focusTo} colorOf={colorOf} />
          ))}
          {more > 0 && (
            <li className="bd-ph bd-ph--more">
              <button type="button" className="bd-more-btn" onClick={() => setShowAll(true)}>show {more} more</button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* The candidate → character action. A candidate (an entity the AI spotted that
 * isn't a real cast member yet) is the "why it matters" of the idea tree: it can
 * become a real story element. The old "Make real" button was silent on click;
 * this one says what it does and acknowledges the press — it goes to "drafting…"
 * while the promote proposal drafts, then the parent navigates to the cast page
 * where the proposal renders for review. */
function PromoteButton({ onPromote }: { onPromote: () => Promise<any> | void }) {
  const [pending, setPending] = useState(false);
  const C = braindumpsCopy.draftCharacter;
  return (
    <button
      type="button"
      className={`bd-promote${pending ? ' is-pending' : ''}`}
      title={C.title}
      disabled={pending}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pending) return;
        setPending(true);
        try { await onPromote(); }
        finally { setPending(false); }
      }}
    >
      {pending ? C.pending : C.label}
    </button>
  );
}

/* A folded candidate. Where a candidate would show "Draft character", a MERGED
 * candidate shows a muted "alias of <primary>" chip instead — the candidate's
 * name now lives in that real character's aliases. The label filters to the
 * primary; the ✕ un-folds (removes the alias) so the Draft button comes back. */
function AliasTag({
  primary, filterTo, onUnalias,
}: { primary: string; filterTo: (tag: string) => string; onUnalias?: () => Promise<any> | void }) {
  const [pending, setPending] = useState(false);
  return (
    <span className={`bd-alias${pending ? ' is-pending' : ''}`} title={`Merged into ${primary}`}>
      <Link
        className="bd-alias-lk"
        to={filterTo(formatTag('char', primary))}
        onClick={(e) => e.stopPropagation()}
        title={`Show ideas — ${primary}`}
      >
        alias of {primary}
      </Link>
      {onUnalias && (
        <button
          type="button"
          className="bd-alias-x"
          title={`Un-merge from ${primary}`}
          disabled={pending}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (pending) return;
            setPending(true);
            try { await onUnalias(); }
            finally { setPending(false); }
          }}
        >
          <X size={10} strokeWidth={2.4} />
        </button>
      )}
    </span>
  );
}

export function BraindumpsSubList({ projectId }: { projectId: string }) {
  // Per-node open/closed override. Each node has a DEFAULT (categories open,
  // branches collapsed); `toggled` flips that default for a node.
  const [toggled, setToggled] = useState<Set<string>>(() => new Set());
  const isOpen = (key: string, def: boolean) => (toggled.has(key) ? !def : def);
  const flip = (key: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const { data: items = [], isLoading } = useQuery({
    ...queries.braindumps(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const { groups, colorOf, groupOf, titleOf, isReal, aliasOf } = useEntityTagIndex(projectId);

  // Build the phrase-centric tree: category → entities / unattached tags → phrases.
  const { cats, phraseTotal: _phraseTotal } = useMemo(() => {
    const catOrder = new Map<string, number>(groups.map((g, i) => [g.key, i] as const));
    const byCat = new Map<string, { key: string; title: string; color: string; order: number; entities: Map<string, BranchNode>; unattached: Map<string, BranchNode> }>();
    const ensureCat = (catKey: string) => {
      let c = byCat.get(catKey);
      if (!c) {
        c = {
          key: catKey,
          title: titleOf(catKey) || catKey,
          color: catColorOf(catKey, colorOf),
          order: catOrder.has(catKey) ? (catOrder.get(catKey) as number) : 999,
          entities: new Map(),
          unattached: new Map(),
        };
        byCat.set(catKey, c);
      }
      return c;
    };
    const ensureBranch = (m: Map<string, BranchNode>, tag: string) => {
      let b = m.get(tag);
      if (!b) { b = { tag, name: displayTag(tag), color: colorOf(tag) || '', phrases: [] }; m.set(tag, b); }
      return b;
    };

    let phraseTotal = 0;
    for (const it of items) {
      const phrases: any[] = it.aiData?.phrases || [];
      for (let pIdx = 0; pIdx < phrases.length; pIdx++) {
        const p = phrases[pIdx];
        const ents: string[] = [...new Set<string>((p?.entities || []).map(entityTagOf).filter(Boolean))];
        const tags: string[] = (p?.tags || []).filter(Boolean);
        phraseTotal++;
        if (ents.length) {
          for (const et of ents) {
            const catKey = groupOf(et);
            if (!catKey) continue;
            const c = ensureCat(catKey);
            const b = ensureBranch(c.entities, et);
            b.phrases.push({ text: p?.text || '', ideaId: it.id, phraseIdx: pIdx, tags, co: ents.filter((x) => x !== et) });
          }
        } else {
          for (const tg of tags) {
            const catKey = groupOf(tg);
            if (!catKey) continue;
            const c = ensureCat(catKey);
            const b = ensureBranch(c.unattached, tg);
            b.phrases.push({ text: p?.text || '', ideaId: it.id, phraseIdx: pIdx, tags: tags.filter((x) => x !== tg), co: [] });
          }
        }
      }
    }

    const byCount = (a: BranchNode, b: BranchNode) => b.phrases.length - a.phrases.length || a.name.localeCompare(b.name);
    const cats: CatNode[] = [...byCat.values()]
      .map((c) => ({
        key: c.key, title: c.title, color: c.color, order: c.order,
        entities: [...c.entities.values()].sort(byCount),
        unattached: [...c.unattached.values()].sort(byCount),
      }))
      .filter((c) => c.entities.length || c.unattached.length)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    return { cats, phraseTotal };
  }, [items, groups, groupOf, titleOf, colorOf]);

  const filterTo = (tag: string) =>
    `/project/${projectId}/braindumps?filter=${encodeURIComponent(`tag:${tag}`)}`;
  const focusTo = (id: any, text: string) =>
    `/project/${projectId}/braindumps?focus=${encodeURIComponent(String(id))}&fp=${encodeURIComponent(text)}`;

  // ── Drag a phrase onto an entity branch → attach that entity to the phrase ──
  // The only change is the phrase's entity list inside ai_data: we push
  // {kind,name} into ai_data.phrases[i].entities (+ mirror the entity tag into
  // top-level tags for the page filter), then refetch so the tree regroups.
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeText, setActiveText] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<string | null>(null);

  // ── Drag a candidate char branch onto a REAL char branch → fold it in as an
  // alias (alias_character). The opposite ✕ removes it (unalias_character).
  // Both are cheap direct WRITEs; we refetch characters so the tree re-resolves
  // the candidate to "alias of <primary>" (X-Invalidates does this too).
  const invalidateChars = () =>
    queryClient.invalidateQueries({ queryKey: queries.characters(projectId).queryKey });
  const applyMerge = async (aliasName: string, primaryName: string) => {
    try { await callOp(projectId, 'alias_character', { primary_name: primaryName, alias_name: aliasName }, 'braindumps'); }
    finally { invalidateChars(); }
  };
  const applyUnmerge = async (aliasName: string, primaryName: string) => {
    try { await callOp(projectId, 'unalias_character', { primary_name: primaryName, alias_name: aliasName }, 'braindumps'); }
    finally { invalidateChars(); }
  };

  const applyMove = async (ideaId: any, phraseIdx: number, dropTag: string) => {
    const parsed = parseTag(dropTag);
    if (!parsed.isEntity || !parsed.kind || !parsed.name) return;
    const item = items.find((it: any) => String(it.id) === String(ideaId));
    if (!item) return;
    const aiData: any = item.aiData || {};
    const phrases: any[] = Array.isArray(aiData.phrases) ? aiData.phrases : [];
    const ph = phrases[phraseIdx];
    if (!ph) return;
    const ents: any[] = Array.isArray(ph.entities) ? ph.entities : [];
    if (ents.some((e) => entityTagOf(e) === dropTag)) return; // already attached — no-op
    const nextPhrases = phrases.map((p, i) =>
      i === phraseIdx ? { ...p, entities: [...ents, { kind: parsed.kind, name: parsed.name }] } : p,
    );
    const nextAiData = { ...aiData, phrases: nextPhrases };
    const curTags: string[] = Array.isArray(item.tags) ? item.tags : [];
    const nextTags = curTags.includes(dropTag) ? curTags : [...curTags, dropTag];
    try {
      await updateBraindump(projectId, ideaId, { ai_data: nextAiData, tags: nextTags });
    } finally {
      queryClient.invalidateQueries({ queryKey: queries.braindumps(projectId).queryKey });
    }
  };

  const onDragEnd = (e: any) => {
    setActiveText(null);
    setActiveKind(null);
    const a = e.active?.data?.current;
    const o = e.over?.data?.current;
    if (a?.kind === 'phrase' && o?.kind === 'entity-branch' && o?.dropTag) {
      void applyMove(a.ideaId, a.phraseIdx, o.dropTag);
    } else if (a?.kind === 'char-merge' && o?.kind === 'entity-branch' && o?.dropTag) {
      // Merge only onto a REAL character, and never onto itself.
      const target = parseTag(o.dropTag);
      if (target.kind === 'char' && target.name && isReal(o.dropTag)
          && target.name.toLowerCase() !== String(a.name).toLowerCase()) {
        void applyMerge(a.name, target.name);
      }
    }
  };

  const subjectCats = cats.filter(c => c.entities.some(b => SUBJECT_KINDS.has(parseTag(b.tag).kind || '')));
  const themeCats = cats.filter(c => !c.entities.some(b => SUBJECT_KINDS.has(parseTag(b.tag).kind || '')));

  const renderCatGroup = (c: CatNode) => {
    const catKey = `cat:${c.key}`;
    const catOpen = isOpen(catKey, true);
    const unattKey = `unatt:${c.key}`;
    const unattOpen = isOpen(unattKey, true);
    return (
      <div key={c.key} className={`bd-grp${catOpen ? ' is-open' : ''}`}>
        <button type="button" className="bd-grp-h" onClick={() => flip(catKey)}>
          <span className="bd-grp-rule" style={{ background: c.color }} />
          <span className="bd-grp-title">{c.title}</span>
          <ChevronRight size={11} strokeWidth={2} className="bd-grp-chev" />
        </button>
        {catOpen && (
          <div className="bd-grp-body">
            {c.entities.map((b) => {
              const k = `ent:${c.key}:${b.tag}`;
              const parsed = parseTag(b.tag);
              const glyph = KIND_GLYPH[parsed.kind || ''] || 'generic';
              const real = isReal(b.tag);
              const primary = !real && parsed.kind === 'char' ? aliasOf(b.tag) : undefined;
              const onPromote = !real && !primary && parsed.kind === 'char' && parsed.name
                ? async () => {
                    try { await callOp(projectId, 'promote_to_character', { name: parsed.name }, 'characters'); }
                    finally { navigate(`/project/${projectId}/characters`); }
                  }
                : undefined;
              const onUnalias = primary && parsed.name
                ? () => applyUnmerge(parsed.name as string, primary)
                : undefined;
              return (
                <Branch key={k} node={b} glyph={glyph} real={real} kind={parsed.kind} aliasPrimary={primary}
                  onPromote={onPromote} onUnalias={onUnalias} fallbackColor={c.color}
                  branchKey={k} dropTag={b.tag} activeDrag={activeKind}
                  filterTo={filterTo} focusTo={focusTo} colorOf={colorOf} open={isOpen(k, false)} onToggle={() => flip(k)} />
              );
            })}
            {c.unattached.length > 0 && (
              <div className={`bd-subgroup${unattOpen ? ' is-open' : ''}`}>
                <button type="button" className="bd-subgroup-head" onClick={() => flip(unattKey)}>
                  <ChevronRight size={11} strokeWidth={2} className="bd-subgroup-chev" />
                  <span className="bd-subgroup-nm">unattached tags</span>
                </button>
                {unattOpen && c.unattached.map((b) => {
                  const k = `tag:${c.key}:${b.tag}`;
                  return (
                    <Branch key={k} node={b} fallbackColor={c.color} branchKey={k} filterTo={filterTo} focusTo={focusTo}
                      colorOf={colorOf} open={isOpen(k, false)} onToggle={() => flip(k)} />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="wv2-sublist">
        <span className="wv2-sublist-loading">growing your tree…</span>
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="wv2-sublist">
        <span className="wv2-sublist-empty">no ideas yet</span>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: any) => {
        const d = e.active?.data?.current;
        setActiveText(d?.text ?? d?.name ?? null);
        setActiveKind(d?.kind ?? null);
      }}
      onDragCancel={() => { setActiveText(null); setActiveKind(null); }}
      onDragEnd={onDragEnd}
    >
    <div className="bd-tree">
      {cats.length === 0 && <span className="bd-facet-empty">no phrases extracted yet</span>}
      {subjectCats.length > 0 && <div className="bd-sec">By subject</div>}
      {subjectCats.map(renderCatGroup)}
      {themeCats.length > 0 && <div className="bd-sec">By thread &amp; theme</div>}
      {themeCats.map(renderCatGroup)}
    </div>
    <DragOverlay dropAnimation={null}>
      {activeText ? <div className="bd-drag-ghost">{activeText}</div> : null}
    </DragOverlay>
    </DndContext>
  );
}
