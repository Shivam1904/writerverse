import { useEffect, useMemo, useRef, useState } from 'react';
import { createPlotThread, loadThreadScaffolds, THREAD_SCOPE_TYPES, type ThreadScaffold } from '../../threads/data';
import { loadCharacters } from '../data';
import { ThreadScopePrefix, ThreadGlyphMark } from '../../threads/components/ThreadRow';
import { WeaveVisual, ShapeMini } from './StudioBits';
import { GlossyStoryIcon, normalizeGlyphKey, type StoryIconKey } from '../../../components/StoryIconsRegistry';

/* ScaffoldPickerModal — the Arc "Draft scaffolds" picker, matching the handoff
 * init-page modal: a weave hint in the header, cards leading with their beats
 * (3 idle / full on select) + a muted trend sparkline, and an "invent with Night
 * Eyes" block (with a "sketch arc" nudge when the arc is thin). Scaffold list =
 * loadThreadScaffolds (same source as the threads page's new-storyline modal).
 * On commit it creates one plot thread per chosen scaffold, then the page
 * refetches + jumps to Outline.
 *
 * Two modes:
 *   · default (studio)   — scope is fixed to `characterName`; single screen, the
 *     first 3 fitting cards + an empty spine, the rest behind "see more".
 *   · scopePicker (true) — the threads-page "New storyline" flow: no scope step.
 *     Each card carries its own scope (its scope_fit), shown on the card face via
 *     glossy story marks. Scope filter chips at the top filter the visible cards
 *     ("All" by default — the filter is NOT the scope, just a view). All fitting
 *     cards show at once. The scope a thread is born under lives in the card and
 *     is resolved in the "Name them" rows (a chooser when a card fits several
 *     scopes, a name field when the scope needs one).
 *
 * GAPS (UI now, wire later): "Invent" seeds Night Eyes / the page's Generate
 * popover; the merge/weave workspace isn't built. */

type BeatLine = { kind: 'heading' | 'text' | 'placeholder'; text: string };

function flatten(sc: ThreadScaffold): BeatLine[] {
  const out: BeatLine[] = [];
  for (const b of sc.beats) {
    if (b.heading) out.push({ kind: 'heading', text: b.heading });
    for (const p of b.placeholders) out.push({ kind: 'placeholder', text: p });
  }
  return out;
}

/* "Empty" scaffold — a blank spine to fill by hand: a heading, two beats to
 * write, and a placeholder. Injected client-side as the last option (the backend
 * scaffold shape only carries headings + placeholders, not plain `text` beats). */
const EMPTY_SCAFFOLD_ID = '__empty__';
const EMPTY_LINES: BeatLine[] = [
  { kind: 'heading', text: 'Heading' },
  { kind: 'text', text: 'Your story beat' },
  { kind: 'text', text: 'Your story beat' },
  { kind: 'placeholder', text: 'Placeholder beat goes here' },
];
const EMPTY_SCAFFOLD: ThreadScaffold = {
  id: EMPTY_SCAFFOLD_ID,
  name: 'Empty',
  suggested: false,
  scopeFit: ['story', 'character', 'relationship'],
  about: 'A blank spine — start from a heading, a couple of beats, and a placeholder, and shape it yourself.',
  using: '',
  beats: [],
};
/** Beat lines for a scaffold — the empty one carries its own (incl. text beats). */
const linesOf = (sc: ThreadScaffold): BeatLine[] => (sc.id === EMPTY_SCAFFOLD_ID ? EMPTY_LINES : flatten(sc));

/** A scope value → the glossy story-icon key that pictures it. Falls back to the
 *  scope's entity `mark` for scopes that don't normalize on their own name
 *  (relationship / theme / other all read as the thread silhouette). */
function scopeIconKey(v: string): StoryIconKey {
  const k = normalizeGlyphKey(v);
  if (k !== 'generic') return k;
  const def = THREAD_SCOPE_TYPES.find((s) => s.value === v);
  return (def?.mark as StoryIconKey) ?? 'thread';
}
const scopeLabel = (v: string) => THREAD_SCOPE_TYPES.find((s) => s.value === v)?.label ?? v;

export function ScaffoldPickerModal({
  projectId,
  characterName,
  arcReady = false,
  focusInvent = false,
  scopePicker = false,
  onClose,
  onCreated,
  onInvent,
  onSketchArc,
}: {
  projectId?: string;
  characterName?: string;
  arcReady?: boolean;
  focusInvent?: boolean;
  /** Threads-page mode: cards carry their own scope + scope filter chips. */
  scopePicker?: boolean;
  onClose: () => void;
  onCreated: () => void;
  onInvent?: () => void;
  onSketchArc?: () => void;
}) {
  const [scaffolds, setScaffolds] = useState<ThreadScaffold[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  // Per-scaffold thread title — defaults to the scaffold's own name (no scope
  // append; the scope is shown separately in the heading). Author edits before
  // creating; commit uses the edited value.
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);

  // ---- scope (scopePicker mode) — the scope lives in each card ------------- #
  // `scopeFilter` is a pure view filter over the card grid ("all" shows every
  // card). `cardScope` is the scope value chosen for a card that fits several;
  // `cardScopeName` is the per-card scope name (which character / item / …).
  const [scopeFilter, setScopeFilter] = useState('all');
  const [cardScope, setCardScope] = useState<Record<string, string>>({});
  const [cardScopeName, setCardScopeName] = useState<Record<string, string>>({});
  const [characters, setCharacters] = useState<any[]>([]);

  const panelRef = useRef<HTMLDivElement>(null);
  const inventRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadThreadScaffolds(projectId)
      .then((res) => { if (!cancelled) setScaffolds(res); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [projectId]);

  // Cast drives the character scope-name picker — only needed in scopePicker mode.
  useEffect(() => {
    if (!scopePicker) return;
    let cancelled = false;
    loadCharacters(projectId)
      .then((res: any) => { if (!cancelled) setCharacters(res?.characters ?? []); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [projectId, scopePicker]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // When opened via "Invent", scroll the invent block into view + highlight it.
  useEffect(() => {
    if (!focusInvent) return;
    const t = setTimeout(() => {
      if (panelRef.current && inventRef.current) {
        panelRef.current.scrollTop = inventRef.current.offsetTop - 60;
      }
    }, 90);
    return () => clearTimeout(t);
  }, [focusInvent, scaffolds.length]);

  // All scaffolds, suggested first. Studio mode narrows to character-fitting
  // ones (falling back to all); scopePicker mode keeps the whole list and lets
  // the scope chips filter it.
  const sortedAll = useMemo(
    () => [...scaffolds].sort((a, b) => Number(b.suggested) - Number(a.suggested)),
    [scaffolds],
  );
  const studioFit = useMemo(() => {
    const f = sortedAll.filter((s) => s.scopeFit.includes('character'));
    return f.length ? f : sortedAll;
  }, [sortedAll]);

  // Scope filter chips — the full scope list, always shown (a chip with no
  // matching scaffolds simply filters down to an empty grid + the empty spine).
  const scopeChips = THREAD_SCOPE_TYPES;

  // The cards visible right now (before the empty spine is appended).
  const visible = useMemo(() => {
    if (!scopePicker) return studioFit;
    return scopeFilter === 'all' ? sortedAll : sortedAll.filter((s) => s.scopeFit.includes(scopeFilter));
  }, [scopePicker, studioFit, sortedAll, scopeFilter]);

  // scopePicker shows every card + the empty spine; studio keeps the 3 + empty /
  // "see more" split.
  const mainCards = scopePicker ? [...visible, EMPTY_SCAFFOLD] : [...visible.slice(0, 3), EMPTY_SCAFFOLD];
  const moreCards = scopePicker ? [] : visible.slice(3);

  const scaffoldById = (id: string) => (id === EMPTY_SCAFFOLD_ID ? EMPTY_SCAFFOLD : sortedAll.find((s) => s.id === id));

  // The scope a card is born under: the chosen one, else the first it fits.
  const scopeValOf = (id: string) => {
    const sc = scaffoldById(id);
    return cardScope[id] ?? sc?.scopeFit?.[0] ?? 'story';
  };
  const scopeNeedsName = (v: string) => !!THREAD_SCOPE_TYPES.find((s) => s.value === v)?.needsName;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const defaultTitleFor = (id: string) => (id === EMPTY_SCAFFOLD_ID ? 'New thread' : scaffoldById(id)?.name ?? 'New thread');

  // The heading preview for a card: its resolved scope (+ name if needed). Studio
  // mode is fixed to the character scope.
  const previewScopeFor = (id: string) => {
    if (!scopePicker) return characterName ? { type: 'character', name: characterName } : null;
    const v = scopeValOf(id);
    return { type: v, name: scopeNeedsName(v) ? (cardScopeName[id]?.trim() || '') : '' };
  };

  // Ready to create when every selected card whose scope needs a name has one.
  const allNamed = useMemo(() => {
    if (!scopePicker) return true;
    return selected.every((id) => !scopeNeedsName(scopeValOf(id)) || (cardScopeName[id]?.trim().length ?? 0) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopePicker, selected, cardScope, cardScopeName]);

  const commit = async () => {
    if (!selected.length || busy || !allNamed) return;
    setBusy(true);
    try {
      for (const id of selected) {
        const sc = scaffoldById(id);
        if (!sc) continue;
        const beats = linesOf(sc).map((b) => ({ text: b.text, kind: b.kind }));
        // Clean name only — no scope append. The scope rides along in
        // scope_type/scope_name and is shown via the heading prefix.
        const title = (titles[id]?.trim()) || (sc.id === EMPTY_SCAFFOLD_ID ? 'New thread' : sc.name);
        const sType = scopePicker ? scopeValOf(id) : 'character';
        const sName = scopePicker
          ? (scopeNeedsName(sType) ? (cardScopeName[id]?.trim() || '') : '')
          : (characterName || '');
        await createPlotThread(projectId, {
          title,
          scopeType: sType,
          scopeName: sName,
          beats,
        });
      }
      onCreated();
    } catch (err) {
      console.error('scaffold thread create failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const card = (sc: ThreadScaffold, suggested: boolean) => {
    const on = selected.includes(sc.id);
    const isEmpty = sc.id === EMPTY_SCAFFOLD_ID;
    const lines = linesOf(sc);
    // The empty card always shows its full example (it's the example).
    const shown = on || isEmpty ? lines : lines.slice(0, 3);
    return (
      <button
        key={sc.id}
        type="button"
        className={`csm-card${on ? ' is-on' : ''}${isEmpty ? ' csm-card--empty' : ''}`}
        title={sc.about}
        onClick={() => toggle(sc.id)}
      >
        <div className="csm-card-top">
          <div className="csm-card-head-wrap">
            <div className="csm-card-head">
              <span className="csm-card-name">{sc.name}</span>
              {suggested && <span className="csm-pill">suggested</span>}
              {isEmpty && <span className="csm-pill csm-pill--quiet">blank start</span>}
            </div>
            <div className="csm-card-meta">
              <span className="csm-card-beats">{lines.length} beats</span>
              {/* The scope(s) this card holds — glossy story marks + labels. */}
              {!isEmpty && sc.scopeFit.length > 0 && (
                <span className="csm-card-beats inline-flex items-center gap-1">
                  {sc.scopeFit.map((v) => (
                    <GlossyStoryIcon key={v} iconKey={scopeIconKey(v)} color="var(--ink-3)" size={13} title={scopeLabel(v)} />
                  ))}
                  <span>{sc.scopeFit.map(scopeLabel).join(' · ')}</span>
                </span>
              )}
              <span className="csm-card-shape"><ShapeMini seed={sc.id} n={lines.length} color="var(--ink-3)" /></span>
            </div>
          </div>
          <span className="csm-card-check">{on ? '✓' : '+'}</span>
        </div>
        <div className="csm-card-beatlist">
          {shown.map((b, i) => (
            b.kind === 'heading' ? (
              <div key={i} className="csm-beat-h">{b.text}</div>
            ) : b.kind === 'text' ? (
              <div key={i} className="csm-beat-t"><span className="csm-beat-dot" />{b.text}</div>
            ) : (
              <div key={i} className="csm-beat-p"><span className="csm-beat-plus">+</span>{b.text}</div>
            )
          ))}
          {!on && !isEmpty && lines.length > 3 && (
            <span className="csm-card-more">+ {lines.length - 3} more beats — select to see all</span>
          )}
        </div>
      </button>
    );
  };

  // The scaffold grid + invent block. In scopePicker mode it's preceded by the
  // scope filter chips; the empty state copy differs by mode.
  const scaffoldStep = (
    <>
      {scopePicker && (
        <div className="thr-scope-grid">
          <button
            type="button"
            className={`thr-scope-chip${scopeFilter === 'all' ? ' is-on' : ''}`}
            onClick={() => setScopeFilter('all')}
          >
            All
          </button>
          {scopeChips.map((s) => {
            const active = scopeFilter === s.value;
            return (
              <button
                key={s.value}
                type="button"
                className={`thr-scope-chip${active ? ' is-on' : ''}`}
                onClick={() => setScopeFilter(s.value)}
              >
                <GlossyStoryIcon iconKey={scopeIconKey(s.value)} color={active ? 'var(--terra)' : 'var(--ink-3)'} size={16} />
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {visible.length === 0 && (
        <p className="csm-empty">
          No ready-made scaffolds {scopePicker ? 'for this scope' : 'for this character'} — start from an empty spine below.
        </p>
      )}
      <div className="csm-grid">
        {mainCards.map((s, i) => card(s, s.id !== EMPTY_SCAFFOLD_ID && (s.suggested || (!scopePicker && i === 0))))}
      </div>

      {moreCards.length > 0 && (
        showMore ? (
          <div className="csm-more">
            <div className="csm-more-lbl">More structures</div>
            <div className="csm-grid">{moreCards.map((s) => card(s, s.suggested))}</div>
          </div>
        ) : (
          <button type="button" className="csm-more-btn" onClick={() => setShowMore(true)}>
            See more structures ({moreCards.length}) ▾
          </button>
        )
      )}

      {/* Invent block — smart thread (AI). UI now; wiring is a gap. */}
      <div className={`csm-invent${focusInvent ? ' is-focus' : ''}`} ref={inventRef}>
        <div className="csm-invent-row">
          <span className="csm-invent-mk csm-invent-coin">✦</span>
          <div className="csm-invent-text">
            <div className="csm-invent-ttl">Invent one with Night Eyes</div>
            <div className="csm-invent-desc">
              {scopePicker
                ? 'A custom scaffold built from your ideas — it joins the list above.'
                : arcReady
                  ? 'A custom scaffold built from their arc — it joins the list above.'
                  : 'Scaffolds are tailored from their arc. Sketch their wants & misbeliefs first for a custom structure, or pick one above and fill it as you go.'}
            </div>
          </div>
        </div>
        <div className="csm-invent-actions">
          {!scopePicker && !arcReady && onSketchArc && (
            <button type="button" className="cst-btn-gold-outline" onClick={onSketchArc}>Sketch their arc</button>
          )}
          <button
            type="button"
            className="wv2-btn wv2-btn-primary wv2-btn-sm"
            onClick={() => { onInvent?.(); onClose(); }}
          >
            <span className="csm-invent-mk">✦</span> {scopePicker ? 'Generate a scaffold' : 'Invent a scaffold'}
          </button>
        </div>
      </div>
    </>
  );

  // Name them — one editable title per selected scaffold + a live preview of the
  // formatted heading. In scopePicker mode each row also resolves the card's
  // scope: a chooser when the card fits several, a name field when the scope
  // needs one (a cast picker for the character scope).
  const nameList = selected.length > 0 && (
    <div className="csm-namelist">
      {selected.map((id) => {
        const sc = scaffoldById(id);
        const def = defaultTitleFor(id);
        const val = titles[id] ?? def;
        const fits = sc?.scopeFit ?? [];
        const v = scopeValOf(id);
        const needsName = scopePicker && scopeNeedsName(v);
        return (
          <div key={id} className="csm-name-row">
            {scopePicker && (
              <div className="w-full flex flex-wrap items-center gap-2">
                {fits.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {fits.map((f) => {
                      const fon = v === f;
                      return (
                        <button
                          key={f}
                          type="button"
                          className={`thr-scope-chip${fon ? ' is-on' : ''}`}
                          onClick={() => setCardScope((p) => ({ ...p, [id]: f }))}
                        >
                          <GlossyStoryIcon iconKey={scopeIconKey(f)} color={fon ? 'var(--terra)' : 'var(--ink-3)'} size={15} />
                          {scopeLabel(f)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {needsName && (
                  v === 'character' && characters.length > 0 ? (
                    <select
                      className="thr-field-input thr-select"
                      value={cardScopeName[id] ?? ''}
                      onChange={(e) => setCardScopeName((p) => ({ ...p, [id]: e.target.value }))}
                    >
                      <option value="">Which character?</option>
                      {characters.map((c) => (
                        <option key={c.id ?? c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="thr-field-input"
                      type="text"
                      value={cardScopeName[id] ?? ''}
                      placeholder={`Which ${scopeLabel(v).toLowerCase()}?`}
                      onChange={(e) => setCardScopeName((p) => ({ ...p, [id]: e.target.value }))}
                    />
                  )
                )}
              </div>
            )}
            <input
              className="csm-name-input"
              value={val}
              placeholder={def}
              onChange={(e) => setTitles((p) => ({ ...p, [id]: e.target.value }))}
            />
            <div className="csm-name-preview" title="How this storyline's heading will read">
              <ThreadScopePrefix scope={previewScopeFor(id)} />
              <span className="csm-name-glyph"><ThreadGlyphMark size={14} /></span>
              <span className="csm-name-ttl">“{val.trim() || def}”</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="csm-backdrop" onClick={onClose}>
      <div className="csm-modal" ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <div className="csm-head">
          <div className="csm-head-row">
            <div className="csm-head-main">
              <span className="csm-kicker">{scopePicker ? 'New storyline' : 'Draft a thread scaffold'}</span>
              <h2 className="csm-title">
                {scopePicker ? 'Start another thread' : `Draft ${characterName ? `${characterName}'s` : 'their'} arc`}
              </h2>
            </div>
            <button type="button" className="csm-close" onClick={onClose} aria-label="close">×</button>
          </div>
          <div className="csm-weavehint">
            <WeaveVisual />
            <span className="ty-story-caption">
              Create threads for every narrative. <em>Most stories run on many interweaving plot threads.</em>
            </span>
          </div>
        </div>

        <div className="csm-body">
          {scaffoldStep}
        </div>

        <div className="csm-foot">
          {/* ③ Name them — pinned in the footer (with the save button) so it stays
              visible while the card grid scrolls; caps + scrolls when tall. */}
          {nameList && (
            <div className="w-full max-h-[34vh] overflow-y-auto">
              <div className="csm-namestep-h">Name {selected.length === 1 ? 'it' : 'them'}</div>
              {nameList}
            </div>
          )}
          <div className="flex items-center gap-3 w-full">
            <span className="csm-foot-count">
              <b>{selected.length}</b> scaffold{selected.length === 1 ? '' : 's'} chosen{selected.length >= 2 ? ' · ready to weave' : ''}
            </span>
            <span className="csm-foot-spacer" />
            <button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={onClose}>
              {selected.length ? 'Done' : 'Cancel'}
            </button>
            <button
              type="button"
              className="wv2-btn wv2-btn-primary wv2-btn-sm"
              disabled={!selected.length || busy || !allNamed}
              onClick={commit}
            >
              {busy ? 'Adding…' : `Add ${selected.length || ''} to outline →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
