import { useState } from 'react';
import './thread-list.css';

/* BaseOutlinePicker — the merge view's right column BEFORE a base outline exists.
 *
 * Ported from the handoff Outline design ("Start with a base outline"): a small
 * illustration of threads converging into one structured spine, then three ways
 * to begin —
 *   1. Select a structure — five hierarchy presets shown as the pattern itself
 *      (Act › Chapter, Season › Episode, …), no "3-act" labels.
 *   2. Create your own — an optional top-level + a prefilled unit, plus a slider
 *      for roughly how many units; with a top-level it groups into ~3.
 *   3. Use a thread you've already built as the spine (receded).
 *
 * Presentational only: it emits the chosen base; the host (the merge page via
 * OutlineDrawer) runs init_grand_outline with it. No backend here. */

export interface StructurePreset { id: string; top: string; unit: string; }

export const STRUCTURE_PRESETS: StructurePreset[] = [
  { id: 'act', top: 'Act', unit: 'Chapter' },
  { id: 'season', top: 'Season', unit: 'Episode' },
  { id: 'title', top: 'Title', unit: 'Section' },
  { id: 'saga', top: 'Saga', unit: 'Issue' },
  { id: 'module', top: 'Module', unit: 'Chapter' },
];

export interface BaseAct { title: string; chapters: string[]; }

/* The act/chapter naming for a base spine, from a two-level hierarchy. This is
 * exactly the payload `init_grand_outline` builds the real outline from: each
 * act titled `${top} N`, each chapter titled `${unit} N` (continuous numbering
 * so titles never collide). Presets are always 3 acts × 2 chapters; "create
 * your own" spreads `count` chapters across the acts, or a single flat
 * (untitled) act when there's no top-level word. Scenes/beats are the writer's
 * to fill — the backend seeds one empty scene per chapter. */
export function buildNestedActs(top: string, unit: string, groups: number, count: number): BaseAct[] {
  const n = Math.max(1, count | 0);
  const u = (unit || 'Chapter').trim() || 'Chapter';
  const t = (top || '').trim();
  if (!t) return [{ title: '', chapters: Array.from({ length: n }, (_, i) => `${u} ${i + 1}`) }];
  const g = Math.max(1, Math.min(groups, n));
  const per = Math.ceil(n / g);
  const acts: BaseAct[] = [];
  let k = 1;
  for (let i = 1; i <= g && k <= n; i++) {
    const chapters: string[] = [];
    for (let j = 0; j < per && k <= n; j++) chapters.push(`${u} ${k++}`);
    acts.push({ title: `${t} ${i}`, chapters });
  }
  return acts;
}

const WeaveGlyph = ({ size = 13, color = 'var(--terra)' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M4 18c5 0 5-12 10-12 M4 6c5 0 5 12 10 12 M18 5v.01 M18 19v.01" />
  </svg>
);

/* The empty-state illustration: three threads converging into one structured spine. */
function BaseSpineArt() {
  return (
    <div className="tl-base-art">
      <svg width="216" height="128" viewBox="0 0 216 128" fill="none" aria-hidden="true">
        <path d="M10 28 C 62 28, 70 58, 122 60" stroke="var(--terra)" strokeWidth="2" strokeLinecap="round" opacity=".55" />
        <path d="M10 64 C 64 64, 74 64, 122 64" stroke="var(--sage)" strokeWidth="2" strokeLinecap="round" opacity=".55" />
        <path d="M10 100 C 62 100, 70 70, 122 68" stroke="var(--clay)" strokeWidth="2" strokeLinecap="round" opacity=".55" />
        <circle cx="10" cy="28" r="3.6" fill="var(--terra)" />
        <circle cx="10" cy="64" r="3.6" fill="var(--sage)" />
        <circle cx="10" cy="100" r="3.6" fill="var(--clay)" />
        <rect x="130" y="10" width="76" height="108" rx="10" fill="var(--surface)" stroke="color-mix(in srgb, var(--terra) 35%, var(--line))" strokeWidth="1.5" />
        <rect x="140" y="24" width="42" height="6" rx="3" fill="color-mix(in srgb, var(--terra) 22%, transparent)" />
        <rect x="140" y="38" width="56" height="4" rx="2" fill="color-mix(in srgb, var(--ink) 9%, transparent)" />
        <rect x="140" y="48" width="48" height="4" rx="2" fill="color-mix(in srgb, var(--ink) 9%, transparent)" />
        <rect x="140" y="64" width="42" height="6" rx="3" fill="color-mix(in srgb, var(--terra) 22%, transparent)" />
        <rect x="140" y="78" width="56" height="4" rx="2" fill="color-mix(in srgb, var(--ink) 9%, transparent)" />
        <rect x="140" y="88" width="46" height="4" rx="2" fill="color-mix(in srgb, var(--ink) 9%, transparent)" />
        <rect x="140" y="104" width="36" height="6" rx="3" fill="color-mix(in srgb, var(--terra) 22%, transparent)" />
      </svg>
    </div>
  );
}

/* Compact two-level preview — the hierarchy pattern speaks for itself, no label. */
function StructurePreview({ top, unit }: { top: string; unit: string }) {
  return (
    <div className="tl-base-prev">
      <span className="tl-base-prev-top">{top} 1</span>
      {[1, 2].map((i) => (
        <span key={i} className="tl-base-prev-unit">
          <span className="tl-base-prev-dot" />{unit} {i}
        </span>
      ))}
      <span className="tl-base-prev-top is-next">{top} 2 ⋯</span>
    </div>
  );
}

export function BaseOutlinePicker({
  threads = [],
  onStructure,
  onCustom,
  onThread,
}: {
  threads?: any[];
  onStructure: (preset: StructurePreset) => void;
  onCustom: (top: string, unit: string, count: number) => void;
  onThread: (thread: any) => void;
}) {
  const [topName, setTopName] = useState('');
  const [unitName, setUnitName] = useState('Chapter');
  const [count, setCount] = useState(12);
  const unitPlural = `${((unitName || 'chapter').trim() || 'chapter').toLowerCase()}s`;

  return (
    <div className="tl-base">
      <BaseSpineArt />

      <div className="tl-base-intro">
        <div className="tl-base-kicker">Step one</div>
        <h3 className="tl-base-h">Start with a base outline</h3>
        <p className="tl-base-sub">
          The base is the spine your finished book hangs on. Every beat you merge lands <em>inside</em> it.
        </p>
      </div>

      {/* 1 — select a structure */}
      <div className="tl-base-seclbl">Select a structure</div>
      <div className="tl-base-grid">
        {STRUCTURE_PRESETS.map((p) => (
          <button key={p.id} type="button" className="tl-base-preset" onClick={() => onStructure(p)}>
            <StructurePreview top={p.top} unit={p.unit} />
          </button>
        ))}
      </div>

      {/* 2 — create your own */}
      <div className="tl-base-seclbl">Create your own</div>
      <div className="tl-base-custom">
        <div className="tl-base-custom-row">
          <input
            className="tl-base-input"
            value={topName}
            onChange={(e) => setTopName(e.target.value)}
            placeholder="Act, Part… (optional)"
          />
          <span className="tl-base-chev">›</span>
          <input
            className="tl-base-input"
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            placeholder="Chapter"
          />
        </div>
        <div className="tl-base-count">
          <span className="tl-base-count-lbl">Roughly <b>{count}</b> {unitPlural}</span>
          <span className="tl-base-count-note">{topName.trim() ? `across 3 ${topName.trim().toLowerCase()}s` : 'flat list'}</span>
        </div>
        <input
          type="range"
          min={1}
          max={40}
          value={count}
          onChange={(e) => setCount(+e.target.value)}
          className="tl-base-range"
        />
        <button type="button" className="tl-btn-primary tl-base-go" onClick={() => onCustom(topName, unitName, count)}>
          Start this outline →
        </button>
      </div>

      {/* 3 — receded: from a thread */}
      {threads.length > 0 && (
        <div className="tl-base-fromthread">
          <div className="tl-base-fromthread-lbl">Or use a thread you've already built as the spine</div>
          <div className="tl-base-thread-list">
            {threads.map((t) => {
              const total = (t.covered ?? 0) + (t.gaps ?? 0);
              const n = total || (t.beats?.filter((b: any) => b.kind !== 'heading').length ?? 0);
              return (
                <button key={t.id} type="button" className="tl-base-thread" onClick={() => onThread(t)}>
                  <WeaveGlyph size={12} color="var(--ink-3)" />
                  <span className="tl-base-thread-name">{t.name}</span>
                  <span className="tl-base-thread-n">{n} beat{n === 1 ? '' : 's'}</span>
                  <span className="tl-base-thread-go">→</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
