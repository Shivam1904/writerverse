/**
 * collectLiveHints — serialise the side-rail hint cards CURRENTLY on screen into
 * the compact `string[]` Night Eyes receives as hidden context (`live_hints`).
 *
 * Single source of truth with the rail: it selects from the SAME three hint
 * sources SuggestionsRail renders, in the same top-to-bottom order —
 *   1. walk-along  (activeWalkAlongHints)
 *   2. initialize  (activeInitializeHints)
 *   3. what-to-do-next (nextStepHint)
 * — so what the author sees and what Night Eyes is told never drift.
 *
 * Callers gate on counts being loaded before calling (a half-loaded store reads
 * every count as 0 and would emit stale empty-state nudges). One short sentence
 * per visible card; there are never many at once.
 */
import { activeInitializeHints } from './initializeHints';
import { nextStepHint } from './nextStepHints';
import { activeWalkAlongHints } from './walkAlongHints';

export function collectLiveHints({
  section,
  counts,
}: {
  section?: string;
  counts: Record<string, number>;
}): string[] {
  const out: string[] = [];
  for (const h of activeWalkAlongHints({ section, counts })) out.push(h.text);
  for (const h of activeInitializeHints({ section, counts })) out.push(h.text);
  const next = nextStepHint({ section, counts });
  if (next) out.push(next.line);
  return out;
}
