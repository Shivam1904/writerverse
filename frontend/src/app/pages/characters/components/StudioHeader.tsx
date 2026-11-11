import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { generateCharacterPortrait } from '../data';
import { qk } from '../../../queries';
import { FieldEdit } from './FieldEdit';
import { useCharacterFields } from './useCharacterFields';
import { ColorDotPicker } from '../../../ui';
import { CHARACTER_COLOR_SHADES, ASPECT_HEX_PALETTE, characterColor, aspectColor } from '../../../theme/aspects';

/* ---- tier definitions (reused from the classic page) ---- */
const TIERS = [
  { value: 'protagonist', label: 'Protagonist', color: 'var(--terra)' },
  { value: 'main', label: 'Main', color: 'var(--gold)' },
  { value: 'supporting', label: 'Supporting', color: 'var(--sage)' },
  { value: 'extracted', label: 'Extracted', color: 'var(--ink-3)' },
] as const;

function tierToType(tier: string): string {
  if (tier === 'protagonist') return 'Protagonist';
  if (tier === 'main') return 'Main';
  if (tier === 'extracted') return 'Extracted';
  return 'Supporting';
}
function tierLabel(tier: string): string {
  return TIERS.find((t) => t.value === tier)?.label ?? 'Supporting';
}

/* Appearance slots, in the order they read into a portrait prompt. */
const APPEAR_SLOTS: [string, string][] = [
  ['age', 'Age'], ['gender', 'Gender'], ['build', 'Build'], ['hair', 'Hair'],
  ['eyes', 'Eyes'], ['clothing', 'Clothing'], ['home', 'Home'],
  ['costumes', 'Costumes'], ['features', 'Features'],
];

/**
 * StudioIdentityMark — the character's avatar + name + tier pill + intro line.
 *
 * Since the PageShell migration (2026-06-27) this is no longer the page heading:
 * the page title is a standard <PageHeader title={name}/> and the global ideas
 * toggle + stepper moved up to the header. This identity-mark cluster now renders
 * INSIDE the Identity section's body (the avatar is an identity mark, not the
 * heading anchor).
 *
 * Portrait card is carried over UNCHANGED from StudioHero (generate-from-appearance
 * flow). Name + tier persist inline via the shared field hook (Route.WRITE).
 */
export function StudioHeader({
  projectId,
  character,
}: {
  projectId?: string;
  character: any;
}) {
  const queryClient = useQueryClient();
  const { commitField } = useCharacterFields(projectId, character);

  /* tier inline picker */
  const [tierEditing, setTierEditing] = useState(false);

  /* ---- AI portrait: type a description → generate a transparent PNG ---- */
  const [genOpen, setGenOpen] = useState(false);
  const [genDesc, setGenDesc] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState('');
  const portraitUrl: string = character?.portrait_url || '';
  const wrapRef = useRef<HTMLDivElement>(null);

  /* Click outside the portrait + its panel closes the panel (but never mid-generate). */
  useEffect(() => {
    if (!genOpen) return;
    const onDown = (e: MouseEvent) => {
      if (genBusy) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setGenOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [genOpen, genBusy]);

  const generatePortrait = useCallback(async () => {
    const desc = genDesc.trim();
    if (!character || !projectId || !desc || genBusy) return;
    setGenBusy(true);
    setGenError('');
    setGenOpen(false); // close the panel immediately; the portrait shows the loading state
    try {
      await generateCharacterPortrait(projectId, character.id, desc);
      await queryClient.invalidateQueries({ queryKey: qk.characters(projectId) });
    } catch (err: any) {
      console.error('portrait generation failed:', err);
      setGenError(err?.response?.data?.error || err?.message || 'Generation failed. Try again.');
      setGenOpen(true); // reopen so the author sees the error and can retry
    } finally {
      setGenBusy(false);
    }
  }, [genDesc, character, projectId, genBusy, queryClient]);

  /* Appearance is BOTH the prerequisite for a portrait and its source. */
  const hasAppearance = useMemo(() => {
    const a = character?.appearance ?? {};
    if (String(a.description ?? '').trim()) return true;
    return APPEAR_SLOTS.some(([k]) => String(a[k] ?? '').trim());
  }, [character?.appearance]);

  const buildPortraitPrompt = useCallback(() => {
    const a = character?.appearance ?? {};
    const lines: string[] = [];
    const mainDesc = String(character?.description ?? '').trim();
    if (mainDesc) lines.push(mainDesc);
    const appDesc = String(a.description ?? '').trim();
    if (appDesc) lines.push(appDesc);
    const slots = APPEAR_SLOTS
      .map(([k, label]) => [label, String(a[k] ?? '').trim()] as const)
      .filter(([, v]) => v)
      .map(([label, v]) => `${label}: ${v}`);
    if (slots.length) lines.push(slots.join(', '));
    return lines.join('\n\n');
  }, [character?.description, character?.appearance]);

  const openGen = useCallback(() => {
    if (genBusy) return; // generation in flight — portrait is locked
    setGenError('');
    if (genOpen) { setGenOpen(false); return; }
    if (hasAppearance) setGenDesc(buildPortraitPrompt());
    setGenOpen(true);
  }, [genOpen, genBusy, hasAppearance, buildPortraitPrompt]);

  const tint = characterColor(character);

  return (
    // pt-5 = the 20px top padding a PageHeader gives other pages (this page has none).
    <div className="cst-hero pt-5">
      <div className="cst-portrait-wrap" ref={wrapRef}>
        <button
          type="button"
          className={`cst-portrait${portraitUrl ? ' cst-portrait--has-img' : ''}${genBusy ? ' is-generating' : ''}`}
          style={{ ['--cst-tint' as any]: tint }}
          title={genBusy ? 'Imagining a portrait…' : portraitUrl ? 'Regenerate portrait' : (hasAppearance ? 'Generate a portrait' : 'Add an appearance first')}
          aria-busy={genBusy}
          onClick={openGen}
        >
          {portraitUrl ? (
            <img className="cst-portrait-img" src={portraitUrl} alt={character?.name || 'portrait'} />
          ) : (
            <span className="cst-portrait-mono">{(character?.name || '?').charAt(0).toUpperCase()}</span>
          )}
          {genBusy && (
            <span className="cst-portrait-loading" aria-hidden="true">
              <span className="cst-portrait-sweep" />
              <span className="cst-portrait-spinner">✦</span>
              <span className="cst-portrait-loading-label">Imagining…</span>
            </span>
          )}
          {!genBusy && (
            <span className="cst-portrait-hint">{portraitUrl ? '↻ redo' : '+ portrait'}</span>
          )}
        </button>

        {genOpen && (
          <div className="cst-portrait-gen" onClick={(e) => e.stopPropagation()}>
            {hasAppearance ? (
              <>
                <div className="cst-portrait-gen-head">
                  <span className="cst-portrait-gen-title"><span className="cst-ask-mk">✦</span> Imagine a portrait</span>
                  <span className="cst-portrait-gen-sub">Drawn from this description — edit it freely.</span>
                </div>
                <textarea
                  className="cst-portrait-gen-input"
                  value={genDesc}
                  placeholder="Describe the character to imagine — e.g. “a weathered sea captain, grey beard, long coat, stern”"
                  autoFocus
                  disabled={genBusy}
                  onChange={(e) => setGenDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); generatePortrait(); }
                    if (e.key === 'Escape') setGenOpen(false);
                  }}
                />
                {genError && <div className="cst-portrait-gen-err">{genError}</div>}
                <div className="cst-portrait-gen-row">
                  <span className="cst-portrait-gen-kbd"><kbd>⌘</kbd><kbd>↵</kbd> to generate</span>
                  <button type="button" className="wv2-btn" disabled={genBusy} onClick={() => setGenOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="wv2-btn wv2-btn-primary"
                    disabled={genBusy || !genDesc.trim()}
                    onClick={generatePortrait}
                  >
                    Generate
                  </button>
                </div>
              </>
            ) : (
              <div className="cst-portrait-gate">
                <p>Add their <strong>appearance</strong> first — the portrait is generated from it. It's in the Appearance facet below.</p>
                <div className="cst-portrait-gen-row">
                  <button type="button" className="wv2-btn" onClick={() => setGenOpen(false)}>Got it</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="cst-id">
        <div className="cst-id-top">
          <ColorDotPicker
            color={characterColor(character)}
            value={character?.color}
            defaultColor={aspectColor('characters')}
            palette={CHARACTER_COLOR_SHADES.concat(ASPECT_HEX_PALETTE)}
            onPick={(c) => commitField({ color: c })}
            onReset={() => commitField({ color: '' })}
            size={14}
            title="Character colour"
          />
          <FieldEdit
            value={character?.name ?? ''}
            restTag="h2"
            restClassName={`cst-name${character?.name ? '' : ' is-empty'}`}
            restNode={character?.name || 'Unnamed'}
            editClassName="cst-name-input"
            placeholder="Character name"
            title="Click to rename"
            onCommit={(v) => { const t = v.trim(); if (t) commitField({ name: t }); }}
          />
          {tierEditing ? (
            <span className="cst-tier-pick">
              {TIERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`cst-tier-chip${(character?.tier ?? 'supporting') === t.value ? ' is-on' : ''}`}
                  onClick={() => { setTierEditing(false); commitField({ type: tierToType(t.value) }); }}
                >
                  <span className="cst-tier-sw" style={{ background: t.color }} />
                  {t.label}
                </button>
              ))}
            </span>
          ) : (
            <span className="cst-chip cst-chip-tier" onClick={() => setTierEditing(true)} title="Click to change tier">
              {tierLabel(character?.tier ?? 'supporting')}
            </span>
          )}
          <span className="cst-sechead-spacer" />
        </div>

        <p className="cst-hero-intro">
          Fleshing out the character's secrets, motivations, and emotional arc helps us analyse your prose.
        </p>
      </div>
    </div>
  );
}
