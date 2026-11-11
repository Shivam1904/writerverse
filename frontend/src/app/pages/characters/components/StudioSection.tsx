/* StudioSection — the consistent expand/collapse shell for the four studio
 * sections (Identity · Arc · Outline · Voice). Collapsed → a single clickable
 * row (glyph · label · one-line desc · "Open ＋"); expanded → the header plus the
 * section body, with an optional "✦ ask Night Eyes" and a collapse chevron.
 *
 * The header is a div[role=button] (not a <button>) so the ask button can nest
 * inside without invalid button-in-button DOM. */

import { SectionMarker } from '../../../modules/sectionMarker';
import { ArnAiRewrite } from '../../../modules/arnKit';

export function StudioSection({
  glyph: _glyph, label: _label, name, sub, desc, ready: _ready = false, hasProposal = false, active: _active = false, open, onToggle, onAsk: _onAsk, refEl, markerSection, headerExtra, children,
}: {
  glyph: string;
  label: string;
  /** the character name — scopes the section's ArnAiRewrite (ask Night Eyes) prompt */
  name?: string;
  /** dev section-marker key for this section (e.g. "identity"); shows a § in the header */
  markerSection?: string;
  /** extra header control shown (when open) before "ask Night Eyes" — e.g. a Section Lens tab */
  headerExtra?: any;
  /** shown when open (e.g. "2/3 core") */
  sub?: string;
  /** shown when collapsed (the one-line teaser) */
  desc?: string;
  ready?: boolean;
  /** true when any field in this section has a pending AI proposal */
  hasProposal?: boolean;
  /** the currently scrolled-to section — gets the smooth whitish "you are here" panel */
  active?: boolean;
  open: boolean;
  onToggle: () => void;
  onAsk?: () => void;
  refEl?: (el: HTMLElement | null) => void;
  children?: any;
}) {
  return (
    <section ref={refEl as any} className={`cst-section${open ? ' is-open' : ' is-collapsed'}`}>
      <div
        className="cst-sec-head"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        {/* <span className={`cst-sec-glyph${ready ? ' is-ready' : ''}`}>{glyph}</span>
        <span className="cst-sec-lbl">{label}</span> */}
        {markerSection && <SectionMarker section={markerSection} />}
        {sub && <span className="cst-sec-sub">{sub}</span>}
        {desc && <span className="cst-sec-desc">— {desc}</span>}
        {hasProposal && <span className="cst-sec-proposal-dot" title="Has pending AI suggestions" />}
        <span className="cst-sec-spacer" />
        {/* canonical heading order: diamond (ArnAiRewrite) before lens (headerExtra) */}
        {open && markerSection && (
          <span onClick={(e) => e.stopPropagation()}>
            <ArnAiRewrite section={markerSection} name={name} revealOnHover={false} />
          </span>
        )}
        {headerExtra && (
          <span onClick={(e) => e.stopPropagation()}>{headerExtra}</span>
        )}
        {/* <span className="cst-sec-chev">{open ? '▾' : '▸'}</span> */}
      </div>
      {open && <div className="cst-sec-body">{children}</div>}
    </section>
  );
}
