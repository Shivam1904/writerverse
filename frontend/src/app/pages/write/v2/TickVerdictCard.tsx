import { useMemo, useState } from 'react';
import { LENS_TYPE, ARCHETYPE_TO_TYPE, type LensTypeKey } from '../../../modules/lens/lensLibrary';
import { VerdictSnapshot, chartToVerdict } from '../../../modules/lens/LensVerdict';
import { Conflicts } from '../../../modules/lensKit/VerdictCard';
import type { TickVerdict } from './tickVerdicts';

/* TickVerdictCard — a single per-tick lens verdict, for the chapters analysis
 * margin. Formatting is borrowed from the lens verdict cards (tone dot · question
 * title · type + binding sub · one-line read), but styled with the margin's own
 * global tokens: the lens --lens-* tokens are scoped to .lens-root, which this
 * margin isn't, so we reuse --ink / --sage / --clay / --serif / --ui instead
 * (inline, mirroring the verdict cards — no new CSS).
 *
 * One sentence, tinted by tone: holds → sage, drift → clay, unread → muted.
 *
 * Click to EXPAND: the card grows in place to reveal the full verdict box — the
 * all-tick chart glance + the drift findings — reusing the exact lens-page
 * components (VerdictSnapshot + Conflicts) wrapped in our own .lens-root so the
 * --lens-* tokens resolve here (same trick as arnKit/LensIndicator). */

/* note = descriptive (caption mode): a neutral reading, no pass/fail colour. */
const TONE_DOT = { ok: 'var(--sage)', warn: 'var(--clay)', wait: 'var(--ink-4)', note: 'var(--ink-4)' } as const;
const TONE_TEXT = { ok: 'var(--sage)', warn: 'var(--clay)', wait: 'var(--ink-3)', note: 'var(--ink-2)' } as const;

/* The lens type's glyph + label (◠ arc, ⇄ setup-payoff, …). LENS_TYPE.color uses
 * --lens-* tokens that don't resolve outside .lens-root, so the card colours the
 * glyph with a margin token — only the glyph + label text is used here. */
function lensType(typeId?: string) {
  const key = (typeId ? ARCHETYPE_TO_TYPE[typeId] : undefined) ?? (typeId as LensTypeKey) ?? 'arc';
  return LENS_TYPE[key] ?? LENS_TYPE.arc;
}

export function TickVerdictCard({ v, projectId }: { v: TickVerdict; projectId?: string }) {
  const lt = lensType(v.typeId);
  const [open, setOpen] = useState(false);
  const ltKey = (v.typeId ? ARCHETYPE_TO_TYPE[v.typeId] : undefined) ?? (v.typeId as LensTypeKey) ?? 'arc';
  const unit = (v.chart?.axis?.tick ? `${v.chart.axis.tick}s` : 'scenes');
  // the full verdict box, built from the chart this tick came from — only when open.
  const full = useMemo(() => (open && v.chart ? chartToVerdict(v.chart) : null), [open, v.chart]);

  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 10,
      background: 'color-mix(in srgb, var(--surface) 74%, transparent)',
    }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{
          display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'transparent',
          padding: 11, cursor: 'pointer', color: 'inherit', borderRadius: 10,
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0, background: TONE_DOT[v.tone] }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>
              {v.question}
            </div>
            <div style={{
              fontFamily: 'var(--ui)', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2,
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            }}>
              <span>{lt.glyph} {lt.label}</span>
              {v.binding && <span>· {v.binding}</span>}
            </div>
          </div>
          <span style={{
            flexShrink: 0, marginTop: 2, fontSize: 10, color: 'var(--ink-4)',
            transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
          }}>▾</span>
        </div>
        <p style={{ margin: '7px 0 0', fontFamily: 'var(--serif)', fontSize: 12, lineHeight: 1.46, color: TONE_TEXT[v.tone] }}>
          {v.sentence}
        </p>
      </button>

      {open && full && (
        <div className="lens-root" style={{ padding: '0 11px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ borderTop: '1px solid var(--lens-line)', paddingTop: 11 }}>
            <VerdictSnapshot verdict={full} type={ltKey} unit={unit} />
          </div>
          {full.conflicts.length > 0 && <Conflicts conflicts={full.conflicts} projectId={projectId} />}
        </div>
      )}
    </div>
  );
}

/* A titled group of per-tick verdicts ("Lenses on this scene"). Renders nothing
 * when empty, so a tick no lens has read leaves no trace in the margin. */
export function TickVerdictGroup({ title, verdicts, projectId }: { title: string; verdicts: TickVerdict[]; projectId?: string }) {
  if (!verdicts.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--ui)', fontSize: 10.5,
        fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)',
      }}>
        <span>{title}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink-4)' }}>{verdicts.length}</span>
      </div>
      {verdicts.map((v) => <TickVerdictCard key={v.key} v={v} projectId={projectId} />)}
    </div>
  );
}
