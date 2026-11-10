/**
 * Notification slug → glyph + accent. THE constants file the spec asked for:
 * a sender's `slug` is translated here into a system glyph.
 *
 * Two slug families:
 *   • SECTION slugs  ("characters", "world", "outline", …) — reuse the global
 *     PAGE_GLYPHS marks so a notification wears the same icon as the page it
 *     points at. (See how the world rail maps sections → glyphs.)
 *   • KIND slugs     ("info", "success", "warning", …) — generic flavours.
 *
 * Unknown / empty slug falls back to a bell.
 */
import type { ComponentType } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Info, Sparkles } from 'lucide-react';
import { PAGE_GLYPHS } from '../../pageGlyphs';

export interface NotifGlyph {
  icon: ComponentType<any>;
  accent: string;
}

const KIND_GLYPHS: Record<string, NotifGlyph> = {
  info: { icon: Info, accent: 'var(--teal)' },
  success: { icon: CheckCircle2, accent: 'var(--sage)' },
  warning: { icon: AlertTriangle, accent: 'var(--gold)' },
  alert: { icon: AlertTriangle, accent: 'var(--terra)' },
  system: { icon: Sparkles, accent: 'var(--mauve)' },
};

// Per-section accent (the icon itself comes from PAGE_GLYPHS).
const SECTION_ACCENT: Record<string, string> = {
  characters: 'var(--terra)',
  world: 'var(--teal)',
  'plot-threads': 'var(--mauve)',
  outline: 'var(--gold)',
  braindumps: 'var(--gold)',
  chapters: 'var(--ink-2)',
  lenses: 'var(--teal)',
  'lenses-bank': 'var(--teal)',
  gauges: 'var(--sage)',
};

const DEFAULT: NotifGlyph = { icon: Bell, accent: 'var(--gold)' };

export function notificationGlyph(slug?: string): NotifGlyph {
  if (!slug) return DEFAULT;
  if (KIND_GLYPHS[slug]) return KIND_GLYPHS[slug];
  const page = PAGE_GLYPHS[slug];
  if (page) return { icon: page.icon, accent: SECTION_ACCENT[slug] ?? 'var(--gold)' };
  return DEFAULT;
}
