import type { ComponentType } from 'react';
import { IDEAS } from '../config/lexicon';
import { PAGE_GLYPHS } from './pageGlyphs';

export type VisibleWhen = 'always' | 'has-material' | 'has-outline' | 'has-chapter';

export interface NavItem {
  id: string;
  label: string;
  emoji: string;
  /** A lucide icon or a custom nav glyph — anything taking size/strokeWidth/className. */
  icon?: ComponentType<any>;
  visibleWhen?: VisibleWhen;
  /** Visual rank within its group in the primary rail. Defaults to primary. */
  tier?: 'primary' | 'secondary';
  children?: NavItem[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface ShellState {
  /** Any raw material exists — a braindump, plot thread, grand outline, or
   *  chapter. Gates the Outline group: once there's material, the tools to
   *  structure it appear. */
  hasMaterial: boolean;
  /** A grand outline (or chapters) exists — there's structure to draft from.
   *  Gates the Write group. */
  hasOutline: boolean;
  /** chapters > 0 — the manuscript exists. Gates the See group, and makes
   *  Manuscript the landing section (see `resolveLanding`). */
  hasChapter: boolean;
  /** Per-section counts the landing ladder reads (braindumps, threads, outline,
   *  chapters) plus any display-only counts (e.g. lenses). */
  counts: Record<string, number>;
}

export function isVisible(when: VisibleWhen | undefined, s: ShellState): boolean {
  switch (when) {
    case 'has-material':
      return s.hasMaterial;
    case 'has-outline':
      return s.hasOutline;
    case 'has-chapter':
      return s.hasChapter;
    default:
      return true;
  }
}

/**
 * The nav, in three groups. The sidebar shows all of them, divided:
 *   imagine → Ideas · People · World      (gather raw material)
 *   plan    → Threads · Outline · Lenses   (give it structure)
 *   write   → Manuscript · Preview         (draft + read it back)
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Write',
    items: [
      { id: 'chapters', label: 'Manuscript', emoji: '✏️', icon: PAGE_GLYPHS.chapters.icon, tier: 'primary' },
      { id: 'preview', label: 'Preview', emoji: '📖', icon: PAGE_GLYPHS.preview.icon, tier: 'secondary' },
    ],
  },
  {
    label: 'Imagine',
    items: [
      { id: 'braindumps', label: IDEAS.page, emoji: '💡', icon: PAGE_GLYPHS.braindumps.icon, tier: 'primary' },
      { id: 'characters', label: 'Characters', emoji: '🧑‍🤝‍🧑', icon: PAGE_GLYPHS.characters.icon, tier: 'secondary' },
      { id: 'world', label: 'World', emoji: '🌍', icon: PAGE_GLYPHS.world.icon, tier: 'secondary' },
    ],
  },
  {
    label: 'Plan',
    items: [
      { id: 'plot-threads', label: 'Threads', emoji: '🧵', icon: PAGE_GLYPHS['plot-threads'].icon, tier: 'primary' },
      { id: 'outline', label: 'Outline', emoji: '🗺️', icon: PAGE_GLYPHS.outline.icon, tier: 'secondary' },
      // { id: 'gauges', label: 'Lenses', emoji: '📊', icon: PAGE_GLYPHS.gauges.icon, tier: 'primary' },
      { id: 'walks', label: 'Lenses', emoji: '📊', icon: PAGE_GLYPHS.gauges.icon, tier: 'secondary' },
    ],
  },
];

/**
 * The landing ladder (SIDEBAR_PROGRESS.md § "The routing rule"). Recomputed from
 * counts on every project open — never from last-visited — so the rail always
 * asks "what is the highest-value next activity?" and lands the author there:
 *
 *   chapters > 0  → Manuscript     (once writing begins, it stays home)
 *   outline  > 0  → Grand outline
 *   threads  > 0  → Plot threads
 *   else          → Braindumps
 *
 * The same counts gate which rail groups appear (see `isVisible` + each group's
 * `visibleWhen`), so the resolved landing always sits inside a visible group.
 */
export function resolveLanding(s: ShellState): string {
  const c = s.counts ?? {};
  if ((c.chapters ?? 0) > 0) return 'chapters';
  if ((c.outline ?? 0) > 0) return 'outline';
  if ((c.threads ?? 0) > 0) return 'plot-threads';
  return 'braindumps';
}

export const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) =>
  g.items.flatMap((i) => [i, ...(i.children ?? [])]),
);

export const DEFAULT_SECTION = 'chapters';

export function findItem(id: string | undefined): NavItem | undefined {
  return ALL_ITEMS.find((i) => i.id === id);
}

export interface ItemContext {
  item: NavItem;
  group: string;
  parent?: NavItem;
}

export function findContext(id: string | undefined): ItemContext | undefined {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.id === id) return { item, group: group.label };
      const child = item.children?.find((c) => c.id === id);
      if (child) return { item: child, group: group.label, parent: item };
    }
  }
  return undefined;
}
