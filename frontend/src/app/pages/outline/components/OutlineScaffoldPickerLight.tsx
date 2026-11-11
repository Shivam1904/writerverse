import { useNavigate, useParams } from 'react-router-dom';
import {
  SCAFFOLD_META,
  actMarker,
  useOutlineScaffoldPicker,
  type OutlineScaffoldPickerProps,
} from './outlineScaffoldPicker.shared';

/**
 * Chapters/write second init — shown once braindumps exist but the manuscript
 * has no chapters yet. Three tiers, top to bottom (same init standard as
 * ChaptersStart / PeopleInit):
 *   1 · Hero — begin on a blank page (one act, one empty chapter).
 *   2 · Frames — try preset outline shapes (or name your own acts).
 *   3 · Exits — keep braindumping or map plot threads first.
 */
export function OutlineScaffoldPickerLight({ onInit }: OutlineScaffoldPickerProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const {
    scaffolds,
    loading,
    busy,
    acts,
    setActs,
    startBlank,
    pickPreset,
    createCustom,
  } = useOutlineScaffoldPicker(onInit);

  return (
    <div className="wv2-init ol-start ol-start--light">
      <header className="wv2-init-head ol-start-head">
        <span className="wv2-init-eyebrow">Manuscript · first chapter</span>
        <h1 className="wv2-init-title">
          Let&rsquo;s start<br /><em>writing.</em>
        </h1>
        <p className="wv2-init-sub">
          Ready to write? Pick how much structure you want before the first
          chapter — or keep gathering material.
        </p>
      </header>

      {/* 1 · the confident, low-pressure path */}
      <button className="ol-hero" onClick={startBlank} disabled={busy}>
        <div className="ho-left">
          <div className="ol-kicker">Simplest start</div>
          <div className="ho-name">Begin on a blank page</div>
          <p className="ho-desc">
            One act called <b>Story</b>, one empty chapter — open the manuscript
            and start drafting now.
          </p>
          <span className="ho-cta">Start writing<svg viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg></span>
        </div>
        <div className="ho-diagram">
          <span className="dlabel">what you&rsquo;d get</span>
          <div className="bp-act"><span className="dot" />Story</div>
          <div className="bp-chap">
            <div className="row"><span className="ring" />Chapter 1</div>
            <div className="row"><span className="add">+ add when ready</span></div>
          </div>
        </div>
      </button>

      {/* 2 · preset / custom frames */}
      <div className="wv2-init-seam">
        <span className="wv2-init-seam-lbl">Try outline frames</span>
        <span className="wv2-init-seam-ln" />
      </div>

      <div className="ol-opt-grid">
        {loading ? (
          <div className="ol-start-loading">Loading frames…</div>
        ) : (
          scaffolds.map((s) => {
            const total = (s.acts || []).length;
            const meta = SCAFFOLD_META[s.id] ?? { kicker: 'Structure', desc: '' };
            const shown = (s.acts || []).slice(0, 3);
            return (
              <button
                key={s.id}
                className="ol-opt"
                onClick={() => pickPreset(s.id)}
                disabled={busy}
              >
                <div className="ol-kicker">{meta.kicker}</div>
                <div className="ol-opt-name">{s.label}</div>
                <ol className="ol-mini">
                  {shown.map((a: string, i: number) => (
                    <li key={i}><span className="n">{actMarker(i, total)}</span>{a}</li>
                  ))}
                  {total > 3 && <li className="more">+ {total - 3} more</li>}
                </ol>
                <div className="ol-opt-foot"><span>{total} acts</span><span className="go">use this →</span></div>
              </button>
            );
          })
        )}

        <div className="ol-opt ol-opt-custom">
          <div className="ol-kicker">Your frame</div>
          <div className="ol-opt-name">Name your own acts</div>
          <div className="ol-crows">
            {acts.map((a, i) => (
              <div key={i} className="ol-crow">
                <span className="n">{actMarker(i, acts.length)}</span>
                <input
                  className="ol-crow-input"
                  value={a}
                  placeholder={i === 0 ? 'Act one…' : `Act ${i + 1}…`}
                  autoFocus={i === acts.length - 1 && acts.length > 1}
                  onChange={(e) => setActs((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); setActs((prev) => [...prev, '']); }
                  }}
                />
                {acts.length > 1 && (
                  <button
                    type="button"
                    className="ol-crow-del"
                    onClick={() => setActs((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove act"
                  >×</button>
                )}
              </div>
            ))}
            <button type="button" className="ol-crow ol-crow-add" onClick={() => setActs((prev) => [...prev, ''])} disabled={busy}>
              + add another act
            </button>
          </div>
          <div className="ol-opt-foot">
            <span>from scratch</span>
            <button
              type="button"
              className="go ol-opt-build"
              onClick={createCustom}
              disabled={busy || !acts.some((a) => a.trim())}
            >build it →</button>
          </div>
        </div>
      </div>

      {/* 3 · keep gathering — quieter than the hero and frames */}
      <div className="ol-start-exits">
        <p className="ol-exits-lead">Not ready for an outline yet?</p>
        <div className="ol-exits-row">
          <button
            type="button"
            className="ol-exit"
            onClick={() => projectId && navigate(`/project/${projectId}/braindumps`)}
          >
            Keep dumping ideas
          </button>
          <span className="ol-exits-or" aria-hidden>or</span>
          <button
            type="button"
            className="ol-exit"
            onClick={() => projectId && navigate(`/project/${projectId}/plot-threads`)}
          >
            Go to plot threads
          </button>
        </div>
      </div>
    </div>
  );
}
