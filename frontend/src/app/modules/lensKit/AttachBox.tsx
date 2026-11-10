import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExpectedChart } from '../lens/LensAttach';
import { callOp } from '../../gateway';
import { WALK_TICKS, type RealWalk } from '../lens/lensLibrary';
import { lensReq, defaultChoice, type AttachChoice } from './attach';
import { ScaleSetup, type ScaleValue } from '../../pages/gauges/components/ScaleSetup';
import type { CatalogueLens } from './catalogue';
import type { LensContextBundle } from './select';
import { chartMatchesLens, chartToVerdict, chartNote } from './verdict';
import { VerdictLite } from './VerdictCard';

/* LensAttachContainer — the ONE attach surface for a single lens, used by both the
 * section (variant 'bare') and the page (variant 'withVerdicts'). It owns:
 *   header · ExpectedChart · the <select> picker (scope1/scope2/walk/thread, driven
 *   by lensReq + defaultChoice) · the Attach button.
 * The button is DISABLED when the exact picked binding already exists — read off
 * the board, so the container always knows what's bound. `variant='withVerdicts'`
 * additionally embeds this lens's bound charts as VerdictLite rows (with detach);
 * `variant='bare'` leaves the verdicts to the caller (the section renders them). */

import { normStr } from './scope';
const norm = normStr;

const selStyle = {
  fontFamily: 'var(--lens-sans)', fontSize: 12, color: 'var(--lens-ink-soft)',
  background: 'transparent', border: 0, borderBottom: '1px dotted var(--lens-line-2)', padding: '1px 4px',
} as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="ui" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--lens-muted)' }}>
      {label} {children}
    </span>
  );
}

/** Is this lens already bound on the exact picked scope + thread? (board lookup) */
function bindingExists(charts: any[], lens: CatalogueLens, choice: AttachChoice): boolean {
  return (charts || []).some((ch) =>
    chartMatchesLens(ch, lens)
    && norm(ch?.scope?.name) === norm(choice.scope1?.name)
    && (ch?.thread_ref || '') === (choice.thread?.id || ''));
}

export function LensAttachContainer({ lens, ctx, variant = 'bare', busy, onAttach, onDetach, onCancel }: {
  lens: CatalogueLens; ctx: LensContextBundle; variant?: 'bare' | 'withVerdicts'; busy?: boolean;
  onAttach: (choice: AttachChoice) => void; onDetach?: (bindingId: string) => void; onCancel: () => void;
}) {
  const req = lensReq(lens);
  const [choice, setChoice] = useState<AttachChoice>(() => defaultChoice(lens, ctx.attach));
  const set = (patch: Partial<AttachChoice>) => setChoice((c) => ({ ...c, ...patch }));
  const threads = ctx.threads ?? [];
  const names: string[] = (ctx.cast ?? []).map((c) => c.name).filter(Boolean);

  // The scope-1 SUBJECT list depends on the scope type: character/relationship →
  // the cast; object/place/etc. → the world's entities (a flat list of every item
  // across all World blocks, get_worldbuildings). Only fetched for non-char scopes.
  const charScope = req.scopeType === 'character' || req.scopeType === 'relationship';
  const needsWorld = req.scopeCount >= 1 && !charScope;
  const { data: wbData } = useQuery({
    queryKey: ['worldbuildings', String(ctx.projectId ?? '')],
    queryFn: () => callOp(ctx.projectId, 'get_worldbuildings'),
    enabled: !!ctx.projectId && needsWorld, staleTime: 60_000,
  });
  const worldNames: string[] = useMemo(
    () => ((wbData as any)?.worldbuildings ?? []).map((w: any) => String(w?.title || '').trim()).filter(Boolean),
    [wbData],
  );
  const scope1Names = needsWorld ? worldNames : names;

  // the scale (y_items) setup — ScaleSetup reports {blockKey, yItems}. A section-
  // source lens MUST pick a World block (block_key); the others can bind with the
  // built-in/edited scale. Section auto-opens since it's required.
  const ySource: string = (lens as any).raw?.y_items_source || (lens as any).y_items_source || 'predefined';
  const needsBlock = ySource === 'section';
  const [scale, setScale] = useState<ScaleValue>({ blockKey: '', yItems: [] });
  // section needs the World-block pick; user lenses start with empty input fields —
  // both auto-open. predefined/extracted keep the built-in scale behind the toggle.
  const [scaleOpen, setScaleOpen] = useState(needsBlock || ySource === 'user');
  const finalChoice = (extra?: Partial<AttachChoice>): AttachChoice =>
    ({ ...choice, blockKey: scale.blockKey, yItems: scale.yItems, ...extra });

  const needsScope1 = req.scopeCount >= 1;
  const needsScope2 = req.scopeCount === 2;
  const needsThread = choice.walk === 'thread';
  const exists = useMemo(() => bindingExists(ctx.board?.charts ?? [], lens, choice), [ctx.board, lens, choice]);
  const valid = !busy && !exists
    && (!needsScope1 || !!choice.scope1?.name)
    && (!needsScope2 || !!choice.scope2?.name)
    && (!needsThread || !!choice.thread)
    && (!needsBlock || !!scale.blockKey);

  void variant; // both variants share the same attach behaviour (kept for callers)
  // this lens's bound charts ANYWHERE on the board — the box always lists where it's
  // attached (with detach), in both the section and the page.
  const myCharts = useMemo(
    () => (ctx.board?.charts ?? []).filter((ch: any) => chartMatchesLens(ch, lens)),
    [ctx.board, lens],
  );

  return (
    <div className="lens-root" style={{
      borderRadius: 14, background: 'rgba(255,255,255,.92)', border: '1px solid var(--lens-purple-soft)',
      boxShadow: '0 14px 36px -26px rgba(60,40,100,.45)', padding: '15px 18px 14px',
      display: 'flex', flexDirection: 'column', gap: 11, marginTop: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>{lens.question}</span>
        <span style={{ flex: 1 }} />
        <button className="ui focusring" onClick={onCancel} aria-label="close"
          style={{ border: 0, background: 'transparent', fontSize: 17, lineHeight: 1, color: 'var(--lens-muted)', padding: '2px 6px' }}>×</button>
      </div>
      <p className="ui" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--lens-ink-soft)' }}>{lens.description}</p>

      {/* this lens's existing bindings — listed in both surfaces, so the box knows it's attached */}
      {myCharts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="ui" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--lens-muted)' }}>
            Attached · {myCharts.length}
          </span>
          {myCharts.map((ch: any) => (
            <VerdictLite key={ch.binding_id} name={ch.question || ch.name} meta={chartNote(ch)} verdict={chartToVerdict(ch)}
              typeId={ch.type} projectId={ctx.projectId} chartId={ch.binding_id}
              onDetach={() => onDetach?.(ch.binding_id)} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <ExpectedChart type={(lens.type as any) || 'arc'} />
        <span className="ui" style={{ fontSize: 10.5, color: 'var(--lens-muted)', marginBottom: 4 }}>what you'll see — once it reads your story</span>
      </div>

      {/* pickers — only the ones this lens needs; each pre-filled by defaultChoice */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' }}>
        {needsScope1 && (
          <Row label={req.label}>
            <select style={selStyle} value={choice.scope1?.name || ''}
              onChange={(e) => set({ scope1: { type: req.scopeType, name: e.target.value } })}>
              <option value="">choose…</option>
              {scope1Names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Row>
        )}
        {needsScope2 && (
          <Row label="and">
            <select style={selStyle} value={choice.scope2?.name || ''}
              onChange={(e) => set({ scope2: { type: 'character', name: e.target.value } })}>
              <option value="">second character…</option>
              {names.filter((n) => n !== choice.scope1?.name).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Row>
        )}
        <Row label="walk">
          <select style={selStyle} value={choice.walk}
            onChange={(e) => {
              const w = e.target.value as RealWalk;
              // walk + tick are dependent: reset the tick to the new walk's default
              // (the old tick may not be allowed on the new walk), and drop the
              // thread pick unless we're still on a thread walk.
              set({ walk: w, tick: WALK_TICKS[w].default, thread: w === 'thread' ? choice.thread : undefined });
            }}>
            {(Object.keys(WALK_TICKS) as RealWalk[]).map((w) => <option key={w} value={w}>{WALK_TICKS[w].label}</option>)}
          </select>
        </Row>
        <Row label="tick">
          <select style={selStyle} value={choice.tick} onChange={(e) => set({ tick: e.target.value })}>
            {(WALK_TICKS[choice.walk]?.ticks ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Row>
        {needsThread && (
          <Row label="thread">
            <select style={selStyle} value={choice.thread?.id || ''}
              onChange={(e) => set({ thread: threads.find((t) => t.id === e.target.value) })}>
              <option value="">choose thread…</option>
              {threads.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Row>
        )}
      </div>

      {/* ── scale setup (y_items): section picks a World block (required); others
          tweak the built-in/own scale, with ✦ extract for user/extracted ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--lens-line)', paddingTop: 11 }}>
        {needsBlock ? (
          <span className="ui" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--lens-muted)' }}>Scale · from your world</span>
        ) : (
          <button type="button" className="ui focusring" onClick={() => setScaleOpen((o) => !o)}
            style={{ alignSelf: 'flex-start', border: 0, background: 'transparent', fontSize: 11.5, fontWeight: 600, color: 'var(--lens-purple)', padding: 0 }}>
            {scaleOpen ? '▾' : '▸'} Set up the scale
          </button>
        )}
        {(scaleOpen || needsBlock) && (
          <ScaleSetup
            lens={lens} projectId={ctx.projectId} onChange={setScale}
            onExtract={(ySource === 'extracted' || ySource === 'user') ? () => onAttach(finalChoice({ extract: true })) : undefined}
            extracting={busy}
          />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--lens-line)', paddingTop: 11 }}>
        <span className="ui" style={{ fontSize: 11, color: 'var(--lens-muted)' }}>consistency · {WALK_TICKS[choice.walk]?.label} · {choice.tick}</span>
        <span style={{ flex: 1 }} />
        <button className="ui focusring" onClick={() => onAttach(finalChoice())} disabled={!valid}
          style={{ border: 0, background: 'var(--lens-purple)', color: '#fff', borderRadius: 99, padding: '7px 18px', fontSize: 12.5, fontWeight: 600, opacity: valid ? 1 : 0.5 }}>
          {busy ? 'Attaching…' : exists ? 'Already attached' : 'Attach'}
        </button>
      </div>
    </div>
  );
}
