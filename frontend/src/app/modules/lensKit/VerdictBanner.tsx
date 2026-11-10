import { useState } from 'react';
import type { ChartInstance } from '../../pages/gauges/data';
import { resolveVariant, verdictCopy } from '../../pages/gauges/components/Verdict';

/* VerdictBanner — the chart card's header strip, on the lens design language.
 * The SAME verdict resolution as <Verdict> (resolveVariant + verdictCopy, the one
 * source of truth) re-skinned to the handoff: a pass/fail/neutral gradient strip
 * with a round badge, a serif lead, the detail inline, and an "i" toggle that
 * reveals the rubric below. Nothing about the verdict logic changes here. */

type Tone = 'pass' | 'fail' | 'neutral';

const TONE: Record<Tone, { strip: string; badge: string; lead: string }> = {
  pass: {
    strip: 'linear-gradient(180deg, var(--lens-green-wash), color-mix(in srgb,var(--lens-green-wash) 55%,#fff))',
    badge: 'linear-gradient(150deg,var(--lens-green),var(--lens-green-deep))',
    lead: 'var(--lens-green-deep)',
  },
  fail: {
    strip: 'linear-gradient(180deg, color-mix(in srgb,var(--lens-gold-wash) 92%,#fff), color-mix(in srgb,var(--lens-gold-wash) 60%,#fff))',
    badge: 'linear-gradient(150deg,var(--lens-rust),#8a4230)',
    lead: '#8a4230',
  },
  neutral: {
    strip: 'linear-gradient(180deg, color-mix(in srgb,var(--lens-purple-wash) 70%,#fff), color-mix(in srgb,var(--lens-purple-wash) 35%,#fff))',
    badge: 'linear-gradient(150deg,var(--lens-purple),var(--lens-purple-deep))',
    lead: 'var(--lens-ink)',
  },
};

function toneOf(variant: ReturnType<typeof resolveVariant>): Tone {
  if (variant === 'holds') return 'pass';
  if (variant === 'warn' || variant === 'open') return 'fail';
  return 'neutral';
}

function Badge({ tone, glyph }: { tone: Tone; glyph: string }) {
  return (
    <span style={{
      width: 34, height: 34, flex: '0 0 auto', display: 'grid', placeItems: 'center', borderRadius: '50%',
      color: '#fff', fontSize: 17, fontWeight: 700, background: TONE[tone].badge,
    }}>
      {tone === 'pass'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4.5 4.5L19 7" /></svg>
        : glyph}
    </span>
  );
}

export function VerdictBanner({ chart, rubric }: { chart: ChartInstance; rubric?: string }) {
  const [open, setOpen] = useState(false);
  const variant = resolveVariant(chart);
  const tone = toneOf(variant);
  const copy = verdictCopy(chart, variant);
  const line = copy.sub || chart.read_as || '';
  const glyph = tone === 'fail' ? '!' : 'i';

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '15px 20px',
        borderBottom: '1px solid var(--lens-line)', background: TONE[tone].strip,
      }}>
        <Badge tone={tone} glyph={glyph} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 15.5, fontWeight: 600, color: TONE[tone].lead, display: 'inline' }}>
            {copy.lead}
          </span>
          {line && (
            <span className="ui" style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--lens-ink-soft)', display: 'inline', marginLeft: 6 }}>
              {line}
            </span>
          )}
        </div>
        {rubric && (
          <button type="button" className={`ui focusring ld-helptoggle${open ? ' is-on' : ''}`}
            onClick={() => setOpen((o) => !o)} title="What this measures" aria-label="What this measures"
            style={{
              flex: '0 0 auto', alignSelf: 'center', width: 26, height: 26, display: 'grid', placeItems: 'center',
              border: '1px solid transparent', borderRadius: '50%', background: 'transparent',
              color: 'var(--lens-ink-soft)', fontFamily: 'var(--lens-serif)', fontStyle: 'italic', fontSize: 14,
            }}>i</button>
        )}
      </div>

      {rubric && (
        <div style={{
          overflow: 'hidden', maxHeight: open ? 200 : 0, opacity: open ? 1 : 0,
          transition: 'max-height .26s ease, opacity .2s',
          background: 'color-mix(in srgb,var(--lens-gold-wash) 40%,#fff)',
          borderBottom: open ? '1px solid var(--lens-line)' : '0',
        }}>
          <div className="ui" style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--lens-ink-soft)', padding: '13px 20px' }}>
            <b style={{ color: 'var(--lens-ink)', fontWeight: 600 }}>How to read it: </b>{rubric}
          </div>
        </div>
      )}
    </div>
  );
}
