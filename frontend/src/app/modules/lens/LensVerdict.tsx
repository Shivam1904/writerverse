import { useState } from 'react';
import { ARCHETYPE_TO_TYPE, chartReading, type LensTypeKey } from './lensLibrary';
import { normStr } from '../lensKit/scope';

/* LensVerdict — the reusable "chart + one-line verdict" snapshot, shared by:
 *   · the section-lens verdict card  (heading = the lens question)
 *   · the lens attach panel's bindings (heading = the summary line)
 * The CALLER owns the heading; this owns the chart (by lens type) + the green /
 * rust verdict line. The chart base is the per-tick bar glance; checklist lenses
 * read as pass / miss pills instead. Everything is driven by a MappedVerdict —
 * chartToVerdict (below) maps a raw gauge-board chart into one, generic across
 * section lenses and library lenses alike. */

const norm = normStr;

export interface VerdictBar {
  v: number; flag: boolean; ghost: boolean; label?: string; reason?: string;
  /** the human value/state read at this tick — shown on hover ("what's happening here"). */
  value?: string;
  /** the drift detail when flagged — shown on hover. */
  detail?: string;
  /** tracker: the categorical state at this tick + its stable colour index (y_items position). */
  state?: string; stateIdx?: number;
  /** payoff: did this setup pay off? */
  paid?: boolean;
  /** this tick's source (beat / scene / thread beat) was edited AFTER the lens last
   *  scanned — the bar is coloured stale (gold), the verdict may be out of date. */
  stale?: boolean;
}

/** tracker state palette — colour IS the encoding here (which state), cycled by the
 *  state's y_items position so a state keeps one colour across the ribbon. */
const STATE_COLORS = [
  'var(--lens-purple)', 'var(--lens-gold)', 'var(--lens-green)',
  '#5f86bf', 'var(--lens-rust)', 'var(--lens-muted-2)',
] as const;

const idOf = (x: any): string => String(x?.tick_id ?? x?.scene_id ?? x?.id ?? '');
export interface VerdictConflict {
  where: string; text: string;
  tickId?: string;          // the offending tick (scene/chapter id) → deep-link target
  walk?: 'thread' | 'chapter' | 'outline';
  reasoning?: string;       // the data point's own note for this tick, if any (muted)
}
export interface MappedVerdict {
  tone: 'ok' | 'warn' | 'wait';
  scanned: boolean;
  /** any tick edited since the last scan — chart-level flag, used to show the stale
   *  cue when the chart has no per-tick bars to colour (checklist / payoff). */
  stale: boolean;
  /** why it's stale, from the server: "edited since last scan" or "order changed
   *  since this lens ran" (an act / chapter / scene / beat it reads was moved). */
  staleReason: string;
  headline: string;
  bars: VerdictBar[];
  conflicts: VerdictConflict[];
  sceneCount: number;
  /** nothing to read yet: the walk has no ticks (an empty book / thread), so a
   *  read would score nothing. The run button stays hidden (SA-270). */
  empty?: boolean;
  /** the chart's exact x-axis tick noun, pluralised (scenes / beats / chapters /
   *  headings / …), from axis.tick. Labels the count under the chart. */
  tickNoun: string;
  flagCount: number;
  /** how to read this chart, from its rule (label + checks). Drives the caption. */
  reading?: { label: string; checks: string };
  /** arc only — how well the line matches its intended shape (0–100), with the
   *  target trend word ("rising" / "flat" / …). Same number the dashboard card shows
   *  (engine score × 100). null for shapes with no monotone score. */
  shapeScore?: number | null;
  shapeWord?: string;
  /** the ordered-ladder extremes (arc / map only) for the scale legend. */
  scaleLow?: string;
  scaleHigh?: string;
}

const TONE_COLOR = { ok: 'var(--lens-green-deep)', warn: 'var(--lens-rust)', wait: 'var(--lens-muted)' } as const;

/* the chart — base is per-tick bars (height = value on the good↔problem ladder;
 * a problem tick reads rust + flagged; an unread tick is a faint dashed ghost).
 * Checklist lenses instead read as pass (✓) / miss (✕) / unread (○) pills. */
export function VerdictBars({ bars, type, h = 40, onHover }:
  { bars: VerdictBar[]; type?: LensTypeKey; h?: number; onHover?: (b: VerdictBar | null) => void }) {
  // hover wiring shared by every shape — hovering a mark reports it up so the
  // snapshot can show "what's happening here"; leaving clears it.
  const hov = (b: VerdictBar) => ({
    onMouseEnter: () => onHover?.(b),
    onMouseLeave: () => onHover?.(null),
    style: { cursor: 'default' as const },
  });

  if (type === 'checklist') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: h }}>
        {bars.map((b, i) => {
          const ok = !b.flag && !b.ghost;
          return (
            <span key={i} {...hov(b)} title={`${b.label ? b.label + ' — ' : ''}${b.reason ?? ''}`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 99, fontSize: 12, cursor: 'default',
                background: ok ? 'var(--lens-green-wash)' : b.ghost ? 'transparent' : 'var(--lens-rust-wash)',
                color: ok ? 'var(--lens-green-deep)' : b.ghost ? 'var(--lens-muted)' : 'var(--lens-rust)',
                border: '1px solid ' + (ok ? 'transparent' : b.ghost ? 'var(--lens-line-2)' : 'rgba(176,87,63,.5)'),
              }}>
              {ok ? '✓' : b.ghost ? '○' : '✕'}
            </span>
          );
        })}
      </div>
    );
  }
  // tracker — a ribbon of per-tick state segments; colour = the state (runs read
  // as adjacent same-colour blocks). A single-occupancy breach reads as a rust
  // outline; a tick with no state is a faint dashed gap. NOT height-bars: the
  // states are categorical, so height (which implies order) would mislead.
  if (type === 'tracker') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: h }}>
        {bars.map((b, i) => (
          <span key={i} {...hov(b)} title={`${b.label ? b.label + ' — ' : ''}${b.state ?? 'absent'}${b.reason ? ` · ${b.reason}` : ''}${b.stale ? ' · edited since last scan' : ''}`}
            style={{
              flex: 1, minWidth: 8, height: 16, borderRadius: 3, cursor: 'default',
              background: b.ghost ? 'transparent' : STATE_COLORS[(b.stateIdx ?? 0) % STATE_COLORS.length],
              border: b.stale ? '2px solid var(--lens-gold)' : b.ghost ? '1px dashed var(--lens-line-2)' : b.flag ? '2px solid var(--lens-rust)' : '1px solid transparent',
              opacity: b.ghost ? 0.5 : 1,
            }} />
        ))}
      </div>
    );
  }

  // setup→payoff — sparse bars with gaps: each setup is a slot; a paid-off setup
  // is a filled gold bar, a still-hanging one is a short dashed gap.
  if (type === 'payoff') {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: h }}>
        {bars.map((b, i) => (
          <span key={i} {...hov(b)} title={`${b.label ?? ''}${b.reason ? ` — ${b.reason}` : ''} · ${b.paid ? 'pays off' : 'hanging'}`}
            style={{
              width: 16, height: b.paid ? h * 0.7 : h * 0.34, borderRadius: '3px 3px 0 0', cursor: 'default',
              background: b.paid ? 'var(--lens-gold-wash)' : 'transparent',
              border: b.paid ? '1px solid var(--lens-gold-soft)' : '1px dashed var(--lens-line-2)',
            }} />
        ))}
      </div>
    );
  }

  // map — a heatmap row: equal cells, colour INTENSITY = the value (light→dark),
  // never rust. Reads as a pattern you interpret, not a trajectory being judged —
  // visibly distinct from arc's height-bars. An unread tick is a faint dashed gap.
  if (type === 'map') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: h }}>
        {bars.map((b, i) => (
          <span key={i} {...hov(b)} title={`${b.label ? b.label + ' — ' : `scene ${i + 1} — `}${b.value ?? ''}${b.reason ? ` · ${b.reason}` : ''}${b.stale ? ' · edited since last scan' : ''}`}
            style={{
              flex: 1, minWidth: 10, height: 26, borderRadius: 3, cursor: 'default',
              background: b.stale ? 'var(--lens-gold-wash)' : b.ghost ? 'transparent' : `rgba(95,134,191,${(0.2 + 0.8 * Math.min(1, b.v)).toFixed(2)})`,
              border: b.stale ? '1px solid var(--lens-gold-soft)' : b.ghost ? '1px dashed var(--lens-line-2)' : '1px solid transparent',
            }} />
        ))}
      </div>
    );
  }

  // arc — value-per-tick height bars (the good↔problem ladder). A flagged tick
  // (in the engine's offending list) reads rust; an unread tick is a ghost.
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: h }}>
      {bars.map((b, i) => {
        const ph = Math.max(4, b.v * h);
        return (
          <span key={i} {...hov(b)} title={`scene ${i + 1}${b.label ? ` · ${b.label}` : ''}${b.reason ? ` — ${b.reason}` : ''}${b.stale ? ' · edited since last scan' : ''}`}
            style={{
              width: 20, height: ph, borderRadius: '3px 3px 0 0', cursor: 'default',
              background: b.stale ? 'var(--lens-gold-wash)' : b.flag ? 'var(--lens-rust-wash)' : b.ghost ? 'transparent' : 'rgba(95,134,191,.42)',
              border: b.stale ? '1px solid var(--lens-gold-soft)' : b.flag ? '1px solid rgba(176,87,63,.5)' : b.ghost ? '1px dashed var(--lens-line-2)' : '1px solid transparent',
            }} />
        );
      })}
    </div>
  );
}

/* the reusable snapshot — the one-line verdict (green / rust) + the chart glance.
 * `unit` labels the tick count ("scenes" by default, "beats" for thread walks). */
export function VerdictSnapshot({ verdict, type, unit }:
  { verdict: MappedVerdict; type?: LensTypeKey; unit?: string }) {
  const c = TONE_COLOR[verdict.tone];
  // coverage types count items / setups, not scenes — the bars aren't per-tick.
  // Otherwise the count uses the chart's exact tick noun (verdict.tickNoun);
  // `unit` is an optional caller override.
  const countNoun = type === 'checklist' ? 'items' : type === 'payoff' ? 'setups' : (unit ?? verdict.tickNoun ?? 'scenes');
  const [hovered, setHovered] = useState<VerdictBar | null>(null);
  const hasScale = verdict.scaleHigh != null || verdict.scaleLow != null;
  // stale cue: when the chart's bars are per-tick (arc/map/tracker) the changed
  // bars already colour gold; for chart shapes whose bars aren't tick-keyed
  // (checklist pills / payoff slots) show a chart-level gold note instead.
  const staleBars = verdict.bars.some((b) => b.stale);
  // an order change is never shown by the bars (nothing was edited), so it
  // always gets the note.
  const orderChanged = !!verdict.staleReason && verdict.staleReason !== 'edited since last scan';
  const showStaleNote = verdict.stale && (!staleBars || orderChanged);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* chart — full width, on its own row above the read */}
      {verdict.bars.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* arc: a vertical high↕low axis (height encodes the value). */}
            {type === 'arc' && hasScale && (
              <div className="ui" style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                height: 40, fontSize: 9, lineHeight: 1.1, color: 'var(--lens-muted)', textAlign: 'right',
              }}>
                <span>{verdict.scaleHigh}</span>
                <span>{verdict.scaleLow}</span>
              </div>
            )}
            {/* flex:1 → tracker/map cells stretch to fill; fixed-mark types (arc /
                checklist / payoff) lay out left-to-right across the full width. */}
            <div style={{ flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'hidden' }}>
              <VerdictBars bars={verdict.bars} type={type} onHover={setHovered} />
            </div>
            {/* map: a colour-intensity key (colour, not height, encodes the value). */}
            {type === 'map' && hasScale && (
              <div className="ui" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9, color: 'var(--lens-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(95,134,191,1)' }} />{verdict.scaleHigh}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(95,134,191,.25)' }} />{verdict.scaleLow}
                </span>
              </div>
            )}
          </div>
          <span className="ui" style={{ fontSize: 9.5, color: 'var(--lens-muted)', display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8, marginTop: 4, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            {showStaleNote && <span style={{ color: 'var(--lens-gold)' }}>{verdict.staleReason || 'edited since last scan'}</span>}
            {verdict.shapeScore != null && (
              <span style={{ color: c, fontWeight: 700, fontSize: 11.5, letterSpacing: 'normal', textTransform: 'none' }}>
                {verdict.shapeScore}% {verdict.shapeWord || 'match'}
              </span>
            )}
            <span>{verdict.sceneCount} {countNoun}</span>
          </span>
        </div>
      )}
      {/* the plain-words read — now BELOW the chart, full width */}
      <p style={{ margin: 0, fontFamily: 'var(--lens-serif)', fontSize: 15, lineHeight: 1.5, color: c, fontWeight: 500 }}>{verdict.headline}</p>

      {/* the strip below the chart: on hover → what's happening at that mark;
          otherwise → how to read this chart (from its rule). */}
      {hovered ? (
        <div className="ui" style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--lens-ink-soft)', borderTop: '1px solid var(--lens-line)', paddingTop: 6 }}>
          <b style={{ color: 'var(--lens-ink)' }}>{hovered.label || 'this tick'}</b>
          {hovered.value && <span> · {hovered.value}</span>}
          {hovered.reason && <span style={{ color: 'var(--lens-muted)' }}> — {hovered.reason}</span>}
          {hovered.flag && hovered.detail && <span style={{ color: 'var(--lens-rust)' }}> · {hovered.detail}</span>}
        </div>
      ) : verdict.reading ? (
        // The RULE this lens checks — not its result. Labels like "All present"
        // read as a verdict on their own, so the "Rule:" kicker says what this
        // line is; the result is the headline above (SA-259).
        <div className="ui" title="The rule this lens checks — the result is the line above"
          style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11.5, lineHeight: 1.4, color: 'var(--lens-muted)' }}>
          <span>Rule:</span>
          <span style={{ color: 'var(--lens-ink-soft)', fontWeight: 600 }}>{verdict.reading.label}</span>
          <span>— {verdict.reading.checks}</span>
        </div>
      ) : null}
    </div>
  );
}

/* map a raw gauge-board chart (the bound lens) to the verdict snapshot's shape:
 *   · y_items     — [{value:'problem'}, {value:'good'}]   (low→high)
 *   · ticks       — the x-axis [{id,label,text}] (one per scene / beat)
 *   · data_points — [{tick_id, value:'good'|'problem'|null, reasoning}]
 *   · offending   — [{rule, detail, label?, scene_id?}]  (the drift findings)
 *   · verdict     — the engine's plain-words read (string) · analysed_at — scanned? */
export function chartToVerdict(chart: any): MappedVerdict {
  const typeKey: LensTypeKey =
    (chart?.type ? ARCHETYPE_TO_TYPE[chart.type] : undefined) ?? (chart?.type as LensTypeKey) ?? 'arc';
  const yItems: any[] = chart?.y_items || [];
  const n = Math.max(1, yItems.length);
  const yIdx = (v: any) => yItems.findIndex((y) => norm(y.value) === norm(v));

  const ticks: any[] = (chart?.ticks?.length ? chart.ticks : (chart?.data_points || []).map((d: any) => ({ id: d.tick_id, label: '' })));
  const dpById = new Map<any, any>((chart?.data_points || []).map((d: any) => [d.tick_id, d]));
  // tick id → its human label/text, so an offending item resolves to a readable
  // location ("Escaping Shadows…") instead of leaking its raw id ("RI-87AAD864").
  const tickLabelById = new Map<string, string>();
  for (const t of ticks) {
    const lbl = (t?.label || t?.text || '').toString().trim();
    if (t?.id != null && lbl) tickLabelById.set(String(t.id), lbl);
  }

  const scanned = !!chart?.analysed_at;
  // ticks (by id) whose source was edited since the last scan — the backend
  // computes this (build_board) by comparing each tick's edited_at to analysed_at.
  const staleSet = new Set<string>((chart?.stale_ticks || []).map(String));
  const offending: any[] = chart?.offending || [];
  const flagCount = offending.length;
  const offIds = new Set(offending.map((o: any) => idOf(o)).filter(Boolean));
  // tick id → the engine's drift detail for that tick (shown on hover when flagged).
  const offDetailById = new Map<string, string>();
  for (const o of offending) {
    const id = idOf(o);
    if (id) offDetailById.set(id, String(o.detail || o.text || '').trim());
  }

  // Bars are type-shaped: checklist ← coverage[] (pills), payoff ← pairs[] (sparse
  // setup→payoff), tracker ← per-tick state (ribbon), arc/map ← per-tick value
  // (height bars). A bar flags ONLY when the engine put that tick in offending —
  // never re-derived from the raw value (value!=='good' is wrong for multi-rung scales).
  let bars: VerdictBar[];
  if (typeKey === 'checklist') {
    bars = (chart?.coverage || []).map((c: any) => {
      const present = c.covered ?? c.present;
      return {
        v: 0, ghost: false, flag: !present,
        label: c.y_item ?? c.label, reason: c.evidence ?? c.reason ?? c.detail,
        value: present ? 'present' : 'missing', detail: present ? undefined : 'not present in the text',
      };
    });
  } else if (typeKey === 'payoff') {
    bars = (chart?.pairs || []).map((p: any) => ({
      v: 0, ghost: false, flag: !p.paid, paid: !!p.paid,
      label: p.setup, reason: p.evidence,
      value: p.paid ? 'pays off' : 'still hanging', detail: p.paid ? undefined : 'no payoff scene yet',
    }));
  } else if (typeKey === 'tracker') {
    bars = ticks.map((t: any) => {
      const dp = dpById.get(t.id);
      const val = dp?.value ?? null;
      const idx = val != null ? yIdx(val) : -1;
      return {
        v: 1, ghost: idx < 0, flag: offIds.has(String(t.id)),
        label: t.label, reason: dp?.reasoning, value: val ?? 'absent',
        detail: offDetailById.get(String(t.id)), state: val ?? undefined, stateIdx: idx,
        stale: staleSet.has(String(t.id)),
      };
    });
  } else {
    bars = ticks.map((t: any) => {
      const dp = dpById.get(t.id);
      const val = dp?.value ?? null;
      const idx = val != null ? yIdx(val) : -1;
      const ghost = idx < 0;
      return {
        v: ghost ? 0.08 : (idx + 1) / n,
        flag: !ghost && offIds.has(String(t.id)),
        ghost, label: t.label, reason: dp?.reasoning,
        value: val ?? (ghost ? 'not read here' : undefined),
        detail: offDetailById.get(String(t.id)),
        stale: staleSet.has(String(t.id)),
      };
    });
  }

  // An outdated reading (edited or reordered since it ran) is never a green 'ok':
  // it reads muted, like an unread lens, until it's read again (not rust: nothing was found).
  const tone: MappedVerdict['tone'] = !scanned || (!flagCount && chart?.stale) ? 'wait' : flagCount ? 'warn' : 'ok';

  // the backend's explicit signal (build_board `has_content`): nothing written for
  // this lens to read. Never guessed from `ticks` — coverage lenses always send
  // ticks=[] even on a full book. Missing flag → not empty.
  const empty = chart?.has_content === false;
  const verdictText = typeof chart?.verdict === 'string' ? chart.verdict.trim() : '';
  // Attaching runs no AI (SA-270), so an unscanned lens is "not read yet" — it
  // waits for the author's "Read my story", it is not mid-read.
  const headline = verdictText
    || (!scanned ? (empty ? 'Nothing to read yet. Write a scene first, then read your story.' : 'Not read yet.')
      : flagCount ? `${flagCount} scene${flagCount > 1 ? 's' : ''} drift from where you set them.`
        : 'Holds — consistent across the draft, no drift found.');

  const walk: VerdictConflict['walk'] =
    chart?.thread_ref ? 'thread' : chart?.axis?.tick === 'chapter' ? 'chapter' : 'outline';
  const conflicts: VerdictConflict[] = offending.map((o: any) => {
    const tickId = o.tick_id ?? o.scene_id ?? o.id ?? null;
    const dp = tickId != null ? dpById.get(tickId) : undefined;
    return {
      where: o.label || o.where || (tickId != null ? tickLabelById.get(String(tickId)) : undefined) || 'across the draft',
      text: o.detail || o.text || '',
      tickId: tickId != null ? String(tickId) : undefined,
      walk,
      reasoning: (o.reasoning || dp?.reasoning || '').toString().trim() || undefined,
    };
  });

  // how-to-read caption (from the chart's rule) + the ordered-ladder extremes for
  // the scale legend. Only arc / map have an ordered low→high ladder to label.
  const reading = chartReading(chart);
  const ordered = typeKey === 'arc' || typeKey === 'map';
  const scaleLow = ordered && yItems.length ? (yItems[0]?.value ?? undefined) : undefined;
  const scaleHigh = ordered && yItems.length ? (yItems[yItems.length - 1]?.value ?? undefined) : undefined;

  // the exact tick noun this chart walks (scene / beat / chapter / heading / …),
  // pluralised. Falls back to the thread/outline binary only if axis.tick is absent.
  const tick = chart?.axis?.tick || (chart?.thread_ref ? 'beat' : 'scene');
  const tickNoun = /s$/.test(tick) ? tick : `${tick}s`;

  // arc score — how well the line matches its intended shape (engine score × 100),
  // paired with the target trend word. Same number the gauges dashboard card shows.
  const shapeScore = typeKey === 'arc' && typeof chart?.score === 'number'
    ? Math.round(chart.score * 100) : null;
  const shapeWord = chart?.math_rule || chart?.rule || '';

  return { tone, scanned, stale: !!chart?.stale, staleReason: chart?.stale_reason || '', headline, bars, conflicts, sceneCount: bars.length, empty, tickNoun, flagCount, reading, scaleLow, scaleHigh, shapeScore, shapeWord };
}
