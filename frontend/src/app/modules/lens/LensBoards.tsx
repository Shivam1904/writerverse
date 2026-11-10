import { useState, type CSSProperties, type ReactNode } from 'react';
import { ScanEye } from 'lucide-react';
import { Button, PageHead, Spark } from '../../ui';
import { GoldSpark, InventMini, LensChip, MiniLensCard, FullLensCard, LibraryDeck, TypeTag, WalkHint } from './LensAtoms';
// the unified attach surface — imported as the FILE (not the lensKit barrel) to
// avoid a cycle (barrel → Shelf → LensBoards).
import { LensAttachContainer } from '../lensKit/AttachBox';
import { ShapingAttachBox } from '../lensKit/ShapingAttachBox';
import type { LensItem, useLensSection } from './useLensSection';

/* LensBoards — the four artboards from the "Lenses Exploration" handoff, ported
 * faithfully and fed by the live data flow (useLensSection):
 *   A · LensShelf  — quiet shelf of mini-cards (the threads page)
 *   B · LensRibbon — even quieter chip ribbon (the character page)
 *   C · LensReal   — the full three-card section + ask-your-own band (outline)
 *   D · LensShaping — the Night Eyes "shaping moment" (UI only, static)
 * The artboards' own --app-bg canvas is dropped; each board sits on the page. */

type Model = ReturnType<typeof useLensSection>;

/* ---------- shared bits ---------- */
function LensHeader({ sub, right, big }: { sub: string; right?: ReactNode; big?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
      <span style={{ fontFamily: 'var(--lens-serif)', fontSize: big ? 22 : 18, fontWeight: 600, letterSpacing: '-.01em' }}>Lenses</span>
      <span className="ui" style={{ fontSize: 12.5, color: 'var(--lens-muted)', textWrap: 'pretty' } as CSSProperties}>{sub}</span>
      <span style={{ flex: 1 }}></span>
      {right}
    </div>
  );
}

function MoreLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <button className="ui focusring" onClick={onClick} style={{
    border: 0, background: 'transparent', fontSize: 12, fontWeight: 600,
    color: 'var(--lens-purple)', padding: '2px 4px', whiteSpace: 'nowrap'
  }}>{children}</button>;
}

/* ====================================================================
   A · quiet shelf — mini-cards, one peeking + count
==================================================================== */
export function LensShelf({ model, onBrowse, showHeader = true }: { model: Model; onBrowse?: () => void; showHeader?: boolean }) {
  const { items, attach, detach, busyKey, moreCount, libraryCount } = model;
  const [attachingKey, setAttachingKey] = useState<string | null>(null);
  const attachingItem = items.find((i) => i.key === attachingKey) || null;
  const firstAttached = items.find((i) => i.attached);
  const head = items.slice(0, 3);
  const tail = items.slice(3);
  const card = (it: LensItem) => (
    <MiniLensCard
      key={it.key}
      lens={it.lens}
      bindings={it.bindings}
      busy={busyKey === it.key}
      active={attachingKey === it.key}
      onOpen={() => setAttachingKey(it.key)}
    />
  );
  return (
    <div className="lens-root" style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
      {showHeader && (
        <>
          <LensHeader sub="ways of reading your story — attach as many as you like, to any thread or walk"
            right={<MoreLink onClick={onBrowse}>library · {libraryCount} →</MoreLink>} />
          <div style={{ borderBottom: '1px solid var(--lens-line-2)', marginBottom: 16 }}></div>
        </>
      )}

      <div style={{ position: 'relative' }}>
        <div className="lens-shelf-scroll" style={{ display: 'flex', gap: 12, alignItems: 'stretch', overflowX: 'auto', paddingBottom: 2 }}>
          {head.map(card)}
          <InventMini />
          {tail.map(card)}
        </div>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, right: -1, width: 130, pointerEvents: 'none',
          background: 'linear-gradient(90deg, rgb(from var(--surface) r g b / 0), var(--surface) 80%)'
        }}></div>
        {moreCount > 0 && (
          <button className="ui focusring" onClick={onBrowse} style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--lens-line-2)', background: 'rgba(255,255,255,.9)',
            borderRadius: 99, padding: '6px 13px', fontSize: 12, fontWeight: 600, color: 'var(--lens-ink-soft)',
            boxShadow: '0 2px 10px -4px rgba(60,40,100,.25)'
          }}>
            {moreCount} more <span style={{ fontSize: 11 }}>→</span>
          </button>
        )}
      </div>

      {attachingItem && (
        <LensAttachContainer
          lens={attachingItem.lens}
          ctx={model.bundle}
          variant="withVerdicts"
          busy={busyKey === attachingItem.key}
          onAttach={(choice) => attach(attachingItem.lens, choice)}
          onDetach={(bid) => detach(bid)}
          onCancel={() => setAttachingKey(null)}
        />
      )}

      <div className="ui" style={{ marginTop: 12, fontSize: 11.5, color: 'var(--lens-muted)' }}>
        {firstAttached ? (
          <>
            <span style={{ color: 'var(--lens-green)', fontSize: 8, verticalAlign: 1 }}>● </span>
            {firstAttached.lens.name} is already reading your story.
          </>
        ) : (
          'any lens, on any thread — results show up inside the walk'
        )}
      </div>
    </div>
  );
}

/* ====================================================================
   B · footnote ribbon — chips only (character page)
==================================================================== */
export function LensRibbon({ model, onBrowse }: { model: Model; onBrowse?: () => void }) {
  const { items, attach, detach, busyKey, moreCount } = model;
  const toggle = (it: any) => (it.attached ? detach(it.bindings?.[0]?.binding_id ?? '') : attach(it.lens));
  const shown = items.slice(0, 4);
  return (
    <div className="lens-root" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', overflow: 'hidden', position: 'relative' }}>
        <span className="kicker" style={{ flexShrink: 0 }}>Lenses</span>
        {shown.map((it) => (
          <LensChip key={it.key} lens={it.lens} attached={it.attached} busy={busyKey === it.key} onToggle={() => toggle(it)} />
        ))}
        <button className="ui focusring lenschip" onClick={onBrowse} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px',
          borderRadius: 99, border: '1px dashed var(--lens-gold-soft)', background: 'var(--lens-gold-wash)', whiteSpace: 'nowrap'
        }}>
          <GoldSpark size={10} />
          <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 13.5, fontStyle: 'italic', color: 'var(--lens-gold)' }}>ask your own…</span>
        </button>
        {moreCount > 0 && <span className="ui" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--lens-muted)', flexShrink: 0 }}>+{moreCount}</span>}
      </div>
      <div className="ui" style={{ marginTop: 9, fontSize: 11.5, color: 'var(--lens-muted)' }}>
        any lens, on any thread — results show up inside the walk
      </div>
    </div>
  );
}

/* ====================================================================
   C · the real section — curated three + ask-your-own band
==================================================================== */
export function LensReal({ model, onBrowse }: { model: Model; onBrowse?: () => void }) {
  const { items, attach, detach, busyKey, shape, shaped, shaping, clearShaped } = model;
  const [shown, setShown] = useState(3);
  const [attachingKey, setAttachingKey] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const visible = items.slice(0, shown);
  const submitShape = () => { const q = ask.trim(); if (q && !shaping) shape(q); };
  return (
    <div className="lens-root" style={{ display: 'flex', flexDirection: 'column' }}>
      <LensHeader big sub="the outline is the real test — every thread has to hold together here"
        right={<MoreLink onClick={onBrowse}>library · {model.libraryCount} →</MoreLink>} />
      <div style={{ borderBottom: '1px solid var(--lens-line-2)', marginBottom: 18 }}></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, alignItems: 'start' }}>
        {visible.map((it) => (attachingKey === it.key ? (
          <div key={it.key} style={{ gridColumn: '1 / -1' }}>
            <LensAttachContainer
              lens={it.lens}
              ctx={model.bundle}
              variant="withVerdicts"
              busy={busyKey === it.key}
              onAttach={(choice) => attach(it.lens, choice)}
              onDetach={(bid) => detach(bid)}
              onCancel={() => setAttachingKey(null)}
            />
          </div>
        ) : (
          <FullLensCard key={it.key} lens={it.lens} scope={`${it.lens.walk === 'thread' ? 'thread' : it.lens.walk === 'chapter' ? 'chapter' : 'outline'} walk · whole story`}
            attached={it.attached} busy={busyKey === it.key}
            onToggle={() => setAttachingKey(it.key)} />
        )))}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'stretch' }}>
        {/* Night Eyes "shape it" band — type a worry → AI shapes a lens → attach box */}
        <div style={{
          flex: 1, borderRadius: 14, border: '1px dashed var(--lens-gold-soft)',
          background: 'linear-gradient(160deg, var(--lens-gold-wash), rgba(247,239,220,.35))', padding: '16px 20px 15px',
          display: 'flex', flexDirection: 'column', gap: 9
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GoldSpark size={13} />
            <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 16.5, fontWeight: 600, color: 'var(--lens-gold)' }}>Ask your own</span>
            <span className="ui" style={{ fontSize: 11.5, color: 'var(--lens-muted)' }}>— what matters in <i>this</i> story? Night Eyes shapes it into a lens.</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--lens-line-2)',
            borderRadius: 12, padding: '11px 14px'
          }}>
            <input
              className="ui focusring"
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitShape(); } }}
              disabled={shaping}
              placeholder="does Pepper disappear for too long in the middle?"
              style={{
                flex: 1, border: 0, background: 'transparent', outline: 'none',
                fontFamily: 'var(--lens-serif)', fontStyle: 'italic', fontSize: 14.5, color: 'var(--lens-ink)',
              }}
            />
            <button className="ui focusring" onClick={submitShape} disabled={shaping || !ask.trim()} style={{
              border: 0, borderRadius: 99, padding: '6px 16px', fontSize: 12.5, fontWeight: 600,
              background: 'var(--lens-purple)', color: '#fff', opacity: (shaping || !ask.trim()) ? 0.55 : 1,
              whiteSpace: 'nowrap',
            }}>{shaping ? 'Shaping…' : 'Shape it ✦'}</button>
          </div>
        </div>
        <LibraryDeck count={Math.max(0, model.libraryCount - visible.length)} label="fit the outline walk" onClick={() => setShown((s) => s + 3)} />
      </div>

      {/* the shaped lens → the AI shaping attach box; Attach binds it lazily */}
      {shaped && (
        <div style={{ marginTop: 14 }}>
          <ShapingAttachBox
            lens={shaped}
            ctx={model.bundle}
            busy={busyKey === shaped.slug}
            onAttach={async (choice) => {
              const res = await attach(shaped, choice);
              if (res?.bindingId) { setAsk(''); clearShaped(); }
            }}
            onCancel={clearShaped}
          />
        </div>
      )}
    </div>
  );
}

/* ====================================================================
   D · Night Eyes shaping moment — UI only (static mock)
==================================================================== */
export function LensShaping() {
  return (
    <div className="lens-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* the asked question */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--lens-line-2)',
        borderRadius: 12, padding: '12px 16px'
      }}>
        <GoldSpark size={12} />
        <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 15.5, color: 'var(--lens-ink)' }}>does Pepper disappear for too long in the middle?</span>
        <span className="ui" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--lens-muted)' }}>shaping…</span>
      </div>

      {/* Night Eyes note */}
      <div className="ui" style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--lens-ink-soft)', padding: '0 4px', textWrap: 'pretty' } as CSSProperties}>
        <b style={{ color: 'var(--lens-gold)' }}>✦ Night Eyes</b> read your threads — Pepper carries <i>Holding the Center</i>,
        and she goes quiet between the midpoint and the climax. Here's a lens for that:
      </div>

      {/* the shaped lens */}
      <div style={{
        borderRadius: 16, background: 'rgba(255,255,255,.9)', border: '1px solid var(--lens-gold-soft)',
        boxShadow: '0 18px 44px -28px rgba(60,40,100,.45)', padding: '20px 24px 18px', display: 'flex', flexDirection: 'column', gap: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 21, fontWeight: 700, letterSpacing: '-.01em' }}>Pepper's Presence</span>
          <TypeTag type="map" size={11.5} />
          <span className="ui" style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
            textTransform: 'uppercase', color: 'var(--lens-gold)', background: 'var(--lens-gold-wash)', borderRadius: 99, padding: '3px 10px'
          }}>your lens</span>
        </div>
        <p className="ui" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--lens-ink-soft)', maxWidth: 640, textWrap: 'pretty' } as CSSProperties}>
          Tracks how long Pepper stays off the page between appearances — and flags any stretch
          long enough for a reader to stop expecting her back.
        </p>
        {/* tiny output preview */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 44, padding: '4px 2px 0' }}>
          {[18, 30, 8, 0, 0, 0, 0, 26, 38].map((v, i) => (
            <span key={i} style={{
              width: 30, borderRadius: '4px 4px 0 0',
              height: v === 0 ? 4 : v, background: v === 0 ? 'var(--lens-rust-wash)' : 'rgba(95,134,191,.4)',
              border: v === 0 ? '1px solid rgba(176,87,63,.4)' : '1px solid transparent'
            }}></span>
          ))}
          <span className="ui" style={{ fontSize: 10.5, color: 'var(--lens-rust)', marginLeft: 8, marginBottom: 2 }}>↑ four silent chapters</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--lens-line)', paddingTop: 13, marginTop: 3 }}>
          <WalkHint walk="outline · chapter · Pepper Potts" />
          <span style={{ flex: 1 }}></span>
          <button className="ui focusring" style={{ border: 0, background: 'transparent', fontSize: 12.5, fontWeight: 600, color: 'var(--lens-muted)', padding: '6px 10px' }}>discard</button>
          <button className="ui focusring" style={{
            border: '1px solid var(--lens-purple-soft)', background: 'transparent', borderRadius: 99,
            padding: '6px 15px', fontSize: 12.5, fontWeight: 600, color: 'var(--lens-purple)'
          }}>reshape</button>
          <button className="ui focusring" style={{
            border: 0, background: 'var(--lens-purple)', color: '#fff', borderRadius: 99,
            padding: '7px 17px', fontSize: 12.5, fontWeight: 600
          }}>Attach to outline · chapter</button>
        </div>
      </div>
    </div>
  );
}

/* ====================================================================
   E · the analysis workspace — kit PageHead chrome over the medium
       horizontal shelf (LensShelf body, header suppressed). Same atoms
       + the exact same scroller / gradient / "N more" / attach flow as
       the shelf — just framed by the kit header instead of LensHeader.
==================================================================== */
export function LensWorkspace({ model, onBrowse, onSuggest, eyebrow = 'Plan · analysis', title = 'Analysis', showHead = true }:
  { model: Model; onBrowse?: () => void; onSuggest?: () => void; eyebrow?: string; title?: string; showHead?: boolean }) {
  return (
    <div className="lens-root">
      {showHead && (
        <>
          <PageHead
            eyebrow={eyebrow}
            icon={<ScanEye size={22} strokeWidth={1.7} />}
            title={title}
            actions={<Button variant="ai" size="sm" onClick={onSuggest}><Spark /> Suggest lenses</Button>}
            className="mb-2"
          />
          <p className="ui" style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--lens-muted)' }}>
            ways of reading your story — attach as many as you like, to any thread or walk
          </p>
        </>
      )}
      <LensShelf model={model} onBrowse={onBrowse} showHeader={false} />
    </div>
  );
}
