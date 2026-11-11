import { useEffect, useState } from 'react';
import { callOp } from '../../../gateway';
import { useActionCost, withCost } from '../../../lib/actionCost';

/* ScaleSetup — the ONE shared "set up the scale" (y_items) panel for a lens,
 * keyed by its `y_items_source`. Both the attach box (now) and the config modals
 * (next pass) render it, so the scale UI lives in a single place.
 *
 *   · section    — the scale IS a World section block; pick which one (→ block_key).
 *                  Its items are read-only here; the engine live-reads them at analyse.
 *   · predefined — the built-in steps, seeded + editable.
 *   · user       — you write the steps yourself.
 *   · extracted  — ✦ draft from your story (onExtract), then editable.
 *
 * Reports `{ blockKey, yItems }` up via onChange. Styling is inline on --lens-*
 * tokens to match the attach box; the next pass cleans this up (shared with the
 * modals), so the look here is deliberately minimal. */

export interface ScaleValue { blockKey: string; yItems: { value: string; description: string }[] }
interface Row { text: string; desc: string }

const input = {
  fontFamily: 'var(--lens-sans)', fontSize: 12.5, color: 'var(--lens-ink-soft)',
  background: 'var(--lens-green-wash)', border: '1px solid var(--lens-line)',
  borderRadius: 8, padding: '5px 9px',
} as const;

function seedRows(lens: any): Row[] {
  const meta = lens?.raw?.items_meta || lens?.items_meta || [];
  if (meta.length) return meta.map((m: any) => ({ text: m.value || '', desc: m.description || '' })).filter((r: Row) => r.text);
  const items = lens?.raw?.items || lens?.items || [];
  return items.map((t: any) => ({ text: String(t), desc: '' })).filter((r: Row) => r.text);
}

export function ScaleSetup({ lens, projectId, onChange, onExtract, extracting }: {
  lens: any; projectId?: string;
  onChange: (v: ScaleValue) => void;
  onExtract?: () => void;       // parent-provided (attach box → bind-then-extract)
  extracting?: boolean;
}) {
  const source: string = lens?.raw?.y_items_source || lens?.y_items_source || 'predefined';
  const extractCost = useActionCost('extract_gauge_scale');   // SA-270: cost label on the button
  const isSection = source === 'section';
  const [rows, setRows] = useState<Row[]>([]);
  const [blockKey, setBlockKey] = useState('');
  const [worldBlocks, setWorldBlocks] = useState<any[]>([]);
  const [draft, setDraft] = useState('');

  const emit = (r: Row[], bk: string) =>
    onChange({ blockKey: bk, yItems: r.map((x) => ({ value: x.text, description: x.desc })).filter((y) => y.value) });

  // section — pick which World block backs the scale; load its (read-only) items.
  const pickBlock = (key: string) => {
    setBlockKey(key); emit(rows, key);
    if (key && projectId) {
      callOp(projectId, 'get_world_block', { name: key }).then((blk: any) => {
        setRows((blk?.items || []).map((it: any) => ({ text: it.title || it.value || '', desc: it.content || it.description || '' })).filter((x: Row) => x.text));
      }).catch(() => {});
    } else setRows([]);
  };

  // seed: section → fetch the candidate World blocks + pre-select the lens's
  // DEFAULT scale entity (y_items_block, e.g. whos_where → locations, the_key_object
  // → characters); else → the built-in rows.
  useEffect(() => {
    if (isSection) {
      if (projectId) callOp(projectId, 'get_world_blocks').then((r: any) => setWorldBlocks(r?.blocks || [])).catch(() => {});
      const def = String(lens?.raw?.y_items_block || lens?.y_items_block || '').trim();
      if (def) pickBlock(def);
      else { setRows([]); setBlockKey(''); emit([], ''); }
    } else {
      const seeded = source === 'user' ? [] : seedRows(lens);
      setRows(seeded);
      emit(seeded, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, isSection, projectId]);

  // editable list (predefined / user / extracted)
  const setRow = (i: number, patch: Partial<Row>) => setRows((p) => { const n = p.map((r, j) => (j === i ? { ...r, ...patch } : r)); emit(n, blockKey); return n; });
  const removeRow = (i: number) => setRows((p) => { const n = p.filter((_, j) => j !== i); emit(n, blockKey); return n; });
  const addRow = () => { const t = draft.trim(); if (!t) return; setRows((p) => { const n = [...p, { text: t, desc: '' }]; emit(n, blockKey); return n; }); setDraft(''); };

  if (isSection) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span className="ui" style={{ fontSize: 11.5, color: 'var(--lens-muted)' }}>
          The scale comes from a part of your world — pick which section. It grows as you edit that section.
        </span>
        <select style={{ ...input, padding: '6px 9px' }} value={blockKey} onChange={(e) => pickBlock(e.target.value)}>
          <option value="">— pick an entity list —</option>
          {/* Characters (the cast) is an entity scale too, alongside the World blocks. */}
          <option value="characters">Characters</option>
          {worldBlocks.map((b: any) => <option key={b.name} value={b.name}>{b.label || b.name}{b.count != null ? ` · ${b.count}` : ''}</option>)}
        </select>
        {blockKey && (
          <div className="ui" style={{ fontSize: 12, color: 'var(--lens-ink-soft)' }}>
            {rows.map((r) => r.text).filter(Boolean).join('  ·  ') || '— nothing in that section yet —'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span className="ui" style={{ fontSize: 11.5, color: 'var(--lens-muted)' }}>
        {source === 'user' ? 'You describe what to look for — the steps up the side of the chart.'
          : source === 'extracted' ? 'Draft the steps from your story, then edit.'
            : 'The steps up the side of the chart — edit them, or add your own.'}
      </span>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input style={{ ...input, flex: '0 0 36%' }} value={r.text} onChange={(e) => setRow(i, { text: e.target.value })} placeholder="a step…" />
          <input style={{ ...input, flex: 1 }} value={r.desc} onChange={(e) => setRow(i, { desc: e.target.value })} placeholder="what it means (optional)" />
          <button type="button" className="ui focusring" onClick={() => removeRow(i)} title="remove"
            style={{ border: 0, background: 'transparent', color: 'var(--lens-muted)', fontSize: 15, lineHeight: 1, padding: '2px 6px' }}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input style={{ ...input, flex: 1 }} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRow(); } }} placeholder="add a step…" />
        <button type="button" className="wv2-btn wv2-btn-sm" onClick={addRow}>+ add</button>
      </div>
      {onExtract && (
        <div>
          <button type="button" className="wv2-btn wv2-btn-ai wv2-btn-sm" disabled={extracting} onClick={onExtract}>
            <span className="lens-spark">✦</span> {extracting ? 'Drafting…' : withCost('Extract from my story', extractCost)}
          </button>
        </div>
      )}
    </div>
  );
}
