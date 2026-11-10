/**
 * Subtle contradiction indicators.
 *
 * Real per-scene/beat signals (StoryHealthFlag) don't reach the frontend yet
 * So for now we PLACE FLAGS as placeholders, seeded deterministically by node id so
 * they stay stable across renders (no flicker on every keystroke).
 *
 * This is the single seam: swap `buildIndicators` to read StoryHealthFlags and
 * every surface (rail dots, branch roll-up counts) updates with no UI change.
 */

import type { OutlineNode } from './tree';

export interface OutlineIndicators {
  /** node id → why it's flagged (placeholder copy for now) */
  reasonById: Record<string, string>;
  /** node id has its own flag */
  has: (id: string) => boolean;
  /** count of flagged nodes in this node's subtree (incl. self) — for collapsed branches */
  countIn: (node: OutlineNode) => number;
}

// stable 32-bit hash of a string
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PLACEHOLDER_REASONS = [
  'A thread expects this beat earlier in the story',
  'Conflicts with an established character state',
  'A planted setup here has no payoff yet',
  'Timeline: this lands after an event it should precede',
  'A world rule declared elsewhere is broken here',
];

// Only scenes and beats carry contradiction flags; ~1 in 6, deterministic.
function isFlagged(node: OutlineNode): boolean {
  if (node.level !== 'scene' && node.level !== 'beat') return false;
  return hash(node.id) % 6 === 0;
}

export function buildIndicators(nodes: OutlineNode[]): OutlineIndicators {
  const reasonById: Record<string, string> = {};
  const countCache = new Map<string, number>();

  const walk = (n: OutlineNode): number => {
    let count = 0;
    if (isFlagged(n)) {
      reasonById[n.id] = PLACEHOLDER_REASONS[hash(n.id) % PLACEHOLDER_REASONS.length];
      count += 1;
    }
    for (const c of n.children) count += walk(c);
    countCache.set(n.id, count);
    return count;
  };
  nodes.forEach(walk);

  return {
    reasonById,
    has: (id) => id in reasonById,
    countIn: (node) => countCache.get(node.id) ?? 0,
  };
}
