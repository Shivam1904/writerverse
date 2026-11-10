/* Verdict.tsx — the lens verdict, on the shared lens design language (--lens-*
 * tokens from modules/lens/lens.css): head · plain-words read · per-scene bars ·
 * the drift findings, fed by real board data.
 *
 * Variants:
 *   · 'lite'  — the compact verdict card a section / thread shows inline (today).
 *   · 'full'  — the page-board verdict (folded in later from modules/lens).        */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../ui';
import { analyseGauge } from '../../pages/gauges/api';
import { useActionCost, withCost } from '../../lib/actionCost';
import type { MappedVerdict, VerdictConflict } from './verdict';
import { VerdictSnapshot } from '../lens/LensVerdict';
import { LENS_TYPE, ARCHETYPE_TO_TYPE, type LensTypeKey } from '../lens/lensLibrary';
import { useTickNav, type TickTarget } from './useTickNav';

const TONE_DOT = { ok: 'var(--lens-green)', warn: 'var(--lens-rust)', wait: 'var(--lens-muted-2)' } as const;
function resolveLensType(typeId?: string) {
  const key = (typeId ? ARCHETYPE_TO_TYPE[typeId] : undefined) ?? (typeId as LensTypeKey) ?? 'arc';
  const meta = LENS_TYPE[key] ?? LENS_TYPE.arc;
  return { key, ...meta };
}

export type VerdictVariant = 'lite' | 'full';

/* one drift finding: the offending tick (clickable → deep-links to the chapter /
 * scene), the contradiction, and the data point's own reasoning as muted text. */
function Conflict({ where, text, reasoning, target, onGo }:
  VerdictConflict & { target?: TickTarget | null; onGo?: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid var(--lens-line)' }}>
      <span style={{ flexShrink: 0, marginTop: 3, color: 'var(--lens-rust)', fontSize: 11 }}>▲</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {target ? (
          <button className="ui focusring" onClick={onGo} title={`Go to ${target.label}`}
            style={{
              border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left',
              marginBottom: 3, display: 'inline-flex', alignItems: 'baseline', gap: 5, color: 'var(--lens-rust)'
            }}>
            <span className="kicker" style={{ color: 'var(--lens-rust)' }}>
              {target.crumb ? `${target.crumb} · ` : ''}{target.label}
            </span>
            <span style={{ fontSize: 10 }}>↗</span>
          </button>
        ) : where ? (
          <div className="kicker" style={{ color: 'var(--lens-rust)', marginBottom: 3 }}>{where}</div>
        ) : null}
        <p style={{ margin: 0, fontFamily: 'var(--lens-serif)', fontSize: 14, lineHeight: 1.5, color: 'var(--lens-ink-soft)' }}>{text}</p>
        {reasoning && (
          <p className="ui" style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.45, color: 'var(--lens-muted)' }}>{reasoning}</p>
        )}
      </div>
    </div>
  );
}

/* the conflict list, shared by both verdict variants: resolves each offending
 * tick → a deep-link and renders the rows. */
export function Conflicts({ conflicts, projectId }: { conflicts: VerdictConflict[]; projectId?: string }) {
  const resolve = useTickNav(projectId);
  const navigate = useNavigate();
  return (
    <div>
      {conflicts.map((cf, i) => {
        const target = resolve(cf.tickId);
        return <Conflict key={i} {...cf} target={target} onGo={target ? () => navigate(target.href) : undefined} />;
      })}
    </div>
  );
}

/* ReadStoryButton — the ONE explicit way to run a lens (SA-270).
 * Attaching is free and runs nothing; this button runs the AI, and says
 * what it costs (the useActionCost label, if any) before the author clicks. Hidden when
 * there is nothing to read yet (an empty book / thread). */
export function ReadStoryButton({ projectId, bindingId, verdict }: {
  projectId?: string; bindingId?: string; verdict: MappedVerdict;
}) {
  const qc = useQueryClient();
  const cost = useActionCost('analyse_gauge');
  const [reading, setReading] = useState(false);
  if (!projectId || !bindingId || (verdict.empty && !verdict.scanned)) return null;
  const run = async (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (reading) return;
    setReading(true);
    try {
      await analyseGauge(projectId, bindingId);
      qc.invalidateQueries({ queryKey: ['gauges', String(projectId)] });
    } catch (err) { console.error('[lens] read failed:', err); }
    finally { setReading(false); }
  };
  const verb = verdict.scanned ? 'Read again' : 'Read my story';
  return (
    <div className="flex">
      <Button variant={verdict.scanned ? 'secondary' : 'ai'} size="xs" onClick={run} disabled={reading}>
        {reading ? 'Reading…' : withCost(verb, cost)}
      </Button>
    </div>
  );
}

/* the attached lens's verdict — head + plain-words read + per-scene glance +
 * the specific drift findings. */
export function LensVerdict({ name, meta, verdict, unit, onDetach, variant = 'lite', typeId, projectId, chartId }: {
  name: string; meta?: string; verdict: MappedVerdict; unit?: string; onDetach: () => void; variant?: VerdictVariant;
  typeId?: string; projectId?: string; chartId?: string;
}) {
  void variant; // only 'lite' rendered today; 'full' folds in with the page boards.
  const lensType = resolveLensType(typeId);
  const navigate = useNavigate();
  // clicking the head opens the redesigned gauge detail (/lens/:id); only wired
  // when the caller hands us this binding's id. The detach × stops propagation.
  const navigable = !!(chartId && projectId);
  return (
    <div className="sl-box-card sl-verdict">
      <div className="sl-box-head" style={navigable ? { cursor: 'pointer' } : undefined}
        onClick={navigable ? () => navigate(`/project/${projectId}/lens/${chartId}`) : undefined}>
        <span className="sl-verdict-dot" style={{ background: TONE_DOT[verdict.tone] }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sl-box-title">{name}</div>
          {/* Slot 2 (LANGUAGE.md): about + reads. The chart type is a small
              leading "drawn as" mark; the verdict state below carries the result,
              so the redundant "N to reconcile" is gone. */}
          <div className="ui sl-box-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: lensType.color }} title={`drawn as ${lensType.label}`}>{lensType.glyph}</span>
            {meta && <span>{meta}</span>}
          </div>
        </div>
        <button className="ui focusring sl-box-x" onClick={(e) => { e.stopPropagation(); onDetach(); }} title="Detach">×</button>
      </div>

      <VerdictSnapshot verdict={verdict} type={lensType.key} unit={unit} />
      <ReadStoryButton projectId={projectId} bindingId={chartId} verdict={verdict} />

      {verdict.conflicts.length > 0 && <Conflicts conflicts={verdict.conflicts} projectId={projectId} />}
    </div>
  );
}

/* VerdictLite — the same verdict, lighter chrome: a compact green box (no sl-box
 * card head). Same behaviour as LensVerdict — name + result + per-tick glance +
 * conflicts + detach. Used inside the page attach container's "Attached" list. */
export function VerdictLite({ name, meta, verdict, unit, onDetach, typeId, projectId, chartId }: {
  name: string; meta?: string; verdict: MappedVerdict; unit?: string; onDetach: () => void;
  typeId?: string; projectId?: string; chartId?: string;
}) {
  const lensType = resolveLensType(typeId);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 14px 13px', borderRadius: 12,
      border: '1px solid var(--lens-line)', background: 'var(--lens-green-wash)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: TONE_DOT[verdict.tone] }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--lens-serif)', fontSize: 15, fontWeight: 600 }}>{name}</div>
          <div className="ui" style={{ fontSize: 11, color: 'var(--lens-muted)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: lensType.color }} title={`drawn as ${lensType.label}`}>{lensType.glyph}</span>
            {meta && <span>{meta}</span>}
          </div>
        </div>
        <button className="ui focusring" onClick={onDetach} title="Detach"
          style={{ border: 0, background: 'transparent', fontSize: 16, lineHeight: 1, color: 'var(--lens-muted)', padding: '2px 6px', flexShrink: 0 }}>×</button>
      </div>
      <VerdictSnapshot verdict={verdict} type={lensType.key} unit={unit} />
      <ReadStoryButton projectId={projectId} bindingId={chartId} verdict={verdict} />
      {verdict.conflicts.length > 0 && <Conflicts conflicts={verdict.conflicts} projectId={projectId} />}
    </div>
  );
}
