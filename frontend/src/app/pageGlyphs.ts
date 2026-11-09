import type { ComponentType } from 'react';
import { Globe, Lightbulb, PenLine, Users, Gauge, BookOpen, Footprints } from 'lucide-react';
import { IDEAS } from '../config/lexicon';
import { OutlineGlyph, PlotThreadGlyph } from './nav-glyphs';

/**
 * Global page-glyph config — the single source of truth for page iconography.
 *
 * Keyed by the `:section` route segment (the same id NAV_GROUPS items use and
 * the `/project/:projectId/:section` route resolves). The primary sidebar nav
 * reads its icons from here, as does the proposal rail card's bottom-left
 * destination indicator and anywhere else a page needs its mark — so each page's
 * glyph is defined exactly once and can't drift between surfaces.
 *
 * Glyphs are lucide icons or the custom monoline marks in `nav-glyphs.tsx`;
 * both share the same call shape (`size` / `strokeWidth` / `className`).
 */
export interface PageGlyph {
  /** A lucide icon or a custom nav glyph — anything taking size/strokeWidth/className. */
  icon: ComponentType<any>;
  /** Human-facing page name, for tooltips / aria labels. */
  label: string;
}

export const PAGE_GLYPHS: Record<string, PageGlyph> = {
  chapters: { icon: PenLine, label: 'Manuscript' },
  braindumps: { icon: Lightbulb, label: IDEAS.page },
  characters: { icon: Users, label: 'People' },
  world: { icon: Globe, label: 'World' },
  'plot-threads': { icon: PlotThreadGlyph, label: 'Plot threads' },
  outline: { icon: OutlineGlyph, label: 'Grand outline' },
  gauges: { icon: Gauge, label: 'Lenses' },
  walks: { icon: Footprints, label: 'Walks' },
  preview: { icon: BookOpen, label: 'Preview' },
};

/** The glyph for a section id, if one is defined. */
export function pageGlyph(section?: string): PageGlyph | undefined {
  return section ? PAGE_GLYPHS[section] : undefined;
}
