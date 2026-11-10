import type { PendingProposal } from './useProposalStore';

/**
 * How old a pending proposal is, for the bell: a plain "2 days ago" line on each
 * card, newest-first order, and the badge counting only recent ones. Old
 * proposals are never dismissed for being old; they just sink to the bottom.
 */

/** The bell's badge counts proposals from the last this-many days. */
export const RECENT_DAYS = 7;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/** "just now", "today", "2 days ago", "3 weeks ago", "1 month ago", "2 years ago". */
export function suggestedAgo(createdAt: number, now: number = Date.now()): string {
  const ms = Math.max(0, now - createdAt);
  if (ms < HOUR) return 'just now';
  const days = Math.floor(ms / DAY);
  if (days < 1) return 'today';
  if (days < 7) return plural(days, 'day');
  if (days < 30) return plural(Math.floor(days / 7), 'week');
  if (days < 365) return plural(Math.floor(days / 30), 'month');
  return plural(Math.floor(days / 365), 'year');
}

/** Made in the last RECENT_DAYS? No `createdAt` counts as recent. */
export function isRecent(p: PendingProposal, now: number = Date.now()): boolean {
  return p.createdAt == null || now - p.createdAt < RECENT_DAYS * DAY;
}

/** Newest first; no `createdAt` sorts as newest. Returns a new array. */
export function sortNewestFirst(pending: PendingProposal[]): PendingProposal[] {
  const t = (p: PendingProposal) => p.createdAt ?? Infinity;
  return [...pending].sort((a, b) => t(b) - t(a));
}
