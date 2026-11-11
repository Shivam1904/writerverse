/* verdict.ts: one lens result → a board verdict (holds / warn / open / noting) and
 * its short label. Shared by the Lenses page (walks) and the Gauges overview, so
 * both count "still holding" and "to look at" the same way. */

export type Verdict = 'holds' | 'warn' | 'open' | 'noting';

export function deriveVerdict(c: any): { verdict: Verdict; label: string } {
  if (c.mode === 'descriptive') return { verdict: 'noting', label: 'noting' };
  // An outdated reading (edited or reordered since the lens ran) isn't "holding":
  // it counts as something to look at until the lens is read again.
  if (c.stale) return { verdict: 'warn', label: 'outdated' };
  const v = c.verdict;
  if (v?.ok === true) return { verdict: 'holds', label: 'holds' };
  if (v?.ok === false) {
    const off = (c.offending?.length) || (c.coverage ?? []).filter((b: any) => !(b.covered || b.closed)).length || 1;
    return { verdict: 'open', label: `${off} open` };
  }
  const miss = (c.coverage ?? []).filter((b: any) => !(b.covered || b.closed)).length;
  if (miss > 0) return { verdict: 'warn', label: `${miss} missing` };
  const hasData = (c.data_points?.length > 0) || (c.coverage?.length > 0);
  if (!hasData) return { verdict: 'noting', label: 'pending' };
  return { verdict: 'holds', label: 'holds' };
}
