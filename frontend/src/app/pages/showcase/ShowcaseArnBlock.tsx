import { useState } from 'react';
import '../../app.css';
import '../../modules/lens/lens.css';
import { ThemeProvider } from '../../theme/ThemeProvider';
import {
  AiDiamond, Field, PhraseParagraph, Segmented, Toggle, EntityDot, Eyebrow, Heading,
  type FieldProposal,
} from '../../ui';
import { MiniLensCard, InventMini, LibraryDeck, GoldSpark } from '../../modules/lens/LensAtoms';
import type { PackLens } from '../../modules/lens/lensLibrary';

/**
 * /demo/showcase-arn — the ARN BLOCK vocabulary.
 *
 * An ARN block is NOT a card. It's a vertical stack of named SLOTS, arranged by
 * the page itself, every slot a real kit/lens component. The parent passes the
 * ARN's data down; the block owns its own save / accept actions.
 *
 * This page demonstrates ONE form-type leaf ARN
 *   `character-studio:maya:identity:appearance`
 * and defines the small NEW atoms the block needs (lens-mode icon, proposal dot,
 * ARN heading, ARN chip) — showcase-first, per house rule, before they graduate
 * into the kit. Everything else is copied from /demo/showcase-ui.
 *
 * House rule: NO CSS files — Tailwind / inline / existing tokens only. The lens
 * atoms below follow the lens module's own inline-`--lens-*`-token convention.
 */

const ASP = { char: 'var(--asp-characters)', thread: 'var(--asp-threads)' };

/* ─────────────────────────────── NEW vocabulary atoms ───────────────────────
 * GAP: none of these exist in the kit yet. They're proposed here so the ARN
 * block has a complete vocabulary; promote the keepers into ui/ or modules/lens.
 * ───────────────────────────────────────────────────────────────────────────── */

/** The lens indicator — six modes. (Today's `LensChip` only has attached/unattached.) */
type LensMode = 'unattached' | 'idle' | 'reading' | 'good' | 'problem' | 'stale';
const LENS_MODE: Record<LensMode, { color: string; glyph: string; title: string }> = {
  unattached: { color: 'var(--lens-gold)', glyph: '✦', title: 'no lens attached' },
  idle: { color: 'var(--lens-muted)', glyph: '◠', title: 'attached · not read yet' },
  reading: { color: 'var(--lens-purple)', glyph: '◠', title: 'reading…' },
  good: { color: 'var(--lens-green)', glyph: '●', title: 'reads ok' },
  problem: { color: 'var(--lens-rust)', glyph: '▲', title: 'found a problem' },
  stale: { color: 'var(--lens-gold)', glyph: '◌', title: 'verdict stale · re-scan' },
};
function LensModeIcon({ mode, size = 13 }: { mode: LensMode; size?: number }) {
  const m = LENS_MODE[mode];
  return (
    <span title={m.title} style={{ color: m.color, fontSize: size, lineHeight: 1, display: 'inline-flex' }}>
      {m.glyph}
    </span>
  );
}

/** The green proposal dot — shown only while fields have pending proposals. */
function ProposalDot({ on }: { on: boolean }) {
  return on ? <EntityDot color="var(--lens-green)" size={9} /> : null;
}

/** Heading slot — the parent passes this in. Title + indicators + the ask button. */
function ArnHeading({
  glyph, title, hasProposal, lensMode, onAsk,
}: { glyph: string; title: string; hasProposal: boolean; lensMode: LensMode; onAsk?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="kit-pagehead-glyph" style={{ fontSize: 16 }}>{glyph}</span>
      <Heading as="h2" size="section">{title}</Heading>
      <ProposalDot on={hasProposal} />
      <LensModeIcon mode={lensMode} />
      <div className="ml-auto"><AiDiamond size={26} onClick={onAsk} title="Discuss with Night Eyes" /></div>
    </div>
  );
}

/** The chip — the SAME node addressed from elsewhere (a margin, a rail, a list). */
function ArnChip({
  title, hasProposal, lensMode,
}: { title: string; hasProposal: boolean; lensMode: LensMode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
      style={{ border: '1px solid var(--lens-line)', background: 'rgba(255,255,255,.6)' }}
    >
      <span style={{ fontFamily: 'var(--lens-serif)', fontWeight: 600, fontSize: 13 }}>{title}</span>
      <ProposalDot on={hasProposal} />
      <LensModeIcon mode={lensMode} size={11} />
    </span>
  );
}

/* ─────────────────────────────── sample ARN data (parent-passed) ───────────── */
const hero: PackLens = { key: 'hero', name: 'Does the Hero Grow?', type: 'arc', walk: 'thread', desc: 'Whether your main character actually changes — from who they were to who they need to become.', templateId: 'does_hero_grow' };
const energy: PackLens = { key: 'energy', name: 'Scene Energy', type: 'map', walk: 'outline', desc: 'How much each scene moves the story — its energy and momentum, scene by scene.', templateId: 'scene_energy' };
const loose: PackLens = { key: 'loose', name: 'Loose Ends', type: 'payoff', walk: 'outline', desc: 'Whether everything you set up actually pays off later.', templateId: 'loose_ends' };

const IDEAS = [
  { text: 'cropped black hair, always a little severe', tags: [{ label: 'Maya', dot: ASP.char }] },
  { text: 'wears her late father’s grey coat', tags: [{ label: 'grief' }, { label: 'Maya', dot: ASP.char }] },
  { text: 'lean and tall, moves like she’s bracing for impact', tags: [{ label: 'Revenge arc', dot: ASP.thread }] },
];

/* ─────────────────────────────── the ARN block ─────────────────────────────── */

function AppearanceArnBlock() {
  // Parent passes data; the block owns its own save/accept.
  const [vals, setVals] = useState<any>({ age: '29', gender: '', build: 'lean and tall', hair: '', eyes: 'grey' });
  const [hairProp, setHairProp] = useState<string | null>('cropped black'); // one pending field proposal
  const set = (k: string) => (next: string) => setVals((v: any) => ({ ...v, [k]: next }));

  const [formMode, setFormMode] = useState('madlibs'); // madlibs | form
  const [showIdeas, setShowIdeas] = useState(true);
  const [showShelf, setShowShelf] = useState(false);
  const [showVerdicts, setShowVerdicts] = useState(true);

  const hairProposal: FieldProposal | undefined = hairProp
    ? {
      value: hairProp,
      onEdit: (next) => setHairProp(next),
      onAccept: (final) => { setVals((v: any) => ({ ...v, hair: final })); setHairProp(null); },
      onReject: () => setHairProp(null),
    }
    : undefined;

  const hasProposal = hairProp != null;
  const lensMode: LensMode = showVerdicts ? 'good' : showShelf ? 'idle' : 'unattached';

  return (
    <div className="flex flex-col gap-4">
      {/* SLOT 1 — heading (parent-provided), with proposal dot + lens mode + ask */}
      <ArnHeading glyph="◐" title="Appearance" hasProposal={hasProposal} lensMode={lensMode} />

      {/* SLOT 2 — the toggle row: ideas · lens attach · lens verdicts · form mode */}
      <div className="flex flex-wrap items-center gap-2">
        <Toggle on={showIdeas} onChange={setShowIdeas}>Ideas</Toggle>
        <Toggle on={showShelf} onChange={setShowShelf}>Lens attach</Toggle>
        <Toggle on={showVerdicts} onChange={setShowVerdicts}>Lens verdicts</Toggle>
        <span className="ml-auto" />
        <Segmented
          value={formMode}
          onChange={setFormMode}
          ariaLabel="form layout"
          options={[{ value: 'madlibs', label: 'Madlibs' }, { value: 'form', label: 'Form' }]}
        />
      </div>

      {/* SLOT 3 — the form: a leaf ARN is either a form or a beat list. This is the
          form case, toggling madlibs ↔ normal. Both are the kit `Field`. */}
      {formMode === 'madlibs' ? (
        <p className="kit-madlib">
          <b>Maya</b> is <Field inline value={vals.age} placeholder="how old?" onCommit={set('age')} />,{' '}
          <Field inline value={vals.gender} placeholder="gender?" onCommit={set('gender')} />,{' '}
          <Field inline value={vals.build} placeholder="build?" onCommit={set('build')} /> in build, with{' '}
          <Field inline value={vals.hair} placeholder="hair?" proposed={hairProposal} onCommit={set('hair')} /> hair and{' '}
          <Field inline value={vals.eyes} placeholder="eyes?" onCommit={set('eyes')} /> eyes.
        </p>
      ) : (
        <div className="flex w-full max-w-md flex-col">
          <Field label="Age" value={vals.age} onCommit={set('age')} />
          <Field label="Gender" value={vals.gender} onCommit={set('gender')} />
          <Field label="Build" value={vals.build} onCommit={set('build')} />
          <Field label="Hair" value={vals.hair} proposed={hairProposal} onCommit={set('hair')} />
          <Field label="Eyes" value={vals.eyes} onCommit={set('eyes')} className="!mb-0" />
        </div>
      )}

      {/* SLOT 4 — accept-all, only when proposed fields exist */}
      {hasProposal && (
        <button
          type="button"
          className="kit-acceptall self-start"
          onClick={() => { setVals((v: any) => ({ ...v, hair: hairProp })); setHairProp(null); }}
        >
          ✓ Accept all · 1
        </button>
      )}

      {/* SLOT 5 — ideas attached, as the phrase-paragraph representation */}
      {showIdeas && (
        <div className="max-w-lg">
          <Eyebrow className="mb-1">from your ideas</Eyebrow>
          <PhraseParagraph phrases={IDEAS} />
        </div>
      )}

      {/* SLOT 6 — lens attach shelf */}
      {showShelf && (
        <div>
          <Eyebrow className="mb-2">attach a lens</Eyebrow>
          <div className="flex flex-wrap items-start gap-3">
            <MiniLensCard lens={hero} onOpen={() => { }} />
            <MiniLensCard lens={energy} bindings={[{ binding_id: 'b1', walk: 'outline', scopeType: 'character', scopeName: 'Maya' } as any]} onOpen={() => { }} />
            <InventMini />
            <LibraryDeck count={14} label="fit this facet" onClick={() => { }} />
          </div>
        </div>
      )}

      {/* SLOT 7 — lens verdicts, one row per attached lens */}
      {showVerdicts && (
        <div className="max-w-lg">
          <Eyebrow className="mb-1.5">lens verdicts</Eyebrow>
          <div className="flex flex-col gap-1.5">
            {[
              { lens: hero, mode: 'good' as LensMode, read: 'Her look stays true across every chapter.' },
              { lens: loose, mode: 'problem' as LensMode, read: 'The grey coat is set up in ch.1 but never pays off.' },
              { lens: energy, mode: 'stale' as LensMode, read: 'Last read 6 scenes ago — re-scan to refresh.' },
            ].map((v) => (
              <div key={v.lens.key} className="flex items-baseline gap-2">
                <LensModeIcon mode={v.mode} size={11} />
                <span style={{ fontFamily: 'var(--lens-serif)', fontWeight: 600, fontSize: 13.5 }}>{v.lens.name}</span>
                <span className="ui" style={{ fontSize: 12, color: 'var(--lens-ink-soft)' }}>{v.read}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── the page ──────────────────────────────────── */

export default function ShowcaseArnBlock() {
  return (
    <ThemeProvider>
      <div
        className="wv2-root text-foreground"
        style={{
          padding: 24,
          background: 'radial-gradient(ellipse 120% 85% at 50% -10%, color-mix(in srgb, var(--paper) 45%, var(--surface)) 0%, var(--surface) 62%)',
        }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 overflow-y-auto pb-16">
          <div>
            <Eyebrow className="mb-1">/demo/showcase-arn</Eyebrow>
            <Heading as="h1" size="page">ARN Block — vocabulary</Heading>
            <p className="ui mt-1" style={{ fontSize: 13, color: 'var(--lens-ink-soft)' }}>
              One form-type leaf ARN <code className="font-sans text-[11px]">character-studio:maya:identity:appearance</code>,
              a bare stack of slots — no card.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_240px]">
            {/* the block */}
            <section className="border-t border-border pt-6">
              <AppearanceArnBlock />
            </section>

            {/* vocabulary legend */}
            <aside className="border-t border-border pt-6">
              <Eyebrow className="mb-2">the chip — same node, elsewhere</Eyebrow>
              <div className="mb-6 flex flex-col items-start gap-2">
                <ArnChip title="Appearance" hasProposal lensMode="good" />
                <span className="ui" style={{ fontSize: 11, color: 'var(--lens-muted)' }}>
                  heading + proposal dot + lens mode, for a margin / rail / list.
                </span>
              </div>

              <Eyebrow className="mb-2">lens icon — six modes</Eyebrow>
              <div className="flex flex-col gap-1.5">
                {(Object.keys(LENS_MODE) as LensMode[]).map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <LensModeIcon mode={m} />
                    <span className="ui" style={{ fontSize: 12 }}>{m}</span>
                    <span className="ui" style={{ fontSize: 11, color: 'var(--lens-muted)' }}>— {LENS_MODE[m].title}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-2">
                <GoldSpark />
                <span className="ui" style={{ fontSize: 11, color: 'var(--lens-muted)' }}>
                  proposal dot = <span style={{ color: 'var(--lens-green-deep)' }}>green</span> while fields are pending.
                </span>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
