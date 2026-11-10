import type { ReactNode } from 'react';

/**
 * A hint — the softer cousin of a Proposal.
 *
 * A Proposal carries a BINDING operation (Accept materialises a DB row). A hint
 * carries no mutation: its only commitment is "go look" (navigate) or "dismiss".
 * So it renders as a lighter, borderless version of the proposal card.
 *
 * Two orthogonal axes shape it (mirrors how proposals split capability vs page):
 *   • `page`   — the target section. Drives BOTH the destination glyph AND which
 *                per-page body template renders (HINT_TEMPLATE_BY_PAGE). This is
 *                the "format differently based on the page" axis.
 *   • `intent` — how loud the hint is. `start` = an actionable "you haven't begun
 *                X yet" nudge (terracotta accent + a CTA verb). `tip` = a softer
 *                informational note (gold accent, the whole card is the link).
 *
 * Loose-typed on purpose (app convention): `data` is whatever the page's
 * template wants to read.
 */
export interface Hint {
  id: string;
  /** Section id, e.g. 'characters' | 'plot-threads' | 'world' | 'outline' |
   *  'braindumps' | 'lenses' | 'chapters'. A proposal-style 'world.meta' is
   *  tolerated — the leading segment is used. */
  page: string;
  /** Default 'tip'. */
  intent?: 'start' | 'tip';
  /** Optional explicit title; otherwise the per-page template supplies one. */
  title?: ReactNode;
  /** Template-specific payload (counts, names, lines, excerpts…). */
  data?: any;
  /** Override the start-intent CTA label (default comes from the template). */
  cta?: string;
}

/** A per-page hint renderer — title + body, keyed by section in the registry. */
export interface HintTemplate {
  /** The header title for this page's hint (falls back to when `hint.title` unset). */
  title: (hint: Hint) => ReactNode;
  /** Default CTA verb for a `start`-intent hint on this page. */
  cta: string;
  /** The per-page body block. */
  Body: (props: { hint: Hint }) => ReactNode;
}
