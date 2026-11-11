import { Button } from '../../../ui/button';
import { Spark } from '../../../ui/marks';

/* Shared section grammar for the character studio (Identity / Arc / Voice):
 *   · SectionHead — glyph + kicker label + status + "✦ ask Night Eyes"
 *   · ReadyLine   — the readiness line under a section (green with ✓ when met)
 * The old IdeaStrip lived here until idea boxes moved to arnKit
 * (<ArnIdeaButton>/<ArnIdeaBox>, self-resolving from the ARN registry).
 * All scoped under .wv2-root via studio.css, reusing the app tokens. */

export function SectionHead({
  glyph, label, sub, ready = false, onAsk,
}: {
  glyph: string;
  label: string;
  sub?: string;
  ready?: boolean;
  onAsk?: () => void;
}) {
  return (
    <div className="cst-sechead">
      <span className={`cst-sechead-glyph${ready ? ' is-ready' : ''}`}>{glyph}</span>
      <span className="cst-sechead-lbl">{label}</span>
      {sub && <span className="cst-sechead-sub">{sub}</span>}
      <span className="cst-sechead-spacer" />
      {onAsk && (
        <Button variant="ai" onClick={onAsk}>
          <Spark /> ask Night Eyes
        </Button>
      )}
    </div>
  );
}


/* The "stack threads → weave into one outline" visual (recreated from the
 * handoff with app tokens). */
export function WeaveVisual() {
  return (
    <div className="cst-weave">
      <div className="cst-weave-stack">
        {[0, 1, 2].map((i) => (
          <div key={i} className="cst-weave-card" style={{ left: i * 9, top: i * 6 }}>
            <span style={{ width: '80%' }} />
            <span style={{ width: '55%' }} />
          </div>
        ))}
      </div>
      <svg className="cst-weave-arrow" width="26" height="20" viewBox="0 0 24 24" fill="none"
        stroke="var(--terra)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18c5 0 5-12 10-12 M4 6c5 0 5 12 10 12 M14 6h6 M14 18h6 M18 3l3 3-3 3 M18 15l3 3-3 3" />
      </svg>
      <div className="cst-weave-one">
        {[1, 0.7, 0.85, 0.55].map((w, i) => <span key={i} style={{ width: `${w * 100}%` }} />)}
      </div>
    </div>
  );
}

/* The scaffold-onboarding teaching box — the 0-thread "what you're starting
 * here" teach (scaffold chips + Draft / Invent) and the compact 1+ "draft more /
 * invent more" row. Shared between the Arc section (shown when Outline is closed)
 * and the Outline section (shown at 0–1 threads; ≥2 shows WeaveTeachBox instead). */
export function ScaffoldTeachBox({
  threadCount, onDraftScaffolds,
}: {
  threadCount: number;
  onDraftScaffolds: (focus?: 'invent') => void;
}) {
  if (threadCount === 0) {
    return (
      <div className="cst-teach">
        <div className="cst-teach-top">
          <div className="cst-teach-vis"><WeaveVisual /></div>
          <div>
            <div className="cst-teach-ttl">What you're starting here: their plot threads</div>
            <p className="cst-teach-desc">
              A <b>scaffold</b> is a ready spine of beats — like <i>Three-Act</i> or <i>Hero's Journey</i>. Add one to
              start their <b>outline</b>, or invent one from their arc. Stack several, reorder, or remove them anytime —
              nothing's locked, so there's no wrong pick.
            </p>
          </div>
        </div>
        <div className="cst-teach-actions">
          <div className="cst-teach-col">
            <div className="cst-teach-kicker">Start from a match</div>
            <div className="cst-teach-chips">
              {['Three-Act', "Hero's Journey", 'Mysterious Past'].map((nm) => (
                <span key={nm} className="cst-teach-chip">{nm}</span>
              ))}
            </div>
            <Button variant="primary" size="sm" onClick={() => onDraftScaffolds()}>
              Draft thread
            </Button>
          </div>
          <span className="cst-teach-or">OR</span>
          <div className="cst-teach-col">
            <div className="cst-teach-kicker cst-teach-kicker-gold">Build your own</div>
            <p className="cst-teach-colnote">Night Eyes builds a structure from their arc above.</p>
            <Button variant="ai" size="sm" onClick={() => onDraftScaffolds('invent')}>
              <Spark /> Draft with Night Eyes
            </Button>
          </div>
        </div>
      </div>
    );
  }
  // 1+ threads — the "weave" box now lives in the Outline section; this just
  // keeps the quick "draft / invent more" affordances.
  return (
    <div className="cst-teach-row">
      <Button variant="primary" size="sm" onClick={() => onDraftScaffolds()}>
        Draft more threads
      </Button>
      <Button variant="ai" size="sm" onClick={() => onDraftScaffolds('invent')}>
        <Spark /> Draft more with Night Eyes
      </Button>
    </div>
  );
}

/* The "now weave your threads into one outline" teaching box. Shown once a
 * character has ≥2 threads — it lives in the OUTLINE section (above the thread
 * list), not Arc. */
export function WeaveTeachBox({
  threadCount, onWeave, onDraftMore, onInventMore,
}: {
  threadCount: number;
  onWeave: () => void;
  onDraftMore: () => void;
  onInventMore: () => void;
}) {
  return (
    <div className="cst-teach cst-teach--weave">
      <div className="cst-teach-top">
        <div className="cst-teach-vis"><WeaveVisual /></div>
        <div>
          <div className="cst-teach-ttl">Now bring their threads together</div>
          <p className="cst-teach-desc">
            They have <b>{threadCount} threads</b>, but a story is <b>one outline</b>. Weave their beats into a single
            spine — you set the order, and nothing's locked.
          </p>
        </div>
      </div>
      <div className="cst-teach-actions cst-teach-actions--weave">

        <Button variant="secondary" size="sm" onClick={onDraftMore}>+ Add more threads</Button>
        <Button variant="ai" size="sm" onClick={onInventMore}>
          <Spark /> Add thread with Night Eyes
        </Button>
        <Button variant="ai" size="sm" onClick={onWeave}>
          <Spark /> Merge into one outline
        </Button>
      </div>
    </div>
  );
}

/* A tiny muted trend sparkline for a scaffold card (secondary accent). The real
 * scaffold data carries no shape, so we derive a gentle deterministic curve from
 * its id — purely decorative. */
export function ShapeMini({ seed, n = 8, color = 'var(--ink-3)' }: { seed: string; n?: number; color?: string }) {
  const len = Math.max(3, Math.min(n, 10));
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  const shape = Array.from({ length: len }, (_, i) =>
    3 + Math.round(2.4 * (1 + Math.sin((i / (len - 1)) * Math.PI * 1.4 + (h % 7)))),
  );
  const w = 84, ht = 22, max = Math.max(...shape), min = Math.min(...shape), span = Math.max(max - min, 1);
  const xy = shape.map((v, i) => [4 + (i / (len - 1)) * (w - 8), ht - 3 - ((v - min) / span) * (ht - 8)]);
  const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg width={w} height={ht} style={{ display: 'block' }} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="1.5" fill={color} />)}
    </svg>
  );
}

export function ReadyLine({
  ready, children,
}: {
  ready: boolean;
  children: any;
}) {
  return (
    <div className={`cst-ready${ready ? ' is-ready' : ''}`}>
      {ready && <span className="cst-ready-check">✓</span>}
      <span>{children}</span>
    </div>
  );
}
