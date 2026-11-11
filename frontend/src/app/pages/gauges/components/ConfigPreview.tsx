import { useState } from 'react';
import { ChartBody } from './ChartBody';
import { LanesPreview } from './LanesPreview';
import { CellsPreview } from './CellsPreview';
import { SAMPLE as LANE_SAMPLE } from './trackerSample';
import { buildExampleChart, SYNTH_SCENES } from './sample';

// crisp reorder chevrons (proper buttons, not tiny glyphs)
const ChevUp = () => <svg viewBox="0 0 16 16" width="11" height="11"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ChevDn = () => <svg viewBox="0 0 16 16" width="11" height="11"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/**
 * ConfigPreview — the live, editable centerpiece of the merged try-on/config
 * dialog. The y-items are the chart's axis AND the only place you edit them: a
 * tall rail of bold, reorderable inputs sits beside the real chart, which morphs
 * as the rule / visual / verdict change. No second y-items list anywhere.
 *
 * Base = the arc/shape family (trajectory). Per-type views will swap how the
 * chart consumes the rail (lanes, checklist, pairs…) but keep this layout.
 */

const SHAPE_RULES = new Set(['rising', 'falling', 'flat', 'arc', 'oscillate']);

// A sequence of y-indices that VIOLATES the selected rule, plus which scenes are
// the break(s). Selecting a rule shows a concrete example of it being broken.
function brokenSeq(rule: string, R: number, n: number): { seq: number[]; breaks: number[] } {
  const mid = Math.floor((R - 1) / 2);
  const at = Math.max(1, Math.floor(n * 0.55));
  const clamp = (v: number) => Math.max(0, Math.min(R - 1, Math.round(v)));
  const asc = (i: number) => clamp((R - 1) * (i / (n - 1)));
  const desc = (i: number) => clamp((R - 1) * (1 - i / (n - 1)));
  let seq: number[] = [];
  let breaks: number[] = [];
  if (rule === 'rising' || rule === 'monotone_up') {
    seq = Array.from({ length: n }, (_, i) => asc(i));
    seq[at] = Math.max(0, seq[at - 1] - 1); breaks = [at];                 // a backslide
  } else if (rule === 'falling' || rule === 'monotone_down') {
    seq = Array.from({ length: n }, (_, i) => desc(i));
    seq[at] = Math.min(R - 1, seq[at - 1] + 1); breaks = [at];            // a bounce back up
  } else if (rule === 'flat') {
    seq = Array.from({ length: n }, () => mid);
    seq[at] = R - 1; breaks = [at];                                       // a spike
  } else if (rule === 'arc') {
    const peak = Math.round((n - 1) / 2);
    seq = Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return clamp((R - 1) * (1 - Math.abs(t - 0.5) / 0.5)); });
    seq[peak] = 0; breaks = [peak];                                       // the peak collapses
  } else if (rule === 'oscillate') {
    seq = Array.from({ length: n }, (_, i) => (i % 2 ? R - 1 : 0));
    seq[3] = mid; seq[4] = mid; breaks = [4];                             // goes flat
  } else {
    seq = Array.from({ length: n }, (_, i) => asc(i));                    // ai / none → clean, no break
  }
  return { seq: seq.map(clamp), breaks };
}

// A lane sequence (holder indices per scene) that VIOLATES a tracker rule, plus
// the break scene(s). Trackers render one holder per scene, so the break shows
// as the on-cell jumping / returning, with a red breach chip naming it.
function brokenLanes(rule: string, R: number, n: number): { seq: number[]; breaks: number[] } {
  const clamp = (v: number) => Math.max(0, Math.min(R - 1, Math.round(v)));
  const at = Math.max(1, Math.floor(n * 0.55));
  const step = R > 1 ? (R - 1) / (n - 1) : 0;
  let seq: number[] = [];
  let breaks: number[] = [];
  if (rule === 'monotone_up') {
    seq = Array.from({ length: n }, (_, i) => clamp(i * step)); seq[at] = clamp(seq[at] - 1); breaks = [at]; // slips back
  } else if (rule === 'monotone_down') {
    seq = Array.from({ length: n }, (_, i) => clamp((R - 1) - i * step)); seq[at] = clamp(seq[at] + 1); breaks = [at]; // improves
  } else if (rule === 'no_jump') {
    seq = Array.from({ length: n }, (_, i) => (i < at ? 0 : R - 1)); breaks = [at]; // teleports across
  } else if (rule === 'cover_once') {
    seq = Array.from({ length: n }, (_, i) => clamp(Math.floor(i / 2))); seq[n - 2] = 0; seq[n - 1] = 0; breaks = [n - 2]; // a value repeats
  } else {
    seq = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0 : Math.min(1, R - 1))); breaks = [at]; // single_occupancy: who holds it?
  }
  return { seq: seq.map(clamp), breaks };
}
function ledgerDetail(rule: string): string {
  return rule === 'monotone_up' ? 'slips backward here'
    : rule === 'monotone_down' ? 'improves on its own here'
    : rule === 'no_jump' ? 'teleports between scenes'
    : rule === 'cover_once' ? 'a value repeats'
    : 'two holders at once';
}

// Coverage rows that VIOLATE a checklist rule: cover_all → one item never lands;
// cover_in_order → present but out of order. The offending row is flagged red.
function brokenCoverage(rule: string, metaRows: any[]): { rows: any[]; offending: any[] } {
  if (rule === 'cover_in_order') {
    const rows = metaRows.map((m, i) => ({ y_item: m.value, description: m.description, covered: true, evidence: `sc-${(i === 1 ? 5 : i + 1)}` }));
    return { rows, offending: [{ y_item: metaRows[1]?.value, detail: 'out of order' }] };
  }
  const miss = Math.min(metaRows.length - 1, Math.max(1, Math.floor(metaRows.length * 0.6)));
  const rows = metaRows.map((m, i) => ({ y_item: m.value, description: m.description, covered: i !== miss, evidence: i !== miss ? `sc-${i + 1}` : null }));
  return { rows, offending: [{ y_item: metaRows[miss]?.value, detail: 'never appears' }] };
}

// Build the sample chart for the current rule + visual. Each backend draws a
// rule-VIOLATING example and marks the break red. ai / none / map → no break
// (descriptive). dependency / report already carry a break in their synth data
// (an open thread / a contradiction).
function previewChart(lens: any, items: string[], itemsMeta: any[], rule: string, visual: string) {
  const backend = lens.backend || 'trajectory';
  const aiOrMap = rule === 'ai' || rule === 'none' || !rule;
  const c = buildExampleChart({
    ...lens, items, items_meta: itemsMeta, math_rule: SHAPE_RULES.has(rule) ? rule : undefined, visual,
    verdict_style: aiOrMap ? 'caption' : 'banner',
  });
  c.math_rule = SHAPE_RULES.has(rule) ? rule : undefined;
  c.visual = visual;
  if (aiOrMap) return c;
  const n = 8;
  if (backend === 'trajectory' && items.length >= 2) {
    const { seq, breaks } = brokenSeq(rule, items.length, n);
    c.data_points = seq.map((idx, i) => ({ scene_id: `sc-${i + 1}`, value: items[idx] ?? null }));
    c.offending = breaks.map((i) => ({ scene_id: `sc-${i + 1}`, detail: 'breaks the rule here' }));
  } else if (backend === 'ledger' && items.length >= 2) {
    const { seq, breaks } = brokenLanes(rule, items.length, n);
    c.data_points = seq.map((idx, i) => ({ scene_id: `sc-${i + 1}`, value: items[idx] ?? null }));
    c.offending = breaks.map((i) => ({ scene_id: `sc-${i + 1}`, detail: ledgerDetail(rule) }));
  } else if (backend === 'coverage' && itemsMeta.length >= 2) {
    const { rows, offending } = brokenCoverage(rule, itemsMeta);
    c.coverage = rows;
    c.offending = offending;
  }
  return c;
}

export function ConfigPreview({ lens, items, rule, visual, isSection, onEdit, onEditDesc, onMove, onRemove, onAdd }: any) {
  const [addText, setAddText] = useState('');
  // items: [{ text, desc, ai }] low→high (index 0 = lowest rung, matching the chart).
  const values = items.map((it: any) => it.text).filter(Boolean);
  const meta = items.map((it: any) => ({ value: it.text, description: it.desc || '' })).filter((y: any) => y.value);
  const chart = previewChart(lens, values, meta, rule, visual);
  const n = items.length;
  const isLedger = (lens.backend || '') === 'ledger';
  const cellsVisual = visual === 'state_cells';
  const lanesVisual = !visual || visual === 'state_lanes';
  const submitAdd = () => { const t = addText.trim(); if (!t) return; onAdd?.(t); setAddText(''); };

  return (
    <div className="gz2-preview">
      {/* the editable axis rail — top = highest rung (charts read bottom→top). The
          y-items ARE the axis; editing them here is the only place they live. */}
      <div className="gz2-axis">
        {items.slice().reverse().map((it: any, j: number) => {
          const i = n - 1 - j; // data index
          return (
            <div key={i} className="gz2-rung">
              <div className="gz2-rung-move">
                <button type="button" className="gz2-rung-arr" title="move up" disabled={i >= n - 1} onClick={() => onMove(i, +1)}><ChevUp /></button>
                <button type="button" className="gz2-rung-arr" title="move down" disabled={i <= 0} onClick={() => onMove(i, -1)}><ChevDn /></button>
              </div>
              <input className="gz2-rung-val" value={it.text} placeholder="a step…" onChange={(e) => onEdit(i, e.target.value)} />
              <button type="button" className="gz2-rung-rm" title="remove" onClick={() => onRemove(i)}>×</button>
              <input className="gz2-rung-desc" value={it.desc || ''} placeholder="a subtle hint…" onChange={(e) => onEditDesc(i, e.target.value)} />
            </div>
          );
        })}

        {/* empty → ghost rungs so the scale reads as "to be filled". A section
            tracker shows faint EXAMPLE lanes so the axis lines up with the preview. */}
        {n === 0 && (isLedger
          ? LANE_SAMPLE.map((s, g) => (
            <div key={`eg-${g}`} className="gz2-rung gz2-rung-ghost gz2-rung-eg"><span className="gz2-rung-move" /><span className="gz2-rung-val gz2-rung-val-eg">{s}</span><span /></div>
          ))
          : [0, 1, 2, 3].map((g) => (
            <div key={`gh-${g}`} className="gz2-rung gz2-rung-ghost"><span className="gz2-rung-move" /><span className="gz2-rung-val" /><span /></div>
          )))}

        {/* add-a-step — the last rung, same format (section scales fill from World) */}
        {isSection ? (
          n === 0 && <div className="gz2-axis-note">Fills from a World section when you bind it.</div>
        ) : (
          <div className="gz2-rung gz2-rung-add">
            <span className="gz2-rung-move"><span className="gz2-rung-plus">+</span></span>
            <input className="gz2-rung-val" value={addText} placeholder="add a step…" onChange={(e) => setAddText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitAdd()} />
            <span />
          </div>
        )}
      </div>

      {/* the live chart — morphs with the rule (shape), the verdict (red), and the
          chosen visual. Its own axis labels are off; the rail beside it IS the axis.
          Trackers in the default lanes visual get the bespoke journey preview. */}
      <div className="gz2-preview-chart">
        {isLedger && cellsVisual
          ? <CellsPreview items={values} rule={rule} />
          : isLedger && lanesVisual
            ? <LanesPreview items={values} rule={rule} />
            : <ChartBody chart={chart} scenes={SYNTH_SCENES} bareAxis />}
      </div>
    </div>
  );
}
