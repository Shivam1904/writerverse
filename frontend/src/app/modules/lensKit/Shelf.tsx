import { useState } from 'react';
import { LensAttachContainer } from './AttachBox';
import type { AttachChoice } from './attach';
import type { LensContextBundle } from './select';
import type { CatalogueLens } from './catalogue';
import { GoldSpark } from '../lens/LensAtoms';
import {
  LensShelf as BoardShelf, LensRibbon, LensReal, LensWorkspace, LensShaping,
} from '../lens/LensBoards';
import { Card } from '../../ui';

/* Shelf.tsx — the ONE shelf surface for every lens section, section + page.
 *
 * `LensShelf` is a dispatcher keyed by `variant`:
 *   · 'lite'      — the compact section/thread picker shelf (the arn SectionLens).
 *                   Fed by lenses + ctx + cast; opens the lite attach box inline.
 *   · 'shelf'     — the quiet mini-card shelf (the character page).
 *   · 'ribbon'    — the footnote chip ribbon.
 *   · 'real'      — the full three-card section + ask-your-own band (the outline).
 *   · 'workspace' — the kit-chrome analysis page (the threads page).
 *   · 'shaping'   — the Night Eyes shaping moment (static, UI only).
 * Every variant but 'lite' is fed by the page model (useLensSection) and delegates
 * to the rich board renderer in modules/lens/LensBoards — the kit doesn't reinvent
 * them, it hosts them. LensSection is the thin data wrapper that builds the model
 * and calls this. */

export type ShelfVariant = 'lite' | 'shelf' | 'ribbon' | 'real' | 'workspace' | 'shaping';

export function LensShelf(props: {
  variant?: ShelfVariant;
  // 'lite' (section) inputs
  label?: string; lenses?: CatalogueLens[]; ctx?: LensContextBundle; busy?: string | null;
  attachedSlugs?: string[]; onAttach?: (slug: string, choice: AttachChoice) => void; onClose?: () => void;
  // page-board inputs (model from useLensSection)
  model?: any; onSuggest?: () => void; eyebrow?: string; title?: string;
  /** workspace: hide the built-in PageHead (eyebrow/title/subtitle) when the
   *  caller already provides a section heading (e.g. the Threads page). */
  showHead?: boolean;
  // shared
  onBrowse?: () => void;
}) {
  const variant: ShelfVariant = props.variant ?? 'lite';
  if (variant !== 'lite') {
    const { model, onBrowse, onSuggest, eyebrow, title, showHead } = props;
    if (variant === 'shaping') return <LensShaping />;
    if (variant === 'ribbon') return <LensRibbon model={model} onBrowse={onBrowse} />;
    if (variant === 'real') return <LensReal model={model} onBrowse={onBrowse} />;
    if (variant === 'workspace')
      return <LensWorkspace model={model} onBrowse={onBrowse} onSuggest={onSuggest} eyebrow={eyebrow} title={title} showHead={showHead} />;
    return <BoardShelf model={model} onBrowse={onBrowse} />; // 'shelf'
  }
  return <SectionShelf {...(props as any)} />;
}

/* 'lite' — the section/thread picker shelf: a horizontal row of lens-question
 * cards; clicking a card opens the lite attach box (chart + basics + Attach)
 * under the shelf; attach is handed back up to the surface (SectionLens), which
 * shows the verdict face below. */
function SectionShelf({ label, lenses, ctx, busy, attachedSlugs = [], onAttach, onClose, onBrowse }: {
  label: string; lenses: CatalogueLens[]; ctx: LensContextBundle; busy: string | null; attachedSlugs?: string[];
  onAttach: (slug: string, choice: AttachChoice) => void; onClose: () => void; onBrowse?: () => void;
}) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const open = openSlug ? lenses.find((l) => l.slug === openSlug) : undefined;

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: 'var(--lens-serif)', fontSize: 17, fontWeight: 600, letterSpacing: '-.01em' }}>
          Read your prose for {label.toLowerCase()}
        </span>
        <span className="ui" style={{ fontSize: 11.5, color: 'var(--lens-muted)' }}>
          a lens reads every scene and flags where the draft drifts
        </span>
        <span style={{ flex: 1 }} />
        {onBrowse && (
          <button className="ui focusring" onClick={onBrowse}
            style={{ border: 0, background: 'transparent', fontSize: 11.5, fontWeight: 600, color: 'var(--lens-purple)', padding: 0, whiteSpace: 'nowrap' }}>library →</button>
        )}
        <button className="ui focusring sl-box-x" onClick={onClose} aria-label="close">×</button>
      </div>

      <div className="lens-shelf-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {lenses.map((l) => (
          <ShelfCard key={l.slug} lens={l} active={openSlug === l.slug} attached={attachedSlugs.includes(l.slug)}
            onOpen={() => setOpenSlug((s) => (s === l.slug ? null : l.slug))} />
        ))}
        {lenses.length === 0 && <p className="ui sl-box-empty">No lens questions registered for this node yet.</p>}
      </div>

      {open && (
        <LensAttachContainer lens={open} ctx={ctx} variant="bare" busy={busy === open.slug}
          onAttach={(choice) => onAttach(open.slug, choice)} onCancel={() => setOpenSlug(null)} />
      )}
    </Card>
  );
}

/* one lens-question card on the section shelf */
function ShelfCard({ lens, active, attached, onOpen }: { lens: CatalogueLens; active: boolean; attached?: boolean; onOpen: () => void }) {
  return (
    <div className="lenscard focusring" role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      style={{
        width: 204, flexShrink: 0, borderRadius: 12, padding: '12px 14px 11px', cursor: 'pointer',
        background: active ? 'var(--lens-purple-wash)' : 'rgba(255,255,255,.78)',
        border: '1px solid ' + (active ? 'var(--lens-purple-soft)' : 'var(--lens-line)'),
        display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'flex-start',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
        <span style={{ marginTop: 2 }}><GoldSpark size={11} /></span>
        <span style={{ flex: 1, fontFamily: 'var(--lens-serif)', fontSize: 14.5, fontWeight: 600, lineHeight: 1.25 }}>{lens.question}</span>
        {attached && (
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--lens-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M5 12l4.5 4.5L19 7" />
          </svg>
        )}
      </div>
      <div className="ui" style={{
        fontSize: 11.5, lineHeight: 1.45, color: 'var(--lens-ink-soft)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{lens.description}</div>
    </div>
  );
}
