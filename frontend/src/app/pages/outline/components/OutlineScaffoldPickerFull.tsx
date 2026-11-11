import { useNavigate, useParams } from 'react-router-dom';
import {
  SCAFFOLD_META,
  THREE_ACT_PREVIEW,
  actMarker,
  useOutlineScaffoldPicker,
  type OutlineScaffoldPickerProps,
} from './outlineScaffoldPicker.shared';
import { InitHead } from '../../../components/InitHead';

/**
 * Empty-state for the grand outline — the "outline-start" design (handoff
 * chat22 / outline-start.html). The framing: a structure is a SCAFFOLD, never a
 * requirement. The *simplest* start isn't a blank page — it's the three-act
 * spine most stories already fit, so that's the confident hero up top. The
 * remaining shapes (and "name your own acts") sit below as alternatives; the
 * truly blank path is the quiet third card in that row, for writers who want
 * nothing to learn first. A cross-door offers the threads page for writers who'd
 * rather map storylines first. Nothing the writer picks is permanent.
 *
 * - three-act hero → onInit({ base_template: 'three_act' })
 * - preset card    → onInit({ base_template: id })  (hero_journey / …)
 * - custom card    → onInit({ acts: [...names] })
 * - blank card     → onInit({ acts: ['Story'] }) → one act "Story" + one empty chapter
 */
export function OutlineScaffoldPickerFull({ onInit }: OutlineScaffoldPickerProps) {
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

  // three-act is promoted to the hero; its preview paints from the backend
  // scaffold once loaded, with a matching static fallback so there's no flash.
  const threeAct = scaffolds.find((s) => s.id === 'three_act');
  const heroActs: string[] = threeAct?.acts ?? THREE_ACT_PREVIEW;
  // everything else (hero_journey, …) drops into the grid below the hero.
  const otherScaffolds = scaffolds.filter((s) => s.id !== 'three_act');

  return (
    <div className="wv2-init ol-start">
      <InitHead
        section="outline"
        className="ol-start-head"
        eyebrow="Plan · outline"
        title={<>Give your story<br />a <em>shape.</em></>}
        sub={<>The book's spine — <b>acts, chapters, scenes</b>. Begin with the three-act spine, try another shape, or start blank.</>}
      />

      <div className="ol-start-reassure">
        <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
        <span>Nothing's permanent — <b>rename, merge, reorder, or delete</b> anytime.</span>
      </div>

      {/* the confident, low-pressure path: the three-act spine most stories fit */}
      <button className="ol-hero" onClick={() => pickPreset('three_act')} disabled={busy}>
        <div className="ho-left">
          <div className="ol-kicker">Simplest start</div>
          <div className="ho-name">Begin with three acts</div>
          <p className="ho-desc">
            The classic <b>setup → confrontation → resolution</b> spine — the shape
            most stories already fit. Three acts to fill in; bend, rename, or split
            them however your story wants.
          </p>
          <span className="ho-cta">Start with three acts<svg viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg></span>
        </div>
        <div className="ho-diagram">
          <span className="dlabel">the spine</span>
          <ol className="ho-acts ol-mini">
            {heroActs.map((a, i) => (
              <li key={i}><span className="n">{actMarker(i, heroActs.length)}</span>{a}</li>
            ))}
          </ol>
        </div>
      </button>

      <div className="ol-or-line"><span className="t">or <b>try another shape</b> — starting points, not rules</span></div>

      <div className="ol-opt-grid">
        {loading ? (
          <div className="ol-start-loading">Loading shapes…</div>
        ) : (
          otherScaffolds.map((s) => {
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
                {meta.desc && <p className="ol-opt-desc">{meta.desc}</p>}
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

        {/* custom — name your own acts */}
        <div className="ol-opt ol-opt-custom">
          <div className="ol-kicker">Your shape</div>
          <div className="ol-opt-name">Name your own acts</div>
          <p className="ol-opt-desc">As few or as many as your story wants.</p>
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

        {/* blank — the truly empty path, kept quiet and visually apart */}
        <button className="ol-opt ol-opt-blank" onClick={startBlank} disabled={busy}>
          <div className="ol-kicker">No shape</div>
          <div className="ol-opt-name">Begin blank</div>
          <p className="ol-opt-desc">One act, one empty chapter — nothing to learn first.</p>
          <ol className="ol-mini">
            <li><span className="n">I</span>Story</li>
            <li className="more">+ add when ready</li>
          </ol>
          <div className="ol-opt-foot"><span>from nothing</span><span className="go">start clean →</span></div>
        </button>
      </div>

      <p className="ol-fine">
        The outline reshapes alongside the book. <b>Your scenes never move unless you move them.</b>
      </p>

      {/* the other way in — start with threads instead */}
      <div className="ol-start-door">
        <div className="od-ic">
          <svg viewBox="0 0 24 24"><circle cx="6.5" cy="6" r="2.2" /><circle cx="6.5" cy="18" r="2.2" /><circle cx="17.5" cy="8.5" r="2.2" /><path d="M6.5 8.2v7.6" /><path d="M17.5 10.7c0 4.2-4.2 3.6-7.2 5" /></svg>
        </div>
        <div className="od-body">
          <div className="od-h">Rather start with storylines?</div>
          <p>Map your <b>threads</b> first — the plots and arcs — then grow the outline around them.</p>
        </div>
        <button
          type="button"
          className="od-go"
          onClick={() => projectId && navigate(`/project/${projectId}/plot-threads`)}
        >
          Start with threads<svg viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}
