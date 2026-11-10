import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import '../lens/lens.css';
import './lensKit.css';
import { unbindGauge } from '../../pages/gauges/api';
import { useLensStore } from './useLensStore';
import { type LensScope } from './resolve';
import { applyAttach, type AttachChoice } from './attach';
import { useLensesFor, useLensContext } from './select';
import { bindingsFor, chartsForLenses, chartMatchesLens, chartToVerdict, chartNote, type LensContext } from './verdict';
import { LensShelf } from './Shelf';
import { LensVerdict } from './VerdictCard';

/* SectionLens — the `type='section'` slice of the lens kit, keyed by ARN.
 *
 * Built on the SHARED layer: `useLensContext` gathers scope/cast/threads/board,
 * `useLensesFor` selects this node's lenses. Verdicts show only the bindings
 * scoped to THIS section; a CTA shows how many other places the same lenses
 * judge. Attach binds (section-pure → invent, bank → preset); detach unbinds;
 * the board refetch reflects both — nothing is kept locally. */

export function SectionLens({ arn, label, scope, projectId, section, sub }: {
  arn: string; label: string; scope: LensScope; projectId?: string; section?: string; sub?: string;
}) {
  const navigate = useNavigate();
  const onBrowse = () => navigate(`/project/${projectId}/gauges`);
  const setOpen = useLensStore((s) => s.setOpen);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const lensCtx = useMemo<LensContext>(() => ({ kind: 'section', scope, section, sub }), [scope, section, sub]);
  const bundle = useLensContext({ projectId, scope });
  const board = bundle.board;
  const lenses = useLensesFor(projectId, lensCtx);

  // only bindings scoped to THIS section: scoped here AND the lens is one of this
  // section's lenses (bank lenses are page-only and never appear here).
  const localCharts = useMemo(
    () => bindingsFor(board.charts, lensCtx, lenses),
    [board, lensCtx, lenses],
  );
  // all bindings of these lenses everywhere — the delta is "other places".
  const allCharts = useMemo(() => chartsForLenses(board.charts, lenses), [board, lenses]);
  const otherCount = allCharts.length - localCharts.length;

  // a shelf lens is ticked if it has any binding anywhere.
  const attachedSlugs = useMemo(
    () => lenses.filter((l) => board.charts.some((ch: any) => chartMatchesLens(ch, l))).map((l) => l.slug),
    [board, lenses],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['gauges', String(projectId ?? '')] });
  };

  const onAttach = async (slug: string, choice: AttachChoice) => {
    const lens = lenses.find((l) => l.slug === slug);
    if (!lens || busy) return;
    // no idempotent guard here: the container disables the exact-duplicate pick and
    // the backend dedups (preset, scope, thread) — so attaching the same lens to a
    // NEW scope from this node is allowed.
    setBusy(slug);
    try {
      await applyAttach(projectId, lens, choice); // the single attach engine
      refresh();
    } catch (e) {
      console.error('[lens] attach failed:', e);
    } finally {
      setBusy(null);
    }
  };

  const onDetach = async (ch: any) => {
    try { await unbindGauge(projectId, ch.binding_id); refresh(); }
    catch (e) { console.error('[lens] detach failed:', e); }
  };

  return (
    <div className="lens-root sl-box">
      <LensShelf variant="lite" label={label} lenses={lenses} ctx={bundle} busy={busy} attachedSlugs={attachedSlugs}
        onAttach={onAttach} onClose={() => setOpen(arn, false)} onBrowse={onBrowse} />
      {localCharts.map((ch) => (
        <div key={ch.binding_id} style={{ marginTop: 12 }}>
          <LensVerdict variant="lite" name={ch.question || ch.name} meta={chartNote(ch)} verdict={chartToVerdict(ch)}
            typeId={ch.type} projectId={projectId} chartId={ch.binding_id || ch.id} onDetach={() => onDetach(ch)} />
        </div>
      ))}
      {otherCount > 0 && (
        <button className="ui focusring" onClick={onBrowse}
          style={{ marginTop: 8, border: 0, background: 'transparent', fontSize: 11.5,
            fontWeight: 600, color: 'var(--lens-purple)', padding: '4px 0', whiteSpace: 'nowrap' }}>
          judging here and {otherCount} other {otherCount === 1 ? 'place' : 'places'} →
        </button>
      )}
    </div>
  );
}
