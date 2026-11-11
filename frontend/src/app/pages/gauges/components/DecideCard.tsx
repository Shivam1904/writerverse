import { Check, AlertTriangle, Map as MapIcon, Wrench, Flag, Eye, ArrowRight } from 'lucide-react';
import { LensGlyph } from './LensGlyph';
import { ChartBody } from './ChartBody';
import { SYNTH_SCENES, buildExampleChart } from './sample';
import { visualsFor, VISUAL_LABELS } from '../data';

/**
 * DecideCard (Surface A2) — the read-only "decide / try on" preview for an
 * UN-bound lens. Purely informational: it shows what the lens watches, a
 * clearly-ghosted EXAMPLE of its default visual (with a tease of the alternates),
 * good/off (or look-for / invariant), the scale, a sample of "what it catches",
 * and the setup cost. The only commit is "Try on →", which hands off to the
 * config modal (Surface B). NOTHING here edits or binds.
 */

const SOURCE_BLURBS: any = {
  predefined: 'Built in — tweak the steps when you set it up.',
  extracted: 'Pulled from your story — you’ll review what the engine finds.',
  section: 'Comes from a part of your world — keep that section current and it follows.',
  user: 'You describe what to look for.',
};
// The ghosted example renders through the SAME visual registry as the real chart
// (so a map previews as a contour, a checklist as unchecked rows, etc.) — via the
// shared `buildExampleChart`.
function ExampleChart({ lens }: any) {
  return <div className="gz-decide-example"><ChartBody chart={buildExampleChart(lens)} scenes={SYNTH_SCENES} /></div>;
}

function catchesSample(lens: any): string {
  if (lens.verdict_style === 'caption') return lens.look_for || 'a long flat run = the line’s gone slack.';
  switch (lens.backend) {
    case 'ledger': return 'a breach — e.g. “two holders at sc5,” or it teleports with no hand-off.';
    case 'coverage': { const last = (lens.items ?? []).slice(-1)[0]; return `a gap — e.g. “missing: ${last || 'a key beat'}.”`; }
    case 'dependency': return 'a hanging setup — e.g. “the postcards — never paid off.”';
    default: return lens.read_as || 'a wobble — a scene that breaks the trend (e.g. “backslides at sc6”).';
  }
}

function setupLine(lens: any): string {
  const blurb = SOURCE_BLURBS[lens.y_items_source] ?? '';
  const scope = lens.scope_type && lens.scope_type !== 'story'
    ? `pick ${lens.scope_type === 'relationship' ? 'two characters' : `a ${lens.scope_type}`}, then it’s ready`
    : 'ready for the whole story';
  return `${blurb} Setup: ${scope}.`;
}

export function DecideCard({ lens, onClose, onTryOn, onDismiss }: any) {
  if (!lens) return null;
  const isMap = lens.verdict_style === 'caption';
  const items = lens.items?.length ? lens.items : (lens.items_meta ?? []).map((m: any) => m.value);
  const { alts } = visualsFor(lens);

  return (
    <div className="lens-cfg-scrim gz-decide-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gz-decide" role="dialog" aria-modal="true" aria-label={`About ${lens.name}`}>
        <div className="gz-decide-head">
          <LensGlyph id={lens.id} kind={lens.kind} />
          <div className="gz-decide-titles">
            <div className="gz-decide-name">{lens.name}{lens.kind_word && <span className="gz-kindword">{lens.kind_word}</span>}</div>
            {lens.watches && <div className="gz-decide-watch">{lens.watches}</div>}
          </div>
          <button type="button" className="lens-cfg-x" aria-label="close" onClick={onClose}>×</button>
        </div>

        <div className="gz-decide-body">
          <div className="gz-decide-sec">
            <div className="gz-decide-label">
              What you’ll see <span className="gz-decide-ex">example — not your story yet</span>
            </div>
            <ExampleChart lens={lens} />
            {alts.length > 0 && (
              <div className="gz-decide-alts">also shows as: {alts.map((a: string) => VISUAL_LABELS[a] ?? a).join(' · ')}</div>
            )}
          </div>

          <div className="gz-decide-verdict">
            {isMap ? (
              <div className="gz-go gz-go-map"><span className="ico"><MapIcon size={14} /></span><span><b>A map, not a score.</b> {lens.look_for}</span></div>
            ) : (
              <>
                {lens.good && <div className="gz-go good"><span className="ico"><Check size={14} /></span><span><b>Good:</b> {lens.good}</span></div>}
                {lens.off && <div className="gz-go off"><span className="ico"><AlertTriangle size={14} /></span><span><b>Off:</b> {lens.off}</span></div>}
                {lens.invariant && <div className="gz-go"><span className="ico" style={{ color: 'var(--ink-3)' }}>▸</span><span><b>The rule:</b> {lens.invariant}</span></div>}
              </>
            )}
          </div>

          {items.length > 0 && (
            <div className="gz-decide-measures">
              <b>{lens.backend === 'coverage' ? 'Checks for' : 'Measures'}:</b> {items.join(' · ')}
            </div>
          )}

          <div className="gz-decide-catches">
            <span className="ico">{isMap ? <Eye size={14} /> : <Flag size={14} />}</span>
            <span><b>{isMap ? 'What to notice' : 'What it catches'}:</b> {catchesSample(lens)}</span>
          </div>

          <div className="gz-setup"><span className="ico"><Wrench size={13} /></span><span>{setupLine(lens)}</span></div>
        </div>

        <div className="gz-decide-foot">
          {lens.proposal_id && onDismiss
            ? <button type="button" className="wv2-btn wv2-btn-ghost" onClick={() => onDismiss(lens)}>Not for me</button>
            : <button type="button" className="wv2-btn wv2-btn-ghost" onClick={onClose}>Maybe later</button>}
          <button type="button" className="wv2-btn wv2-btn-primary" onClick={() => onTryOn(lens)}>Try on <ArrowRight size={14} /></button>
        </div>
      </div>
    </div>
  );
}
