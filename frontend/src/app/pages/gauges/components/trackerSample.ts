/**
 * trackerSample — the shared synthetic "journey" a tracker preview draws, so the
 * lanes (line) and cells (grid) visuals render the SAME movement + the SAME rule
 * break, just two ways. Section-sourced trackers have no scale yet, so callers
 * fall back to SAMPLE lanes; the mechanic + the catch still read true.
 */

export const SAMPLE = ['one place', 'another', 'a third'];
export const N = 8;

// per-lane colours for the cells grid (the line view uses a single journey hue)
export const LANE_COLORS = ['var(--terra)', 'var(--teal)', 'var(--mauve)', 'var(--sage)', 'var(--gold)'];

export interface Journey {
  seq: number[];          // state index per scene (the subject's path)
  second: number;         // a 2nd lit lane (one-at-a-time break) or -1
  secondCol: number;      // the scene that lane lights in, or -1
  teleport: number;       // scene index of an impossible jump, or -1
  breaks: Set<number>;    // scene indices that violate the rule
}

export function journeyFor(rule: string, R: number): Journey {
  const clamp = (v: number) => Math.max(0, Math.min(R - 1, Math.round(v)));
  const at = Math.max(2, Math.min(N - 2, Math.floor(N * 0.55)));
  let seq: number[] = Array.from({ length: N }, (_, i) => clamp((Math.sin(i * 0.85) * 0.5 + 0.5) * (R - 1)));
  let second = -1, secondCol = -1, teleport = -1;
  let breaks: number[] = [];
  if (rule === 'single_occupancy') {
    secondCol = at; second = clamp(seq[at] + 1 < R ? seq[at] + 1 : seq[at] - 1); breaks = [at];
  } else if (rule === 'no_jump') {
    seq = Array.from({ length: N }, (_, i) => (i < at ? 0 : R - 1)); teleport = at; breaks = [at];
  } else if (rule === 'monotone_up') {
    seq = Array.from({ length: N }, (_, i) => clamp(((R - 1) * i) / (N - 1))); seq[at] = clamp(seq[at] - 1); breaks = [at];
  } else if (rule === 'monotone_down') {
    seq = Array.from({ length: N }, (_, i) => clamp((R - 1) * (1 - i / (N - 1)))); seq[at] = clamp(seq[at] + 1); breaks = [at];
  } else if (rule === 'cover_once') {
    seq = Array.from({ length: N }, (_, i) => clamp(Math.floor(i / 2))); seq[N - 1] = 0; breaks = [N - 1];
  } // ai / none / unknown → clean wander, no break
  return { seq, second, secondCol, teleport, breaks: new Set(breaks) };
}

export function captionFor(rule: string): string {
  return rule === 'single_occupancy' ? 'in two lanes at the same scene'
    : rule === 'no_jump' ? 'jumps lanes with no scene in between'
    : rule === 'monotone_up' ? 'slips to a lower lane'
    : rule === 'monotone_down' ? 'rises to a higher lane'
    : rule === 'cover_once' ? 'returns to a lane it already left'
    : 'breaks the rule here';
}

export function isCleanRule(rule: string): boolean {
  return rule === 'ai' || rule === 'none' || !rule;
}
