/* tickVerdicts — fold the gauge board into "what each watching lens read for ONE
 * tick" (a scene or chapter id). The chart-LEVEL verdict lives in lensKit
 * (VerdictCard / chartToVerdict); this is the per-TICK slice: for a given tick,
 * every lens that actually read it contributes one line — its question, its
 * binding, and that tick's own verdict (good → holds, problem → drift), taken
 * from the chart's data_points / offending.
 *
 * Sibling of pages/threads/wobbles.ts (which does the same for a thread's BEATS);
 * this generalises to any tick id and keeps the green "holds" reads too — the
 * margin block is a "what the lenses see here" panel, not flags-only. Pure +
 * frontend-only: the gauge board already carries everything.
 *
 * Two verdict modes (mirrors the lens spec's banner/caption split):
 *   · BANNER  (the chart judges — has an engine `verdict`) → ok / warn per tick,
 *     where "warn" means THIS tick is in the engine's offending[] list. We never
 *     re-derive drift from the raw value (value!=='good' is wrong for multi-rung
 *     arc scales — the rule layer already decided which ticks drift).
 *   · CAPTION (descriptive — map, or any deferred/`none` rule → no `verdict`) →
 *     a neutral `note` tone: just the reading, no pass/fail colour. */
import { chartNote } from '../../../modules/lensKit/verdict';

export interface TickVerdict {
  /** stable react key — the binding this verdict came from. */
  key: string;
  /** the lens question (the chart's name). */
  question: string;
  /** the binding note: "scope · walk · thread". */
  binding: string;
  /** lens type id → glyph + label (resolved by the card). */
  typeId?: string;
  /** ok = holds · warn = this tick drifts · wait = not scanned · note = descriptive (no verdict). */
  tone: 'ok' | 'warn' | 'wait' | 'note';
  /** this tick's one-line reading. */
  sentence: string;
  flagged: boolean;
  /** the full board chart this verdict came from — the card expands to its full
   *  verdict box (chart glance + drift findings) on click. */
  chart: any;
}

const idOf = (x: any): string => String(x?.tick_id ?? x?.scene_id ?? x?.id ?? '');

/** Whole-text (coverage) lens: checklist / setup→payoff. These don't tag a value
 *  per scene — they ask "is each item present / paid off SOMEWHERE across the
 *  whole draft" — so they never carry per-tick data_points and can't slot into a
 *  scene/chapter group. They surface in their own "whole draft" group instead. */
function isWholeText(ch: any): boolean {
  return ch?.data_style === 'coverage'
    || ch?.type === 'checklist' || ch?.type === 'setup_payoff'
    || (Array.isArray(ch?.coverage) && ch.coverage.length > 0)
    || (Array.isArray(ch?.pairs) && ch.pairs.length > 0);
}

/** Tick tone (mirrors the banner/caption split):
 *   not scanned → wait · descriptive (no engine verdict) → note (neutral) ·
 *   judging → warn if this card is flagged, else ok. */
function toneOf(scanned: boolean, judges: boolean, flagged: boolean): TickVerdict['tone'] {
  return !scanned ? 'wait' : !judges ? 'note' : flagged ? 'warn' : 'ok';
}

function baseCard(ch: any, i: number, tone: TickVerdict['tone'], sentence: string, flagged: boolean): TickVerdict {
  return {
    key: String(ch?.binding_id ?? ch?.id ?? `${ch?.name}-${i}`),
    question: String(ch?.name || 'Lens'),
    binding: chartNote(ch),
    typeId: ch?.type,
    tone,
    sentence,
    flagged,
    chart: ch,
  };
}

/** Every per-tick lens that read `tickId`, with that tick's verdict. A lens that
 *  doesn't cover this tick (no data point AND not offending) is omitted — scene
 *  ids and chapter ids live in different walks, so a scene tick naturally matches
 *  only scene-walk charts and a chapter tick only chapter-walk charts. Whole-text
 *  (coverage) lenses are excluded here — they have no per-tick read; see
 *  `draftVerdictsFor`. Problems first. */
export function tickVerdictsFor(charts: any[], tickId?: string | null): TickVerdict[] {
  if (tickId == null || tickId === '') return [];
  const tid = String(tickId);
  const out: TickVerdict[] = [];
  for (const ch of charts || []) {
    if (isWholeText(ch)) continue;
    const dp = (ch?.data_points || []).find((d: any) => idOf(d) === tid);
    const off = (ch?.offending || []).find((o: any) => idOf(o) === tid);
    if (!dp && !off) continue;
    const scanned = !!ch?.analysed_at;
    const judges = !!String(ch?.verdict || '').trim();   // engine verdict present → banner; else caption
    const flagged = scanned && !!off;                     // the engine's OWN per-tick drift call
    const sentence = String(dp?.reasoning || off?.detail || off?.reason || '').trim()
      || (judges ? (flagged ? 'Drifts from where this lens set it.' : 'Holds here.') : 'Noted here.');
    out.push(baseCard(ch, out.length, toneOf(scanned, judges, flagged), sentence, flagged));
  }
  return out.sort((a, b) => Number(b.flagged) - Number(a.flagged));
}

/** The whole-text (coverage) lenses watching the draft — checklist / setup→payoff.
 *  They watch every chapter, not one scene, so each gets a simple "watches the
 *  whole draft" line; clicking the card opens the full verdict box (the misses /
 *  hanging setups). Independent of the focused tick. Problems first. */
export function draftVerdictsFor(charts: any[]): TickVerdict[] {
  const out: TickVerdict[] = [];
  for (const ch of charts || []) {
    if (!isWholeText(ch)) continue;
    const scanned = !!ch?.analysed_at;
    const judges = !!String(ch?.verdict || '').trim();   // checklist / payoff always judge once scanned
    const flagged = scanned && (ch?.offending || []).length > 0;  // any miss / hanging setup
    // The card carries the generic "whole draft" line; the specific misses live
    // in the expanded full verdict box (its offending list).
    out.push(baseCard(ch, out.length, toneOf(scanned, judges, flagged),
      'Watches every chapter, not one scene.', flagged));
  }
  return out.sort((a, b) => Number(b.flagged) - Number(a.flagged));
}
