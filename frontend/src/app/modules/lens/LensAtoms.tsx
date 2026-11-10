import type { CSSProperties } from 'react';
import { LENS_TYPE, WALKS, type LensBinding, type LensTypeKey, type WalkKey } from './lensLibrary';

/* LensAtoms — the shared lens-card pieces, ported pixel-faithfully from the
 * "Lenses Exploration" handoff (lens-parts.jsx). The design's var(--x) tokens
 * map to the namespaced --lens-x tokens in lens.css. Unlike the mockup these are
 * CONTROLLED: `attached` comes from the live board, the dot/button calls the real
 * attach/detach.
 *
 * The cards are shape-TOLERANT: they read the canonical CatalogueLens
 * (question/description) OR the legacy PackLens (name/desc) — so the live page
 * boards pass CatalogueLens while the static showcase demos still pass PackLens. */

const walkLabel = (w: WalkKey) => WALKS[w]?.label ?? w;
const cardTitle = (l: any): string => l?.question ?? l?.name ?? '';
const cardBody = (l: any): string => l?.description ?? l?.desc ?? '';
const cardType = (l: any): LensTypeKey => (l?.type ?? 'arc');
const cardWalk = (l: any): WalkKey => (l?.walk ?? 'outline');

export function TypeTag({ type, size = 10.5 }: { type: LensTypeKey; size?: number }) {
  const t = LENS_TYPE[type];
  if (!t) return null;
  return (
    <span className="ui" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: size,
      fontWeight: 600, letterSpacing: '.02em', color: t.color }}>
      <span style={{ fontSize: size + 1, lineHeight: 1 }}>{t.glyph}</span>{t.label}
    </span>
  );
}

export function WalkHint({ walk, style }: { walk: string; style?: CSSProperties }) {
  return <span className="ui" style={{ fontSize: 11, color: 'var(--lens-muted)', ...style }}>→ {walk}</span>;
}

export function GoldSpark({ size = 12 }: { size?: number }) {
  return <span style={{ color: 'var(--lens-gold)', fontSize: size, lineHeight: 1 }}>✦</span>;
}

/* attach toggle — small circular + that becomes a check */
export function AttachDot({ on, busy, onToggle }: { on: boolean; busy?: boolean; onToggle: () => void }) {
  return (
    <button className="ui focusring" onClick={(e) => { e.stopPropagation(); onToggle(); }} disabled={busy}
      title={on ? 'Attached' : 'Attach'}
      style={{ width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center',
        fontSize: 12, lineHeight: 1, border: on ? '1px solid transparent' : '1px solid var(--lens-line-2)',
        background: on ? 'var(--lens-green-wash)' : 'transparent', color: on ? 'var(--lens-green-deep)' : 'var(--lens-muted)',
        opacity: busy ? 0.5 : 1, transition: 'all .15s' }}>
      {busy ? '·' : on ? '✓' : '+'}
    </button>
  );
}

/* one binding line: ● walk · thread-or-scope (used in the collapsed card) */
export function BindingLine({ b }: { b: LensBinding }) {
  return (
    <div className="ui" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, lineHeight: 1.3, minWidth: 0 }}>
      <span style={{ color: 'var(--lens-green)', fontSize: 7, flexShrink: 0 }}>●</span>
      <span style={{ color: 'var(--lens-ink-soft)', flexShrink: 0 }}>{WALKS[b.walk]?.label ?? b.walk}</span>
      <span style={{ color: 'var(--lens-muted-2)', flexShrink: 0 }}>·</span>
      <span style={{ color: 'var(--lens-purple)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {b.threadName || b.scopeName}
      </span>
    </div>
  );
}

/* mini card for the quiet shelf — collapsed only. When the lens is attached it
 * lists ALL its bindings (walk · thread/scope); otherwise it shows the desc + the
 * walk type. The + / ✓ dot opens the large attach panel (attach / manage). */
export function MiniLensCard({ lens, bindings = [], busy, active, onOpen }:
  { lens: any; bindings?: LensBinding[]; busy?: boolean; active?: boolean; onOpen: () => void }) {
  const on = bindings.length > 0;
  return (
    <div className="lenscard focusring" role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      style={{ width: 212, flexShrink: 0, borderRadius: 12, padding: '12px 14px 11px', cursor: 'pointer',
      background: on ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.78)',
      border: (active ? '1px solid var(--lens-purple-soft)' : on ? '1px solid rgba(79,122,82,.28)' : '1px solid var(--lens-line)'),
      display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
        <span style={{ marginTop: 2 }}>{on ? <span style={{ color: 'var(--lens-green)', fontSize: 9 }}>●</span> : <GoldSpark size={11} />}</span>
        <span style={{ flex: 1, fontFamily: 'var(--lens-serif)', fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{cardTitle(lens)}</span>
        <AttachDot on={on} busy={busy} onToggle={onOpen} />
      </div>
      {on ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 1 }}>
            {bindings.map((b) => <BindingLine key={b.binding_id} b={b} />)}
          </div>
          <div style={{ marginTop: 'auto' }}><TypeTag type={cardType(lens)} size={10} /></div>
        </>
      ) : (
        <>
          <div className="ui" style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--lens-ink-soft)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{cardBody(lens)}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', gap: 8 }}>
            <TypeTag type={cardType(lens)} size={10} />
            <WalkHint walk={walkLabel(cardWalk(lens))} style={{ fontSize: 10.5, color: 'var(--lens-muted)' }} />
          </div>
        </>
      )}
    </div>
  );
}

/* chip for the footnote ribbon */
export function LensChip({ lens, attached, busy, onToggle }:
  { lens: any; attached: boolean; busy?: boolean; onToggle: () => void }) {
  const on = attached;
  const t = LENS_TYPE[cardType(lens)] ?? LENS_TYPE.arc;
  return (
    <button className="ui focusring lenschip" onClick={onToggle} disabled={busy}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px 5px 9px', borderRadius: 99,
        border: on ? '1px solid rgba(79,122,82,.32)' : '1px solid var(--lens-line-2)',
        background: on ? 'var(--lens-green-wash)' : 'rgba(255,255,255,.72)', whiteSpace: 'nowrap', opacity: busy ? 0.6 : 1 }}>
      {on ? <span style={{ color: 'var(--lens-green)', fontSize: 8 }}>●</span> : <GoldSpark size={10} />}
      <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 13.5, fontWeight: 600, color: on ? 'var(--lens-green-deep)' : 'var(--lens-ink)' }}>{cardTitle(lens)}</span>
      <span style={{ fontSize: 10, color: t.color }}>{t.glyph}</span>
    </button>
  );
}

/* full card for the real section */
export function FullLensCard({ lens, scope, attached, busy, active, onToggle }:
  { lens: any; scope?: string; attached: boolean; busy?: boolean; active?: boolean; onToggle: () => void }) {
  const on = attached;
  return (
    <div className="lenscard focusring" role="button" tabIndex={0} onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      style={{ borderRadius: 14, padding: '16px 18px 14px', background: 'rgba(255,255,255,.82)', cursor: 'pointer',
      border: active ? '1px solid var(--lens-purple-soft)' : on ? '1px solid rgba(79,122,82,.3)' : '1px solid var(--lens-line)',
      display: 'flex', flexDirection: 'column', gap: 8, opacity: busy ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {on ? <span style={{ color: 'var(--lens-green)', fontSize: 9 }}>●</span> : <GoldSpark size={12} />}
        <span style={{ flex: 1, fontFamily: 'var(--lens-serif)', fontSize: 17.5, fontWeight: 600 }}>{cardTitle(lens)}</span>
        <TypeTag type={cardType(lens)} />
      </div>
      <p className="ui" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--lens-ink-soft)', textWrap: 'pretty' } as CSSProperties}>{cardBody(lens)}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <WalkHint walk={scope || walkLabel(cardWalk(lens))} />
        <span className="ui" style={{ fontSize: 11.5, fontWeight: 600, color: on ? 'var(--lens-green-deep)' : 'var(--lens-purple)' }}>
          {busy ? '…' : on ? '✓ attached' : 'attach →'}
        </span>
      </div>
    </div>
  );
}

/* the "more in the library" deck — stacked card backs + count */
export function LibraryDeck({ count, label, onClick }: { count: number; label: string; onClick?: () => void }) {
  return (
    <button className="focusring lenschip" onClick={onClick} style={{ position: 'relative', width: 150, flexShrink: 0, border: 0, background: 'transparent', padding: 0, textAlign: 'left' }}>
      {[18, 9, 0].map((off, i) => (
        <span key={i} style={{ position: 'absolute', inset: 0, left: off, right: -off + 18, borderRadius: 12,
          background: i === 2 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.45)',
          border: '1px solid var(--lens-line)', transform: `rotate(${(2 - i) * 1.6}deg)`, transformOrigin: 'bottom left' }}></span>
      ))}
      <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 3, padding: '16px 16px' }}>
        <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 20, fontWeight: 600, color: 'var(--lens-purple-deep)' }}>{count} more</span>
        <span className="ui" style={{ fontSize: 11, color: 'var(--lens-muted)' }}>{label}</span>
      </span>
    </button>
  );
}

/* Nighteyes invent: compact card (quiet shelf) — display only (unwired). */
export function InventMini() {
  return (
    <div className="lenscard" style={{ width: 212, flexShrink: 0, borderRadius: 12, padding: '12px 14px',
      background: 'linear-gradient(160deg, var(--lens-gold-wash), rgba(247,239,220,.4))',
      border: '1px dashed var(--lens-gold-soft)', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <GoldSpark size={12} />
        <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 15, fontWeight: 600, color: 'var(--lens-gold)' }}>Ask your own</span>
      </div>
      <div style={{ fontFamily: 'var(--lens-serif)', fontStyle: 'italic', fontSize: 12.5, lineHeight: 1.45, color: 'var(--lens-ink-soft)', textWrap: 'pretty' } as CSSProperties}>
        Say what worries you in plain words — Night&nbsp;Eyes shapes it into a lens.
      </div>
    </div>
  );
}
