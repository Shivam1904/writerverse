import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExpectedChart } from '../lens/LensAttach';
import { GoldSpark } from '../lens/LensAtoms';
import { callOp } from '../../gateway';
import { WALK_TICKS, type RealWalk } from '../lens/lensLibrary';
import { lensReq, defaultChoice, type AttachChoice } from './attach';
import { ScaleSetup, type ScaleValue } from '../../pages/gauges/components/ScaleSetup';
import type { CatalogueLens } from './catalogue';
import type { LensContextBundle } from './select';
import { normStr } from './scope';

/* ShapingAttachBox — the AI "shape it" attach surface. A FORK of LensAttachContainer
 * (kept separate so shaping changes never touch the plain attach box), enriched for
 * a Night-Eyes-shaped lens:
 *   · a "✦ Night Eyes shaped this" header over the shaped name + what it watches,
 *   · scope pre-seeded from the AI's spec (scope_type / scope_name / pair), with the
 *     AI's entity injected into the picker if it isn't already on the roster,
 *   · the AI's proposed scale shown open by default (editable via ScaleSetup),
 *   · Attach → the SAME applyAttach bind chain (create_preset normalizes the spec).
 * No "already attached" list: a freshly-shaped lens has a synthetic slug, nothing
 * bound yet. */

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

export function ShapingAttachBox({ lens, ctx, busy, onAttach, onCancel }: {
  lens: CatalogueLens; ctx: LensContextBundle; busy?: boolean;
  onAttach: (choice: AttachChoice) => void; onCancel: () => void;
}) {
  const req = lensReq(lens);

  // the AI's intent, carried on the shaped lens's raw spec.
  const aiScopeName = String((lens as any).raw?.scope_name || '').trim();
  const aiPair: string[] = Array.isArray((lens as any).raw?.pair) ? (lens as any).raw.pair : [];

  // seed the choice from defaultChoice, then let the AI's scope win.
  const [choice, setChoice] = useState<AttachChoice>(() => {
    const base = defaultChoice(lens, ctx.attach);
    if (req.scopeCount === 0) return { ...base, scope1: { type: 'story', name: 'the whole story' } };
    if (req.scopeCount === 2) {
      return {
        ...base,
        scope1: aiPair[0] ? { type: 'character', name: aiPair[0] } : base.scope1,
        scope2: aiPair[1] ? { type: 'character', name: aiPair[1] } : base.scope2,
      };
    }
    return { ...base, scope1: aiScopeName ? { type: req.scopeType, name: aiScopeName } : base.scope1 };
  });
  const set = (patch: Partial<AttachChoice>) => setChoice((c) => ({ ...c, ...patch }));
  const threads = ctx.threads ?? [];
  const names: string[] = (ctx.cast ?? []).map((c) => c.name).filter(Boolean);

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
  // the picker roster + the AI's pick injected if it isn't already there (so the
  // pre-filled scope is always selectable, even if the name doesn't match exactly).
  const scope1Names = useMemo(() => {
    const base = needsWorld ? worldNames : names;
    const wanted = req.scopeCount === 2 ? aiPair[0] : aiScopeName;
    return wanted && !base.some((n) => norm(n) === norm(wanted)) ? [wanted, ...base] : base;
  }, [needsWorld, worldNames, names, aiScopeName, aiPair, req.scopeCount]);

  // the AI's proposed scale — shown open by default; section/coverage lenses keep
  // the engine-extracted behaviour (no editable scale needed).
  const ySource: string = (lens as any).raw?.y_items_source || 'predefined';
  const needsBlock = ySource === 'section';
  const [scale, setScale] = useState<ScaleValue>({ blockKey: '', yItems: [] });
  const [scaleOpen, setScaleOpen] = useState(true);
  const finalChoice = (extra?: Partial<AttachChoice>): AttachChoice =>
    ({ ...choice, blockKey: scale.blockKey, yItems: scale.yItems, ...extra });

  const needsScope1 = req.scopeCount >= 1;
  const needsScope2 = req.scopeCount === 2;
  const needsThread = choice.walk === 'thread';
  const valid = !busy
    && (!needsScope1 || !!choice.scope1?.name)
    && (!needsScope2 || !!choice.scope2?.name)
    && (!needsThread || !!choice.thread)
    && (!needsBlock || !!scale.blockKey);

  return (
    <div className="lens-root" style={{
      borderRadius: 14, background: 'rgba(255,255,255,.94)', border: '1px solid var(--lens-gold-soft)',
      boxShadow: '0 14px 36px -26px rgba(120,90,30,.4)', padding: '15px 18px 14px',
      display: 'flex', flexDirection: 'column', gap: 11, marginTop: 4,
    }}>
      {/* header — the Night Eyes shaped read */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="ui" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--lens-gold)' }}>
            <GoldSpark size={12} /> Night Eyes shaped this from your words
          </span>
          <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>{lens.question}</span>
        </div>
        <button className="ui focusring" onClick={onCancel} aria-label="close"
          style={{ border: 0, background: 'transparent', fontSize: 17, lineHeight: 1, color: 'var(--lens-muted)', padding: '2px 6px' }}>×</button>
      </div>
      {lens.description && (
        <p className="ui" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--lens-ink-soft)' }}>{lens.description}</p>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <ExpectedChart type={(lens.type as any) || 'arc'} />
        <span className="ui" style={{ fontSize: 10.5, color: 'var(--lens-muted)', marginBottom: 4 }}>what you'll see — once it reads your story</span>
      </div>

      {/* pickers — pre-filled from the AI's scope; only the ones this lens needs */}
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

      {/* the AI's proposed scale — editable */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--lens-line)', paddingTop: 11 }}>
        {needsBlock ? (
          <span className="ui" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--lens-muted)' }}>Scale · from your world</span>
        ) : (
          <button type="button" className="ui focusring" onClick={() => setScaleOpen((o) => !o)}
            style={{ alignSelf: 'flex-start', border: 0, background: 'transparent', fontSize: 11.5, fontWeight: 600, color: 'var(--lens-gold)', padding: 0 }}>
            {scaleOpen ? '▾' : '▸'} The scale Night Eyes drafted
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
          style={{ border: 0, background: 'var(--lens-gold)', color: '#fff', borderRadius: 99, padding: '7px 18px', fontSize: 12.5, fontWeight: 600, opacity: valid ? 1 : 0.5 }}>
          {busy ? 'Attaching…' : 'Attach'}
        </button>
      </div>
    </div>
  );
}
