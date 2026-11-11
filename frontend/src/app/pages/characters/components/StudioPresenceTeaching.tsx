/**
 * StudioPresenceTeaching — the "Across the manuscript · no chapters yet" empty
 * state for the Presence (Voice) section. A faithful port of the Tony-page init
 * design's PresenceTeaching card (writerverse-bits/project/wv2-init.jsx): the
 * definition → draft → analysis loop illustration, the two halves in words, and
 * the "start writing their chapters" CTA.
 *
 * Shown in place of StudioPresence (the mention bar-graph) whenever the project
 * has no chapters yet — there's no manuscript to chart, so we teach the loop the
 * section will fill in once writing starts. The visuals are illustrative
 * (fixture drift bars), not real data.
 */

/** One stage of the loop: a framed glyph box with a caption beneath. */
function FlowNode({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cst-pt-node">
      <div className="cst-pt-node-box">{children}</div>
      <span className="cst-pt-node-lbl">{label}</span>
    </div>
  );
}

/** The connector between two nodes, optionally carrying a ✦ (Night Eyes) glyph. */
function FlowArrow({ glyph }: { glyph?: string }) {
  return (
    <div className="cst-pt-arrow">
      {glyph && <span className="cst-pt-arrow-mk">{glyph}</span>}
      <svg width="28" height="12" viewBox="0 0 28 12" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 6h24 M21 2l4 4-4 4" />
      </svg>
    </div>
  );
}

/** Faint preview of the drift chart that appears once chapters exist. */
const DRIFT: { n: number; drift?: 'voice' | 'pov' }[] = [
  { n: 2 }, { n: 3, drift: 'voice' }, { n: 1 }, { n: 4 }, { n: 2, drift: 'pov' }, { n: 3 },
];
function DriftMini() {
  const max = Math.max(...DRIFT.map((d) => d.n), 1);
  return (
    <div className="cst-pt-drift">
      {DRIFT.map((d, i) => (
        <span
          key={i}
          className={`cst-pt-bar${d.drift ? ` cst-pt-bar--${d.drift}` : ''}`}
          style={{ height: `${(d.n / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

interface Props {
  projectId?: string;
  character: any;
  /** Pill copy next to the heading — reflects why the section is empty
   *  (e.g. "no chapters yet" vs "no mentions yet"). */
  tag?: string;
  onWrite: () => void;
}

export function StudioPresenceTeaching({ character, tag = 'no chapters yet', onWrite }: Props) {
  const who = String(character?.name || '').trim() || 'this character';
  return (
    <div className="cst-band cst-pt">
      <div className="cst-pres-head">
        <span className="cst-band-lbl">Across the manuscript</span>
        <span className="cst-pt-pill">{tag}</span>
        <span className="cst-pres-rule" />
      </div>

      <div className="cst-pt-card">
        {/* the loop: definition → draft → analysis */}
        <div className="cst-pt-flow">
          <FlowNode label="what you pin here">
            <div className="cst-pt-chips">
              <span className="cst-pt-chip">how they sound</span>
              <span className="cst-pt-chip cst-pt-chip--gold">✦ your ideas</span>
            </div>
          </FlowNode>
          <FlowArrow glyph="✦" />
          <FlowNode label="Night Eyes drafts their chapters">
            <div className="cst-pt-draftlines">
              {[1, 0.78, 0.92, 0.6].map((w, i) => (
                <span key={i} className="cst-pt-line" style={{ width: `${w * 100}%` }} />
              ))}
              <span className="cst-pt-draftmk">✦</span>
            </div>
          </FlowNode>
          <FlowArrow />
          <FlowNode label="mentions return, analyzed">
            <DriftMini />
          </FlowNode>
        </div>

        {/* the two halves of the loop, in words */}
        <div className="cst-pt-halves">
          <div>
            <div className="cst-pt-kick cst-pt-kick--feed">What it feeds</div>
            <p className="cst-pt-copy">
              Everything you pin here — how they sound, the one line only they could say, and the
              ideas you&rsquo;ve attached — is what Night Eyes drafts their chapters from. It&rsquo;s
              how their <b>point of view</b> stays steady, their <b>voice</b> stays consistent, and
              the <b>prose</b> rings true to them.
            </p>
          </div>
          <div>
            <div className="cst-pt-kick cst-pt-kick--back">Then it comes back</div>
            <p className="cst-pt-copy">
              The moment a scene mentions {who}, every mention lands right here — charted scene by
              scene, and flagged wherever their <b className="cst-pt-em-voice">voice</b> or{' '}
              <b className="cst-pt-em-pov">POV</b> starts to drift from the character you defined.
            </p>
          </div>
        </div>

        {/* CTA → start writing */}
        <div className="cst-pt-cta">
          <button type="button" className="cst-pt-go" onClick={onWrite}>
            <span className="cst-pt-go-mk">✦</span> Start writing their chapters{' '}
            <span className="cst-pt-go-arrow">&rarr;</span>
          </button>
          <span className="cst-pt-note">Nothing written yet — their presence fills in as you go.</span>
        </div>
      </div>
    </div>
  );
}
