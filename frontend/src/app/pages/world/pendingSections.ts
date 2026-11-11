/**
 * World — pending "add to world" proposals, bucketed by the section they file
 * into, so the page can render each one IN CONTEXT (a pending rule inside the
 * Rules section, a pending item as a card in Things…) instead of a single lump.
 *
 * Two capabilities feed the same surface — both already route to section
 * `'world'` and are suppressed in the right rail, deferring to this page:
 *   - `add_worldbuilding`        — a direct AI add ({title, content, tags, section}).
 *   - `run_init_elements` item/rule — the braindump-extraction fan-out
 *     ({type:'item', name, item:{…}} / {type:'rule', text, rule:{…}}).
 *
 * The tag→section mapping mirrors `data.ts` exactly (same `structuralCat` /
 * `customTag` / group* helpers) so a pending entry lands in the SAME section the
 * row will live in once accepted. Extracted items → Things, extracted rules →
 * Rules. Author button-adds never create proposals (direct WRITE), so only AI /
 * extraction suggestions ever surface here.
 */
import { useMemo } from 'react';
import { usePendingByCapability } from '../../modules/proposal';
import type { PendingProposal } from '../../modules/proposal/useProposalStore';
import {
  block_key,
  structuralCat,
  customTag,
  groupTitle,
  groupHint,
  groupKind,
  groupAddLabel,
  STRUCTURAL_VISUAL,
} from './data';

export type WorldSectionKind = 'rules' | 'places' | 'things' | 'bullets';

/** One pending add, normalized onto the section it targets + enough descriptor
 *  to synthesize that section if it isn't on the page yet. */
export interface PendingWorldItem {
  proposal: PendingProposal;
  /** Matches the `id` of the WorldSection it files into. */
  sectionKey: string;
  kind: WorldSectionKind;
  title: string;
  line?: string;
  from?: string;
  // ── descriptor for a phantom (not-yet-rendered) section ──
  sectionTitle: string;
  sectionHint: string;
  sectionAddLabel: string;
  glyph?: string;
  color?: string;
}

function s(v: any): string {
  return String(v ?? '').trim();
}

/** Descriptor for a structural bucket (places / things / rules). */
function structuralDescriptor(cat: 'places' | 'things' | 'rules') {
  const vis = STRUCTURAL_VISUAL[cat];
  return {
    sectionKey: cat,
    kind: groupKind(cat),
    sectionTitle: groupTitle(cat),
    sectionHint: groupHint(cat),
    sectionAddLabel: groupAddLabel(cat),
    glyph: vis.glyph,
    color: vis.color,
  };
}

/** Descriptor for a custom-tag bucket (renders as a bullet list). */
function customDescriptor(tag: string) {
  const label = s(tag) || 'Notes';
  return {
    sectionKey: block_key(label) || 'notes',
    kind: 'bullets' as const,
    sectionTitle: label,
    sectionHint: '',
    sectionAddLabel: 'item',
    glyph: undefined as string | undefined,
    color: undefined as string | undefined,
  };
}

function fromAddWorldbuilding(p: PendingProposal): PendingWorldItem | null {
  const r = p.result ?? {};
  const title = s(r.title);
  if (!title) return null;
  const tags: string[] = Array.isArray(r.tags) ? r.tags : (r.section ? [r.section] : []);
  const cat = structuralCat({ tags });
  const desc = cat ? structuralDescriptor(cat) : customDescriptor(customTag({ tags }) || 'Notes');
  return { proposal: p, title, line: s(r.content) || undefined, ...desc };
}

function fromInitElement(p: PendingProposal): PendingWorldItem | null {
  const r = p.result ?? {};
  if (r.type === 'item') {
    const inner = r.item ?? {};
    const title = s(r.name) || s(inner.name);
    if (!title) return null;
    return {
      proposal: p,
      title,
      line: s(inner.description) || undefined,
      ...structuralDescriptor('things'),
    };
  }
  if (r.type === 'rule') {
    const inner = r.rule ?? {};
    const title = s(r.text) || s(inner.text);
    if (!title) return null;
    return {
      proposal: p,
      title,
      from: s(inner.scope) || undefined,
      ...structuralDescriptor('rules'),
    };
  }
  return null; // character / story file elsewhere (cast / threads)
}

/** Pure: fold both capabilities' pending proposals into normalized world items.
 *  Exported for unit testing — the hook is a thin reactive wrapper. */
export function normalizeWorldPending(
  addWorldbuilding: PendingProposal[],
  initElements: PendingProposal[],
): PendingWorldItem[] {
  const out: PendingWorldItem[] = [];
  for (const p of addWorldbuilding) {
    const it = fromAddWorldbuilding(p);
    if (it) out.push(it);
  }
  for (const p of initElements) {
    const it = fromInitElement(p);
    if (it) out.push(it);
  }
  return out;
}

export interface WorldPending {
  items: PendingWorldItem[];
  bySection: Map<string, PendingWorldItem[]>;
  total: number;
}

/** Reactive read of all pending world-add proposals, bucketed by section. */
export function useWorldPending(): WorldPending {
  const addWb = usePendingByCapability('add_worldbuilding');
  const initEls = usePendingByCapability('run_init_elements');
  return useMemo(() => {
    const items = normalizeWorldPending(addWb, initEls);
    const bySection = new Map<string, PendingWorldItem[]>();
    for (const it of items) {
      const arr = bySection.get(it.sectionKey);
      if (arr) arr.push(it);
      else bySection.set(it.sectionKey, [it]);
    }
    return { items, bySection, total: items.length };
  }, [addWb, initEls]);
}
