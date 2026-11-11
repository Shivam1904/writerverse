import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { InitHead } from '../../components/InitHead';
import { useCountsRecord } from '../../useCounts';
import { KINDS } from './fixtures';
import { glyphFor } from './components/glyphs';
import { LensCard } from './components/LensCard';
import { ConfigPresetModal } from './components/ConfigPresetModal';
import { BindingsModal } from './components/BindingsModal';
import { loadSuggestions, loadInventions, suggestGauges, suggestCustomGauges } from './api';
import { queries } from '../../queries';
import './lenses-init.css';

/**
 * GaugesInit — the first-reading entry to the gauges (watching) section. FORKED
 * from `lenses/components/LensesInit` and rewired to the four-source contract:
 * the family cards are backed by the live bank (get_gauge_catalogue), "Suggest gauges
 * for me" fires suggest_gauges (→ proposals → the suggested list), and Continue
 * opens the gauges ConfigureLensModal (bind + accept). Rendered by GaugesWatching
 * while nothing is bound; the moment a gauge binds, the board refetches and the
 * page falls through to the watching grid.
 */

interface Family { kind: string; who: string; qq: string; svg: React.ReactNode }

// The four reader personas, in the design's grid order. `who`/`qq`/`svg` are the
// fallback face used only when the bank has no lens of that kind.
const FAMILIES: Family[] = [
  { kind: 'feeling', who: 'The close reader', qq: 'Does the tension keep rising?',
    svg: <><path d="M4 19l4-4 4-1 4-4 4-3" /><circle cx="20" cy="7" r="2" /></> },
  { kind: 'loose-end', who: 'The continuity editor', qq: 'Does anything contradict itself?',
    svg: (<><path d="M3.5 12 C 7 12, 8.5 11.5, 10 11.4" /><path d="M14 11.4 C 15.5 11.5, 17 12, 20.5 12" /><circle cx="3.5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="20.5" cy="12" r="1.7" /><path className="li-mk-contra" d="M10.8 10.2 H13.4" /><path className="li-mk-contra" d="M10.8 12.6 H13.4" /><path className="li-mk-contra" d="M13.2 9.5 L11 13.3" /></>) },
  { kind: 'tracking', who: 'The location tracker', qq: 'Where is everyone, scene by scene?',
    svg: <><path d="M12 3a6 6 0 0 1 6 6c0 4.5-6 12-6 12S6 13.5 6 9a6 6 0 0 1 6-6z" /><circle cx="12" cy="9" r="2" /></> },
  { kind: 'fair-share', who: 'The balance critic', qq: 'Does every storyline get enough room?',
    svg: (<><rect x="4" y="10" width="3" height="10" rx="1" /><rect x="10.5" y="5" width="3" height="15" rx="1" /><rect x="17" y="13" width="3" height="7" rx="1" /></>) },
];

export function GaugesInit({ onBound }: { onBound?: () => void }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { counts } = useCountsRecord(projectId);
  const eyesRef = useRef<HTMLDivElement>(null);

  // Bank + suggestions via the live caps (shared TanStack caches with the bank page).
  const { data: catalogue } = useQuery({ ...queries.gaugeCatalogue(projectId), enabled: !!projectId });
  const { data: suggestions = [] } = useQuery({ queryKey: ['gauges', String(projectId), 'suggestions'], queryFn: () => loadSuggestions(projectId), enabled: !!projectId });
  const { data: inventions = [] } = useQuery({ queryKey: ['gauges', String(projectId), 'inventions'], queryFn: () => loadInventions(projectId), enabled: !!projectId });

  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<any>(null);
  const [bindingPreset, setBindingPreset] = useState<any>(null);

  // The gate: a gauge needs something to read — an outline, scenes, or a thread.
  const n = (k: string) => counts[k] ?? 0;
  const hasMaterial = n('outline') > 0 || n('chapters') > 0 || n('threads') > 0;

  // Resolve each family slot to the first real bank lens of that kind.
  const cards = useMemo(
    () => FAMILIES.map((fam) => {
      const template = (catalogue?.templates ?? []).find((t: any) => (t.kind ?? 'feeling') === fam.kind) ?? null;
      return { ...fam, template, name: template?.name ?? fam.who, ask: template?.ask ?? fam.qq };
    }),
    [catalogue],
  );

  const selected = cards.find((c) => c.kind === selectedKind) ?? null;
  const pick = (kind: string) => setSelectedKind((cur) => (cur === kind ? null : kind));

  // The reader's recommendations = BOTH passes: bespoke inventions first (richer,
  // made-for-your-story), then the ready-made template fits.
  const picks = useMemo(() => [...inventions, ...suggestions], [inventions, suggestions]);
  // Which families the reader ACTUALLY flagged this run — drives the per-card
  // "reader's pick" badge so it reflects the real result, never a hardcoded guess.
  const pickedKinds = useMemo(
    () => new Set(picks.map((p: any) => p.kind).filter(Boolean)),
    [picks],
  );

  // The Reader recommends — fires BOTH suggest_gauges (template fits) and
  // suggest_custom_gauges (invent bespoke). Each appends to its candidate list,
  // which refetches via X-Invalidates. Only flag once the pass actually succeeds;
  // on failure surface why (the backend needs committed story elements first)
  // instead of badging picks the reader never made.
  async function castSuggest() {
    if (!projectId || !hasMaterial || suggesting) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      await Promise.all([suggestGauges(projectId), suggestCustomGauges(projectId)]);
      setFlagged(true);
    } catch (err: any) {
      setFlagged(false);
      const msg = String(err?.response?.data?.error || err?.message || '');
      setSuggestError(
        /story elements|run init|init first/i.test(msg)
          ? 'I need a bit more of your story before I can recommend — accept a character or two (or set a premise), then ask me again.'
          : 'I couldn’t read your story just now. Try again in a moment, or pick a gauge yourself below.',
      );
      console.error('gauge suggest run failed', err);
    } finally {
      setSuggesting(false);
    }
  }

  const gotoBank = () => projectId && navigate(`/project/${projectId}/gauges/bank`);
  const nudgeEyes = () => eyesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  function onContinue() {
    if (!selected) return;
    if (selected.template) setConfiguring(selected.template);   // → scope dialog (bind on accept)
    else gotoBank();
  }

  const readPhrase = useMemo(() => {
    const parts: string[] = [];
    if (n('outline') > 0) parts.push('your outline');
    if (n('chapters') > 0) parts.push('your scenes');
    if (n('threads') > 0) parts.push('your threads');
    if (parts.length === 0) return 'what you have';
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts]);

  return (
    <div className="wv2-init li-lenses">
      <InitHead
        section="gauges"
        eyebrow="Plan · lenses"
        title={<>See it through<br />other <em>eyes.</em></>}
        sub="A lens reads your story with one thing on its mind — the tension, a contradiction, who's where on the page. You pick a lens; it watches that one thing for you."
      />

      {hasMaterial ? (
        <div className="li-aside">
          <span className="d" />
          <span>It reads your outline, your manuscript, or a thread — <b>any one is enough</b> to start.</span>
        </div>
      ) : (
        <div className="li-aside li-needs">
          <span className="d" />
          <span>
            A gauge needs something to read first — an <b>outline</b>, your <b>manuscript</b>, or a <b>thread</b>.{' '}
            <button type="button" className="li-add-one" onClick={() => projectId && navigate(`/project/${projectId}/outline`)}>Add one &rarr;</button>
          </span>
        </div>
      )}

      {/* ===== HERO · the reader recommends where to look ===== */}
      <div className="wv2-init-seam"><span className="wv2-init-seam-lbl">The quick way</span><span className="wv2-init-seam-ln" /></div>

      <div className="li-caster">
        <div className="li-orb">
          <span className="li-spk">✦</span>
          <svg viewBox="0 0 36 36"><path d="M9 6 L24 6 Q27 6 27 9 L27 26 Q27 29 24 29 L12 29 Q9 29 9 26 Z" /><path d="M21 6 L21 11 L27 11" /><circle cx="14" cy="18" r="1.2" fill="currentColor" stroke="none" /><circle cx="20" cy="18" r="1.2" fill="currentColor" stroke="none" /><path d="M14.5 22 Q18 24 19.5 22" /></svg>
        </div>
        <div className="li-ctext">
          <div className="li-clabel">✦ your reader</div>
          <div className="li-ctitle">{suggestError ? 'Not yet — here’s why' : hasMaterial ? 'Not sure where to look?' : 'Nothing to read just yet'}</div>
          <div className={`li-cbody${suggestError ? ' li-cbody-err' : ''}`}>
            {suggestError
              ? suggestError
              : hasMaterial
                ? <>I&rsquo;ve read {readPhrase}. I&rsquo;ll point you to the few lenses worth starting with — and say why.</>
                : <>Give me an outline, a few scenes, or a thread, and I&rsquo;ll read it — then point you to the lenses worth starting with.</>}
          </div>
        </div>
        <div className="li-cact">
          <button type="button" className="li-btn-cast" onClick={castSuggest} disabled={!hasMaterial || suggesting}
            title={!hasMaterial ? 'Add an outline, scenes, or a thread first' : undefined}>
            <svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3.2" /></svg>
            {suggesting ? 'Reading your story…' : 'Suggest lenses for me'}
          </button>
          <button type="button" className="li-clink" onClick={nudgeEyes}>or pick one yourself ↓</button>
        </div>
      </div>

      {/* ===== THE READER'S PICKS — both passes: invented (made-for-your-story) +
          suggested template fits. Each card's "try on" opens the config dialog
          (bind + accept). ===== */}
      {picks.length > 0 && (
        <div className="lens-grid" style={{ marginTop: 14 }}>
          {picks.map((l: any) => (
            <LensCard key={`${l.source}-${l.proposal_id ?? l.id}`} lens={l}
              variant={l.source === 'invented' ? 'invented' : 'suggested'} watching={false}
              onOpen={(lens: any) => setConfiguring(lens)} boundScopes={{}} />
          ))}
        </div>
      )}

      {/* ===== THE EYES ===== */}
      <div className="wv2-init-seam"><span className="wv2-init-seam-lbl">Or pick a gauge yourself</span><span className="wv2-init-seam-ln" /></div>

      <div className="li-eyes" ref={eyesRef}>
        {cards.map((c) => {
          const on = selectedKind === c.kind;
          const picked = flagged && pickedKinds.has(c.kind);
          const meta = (KINDS as any)[c.kind] ?? (KINDS as any).feeling;
          return (
            <button key={c.kind} type="button" className={`li-card t-${c.kind}${on ? ' on' : ''}${picked ? ' picked sweep' : ''}`} onClick={() => pick(c.kind)}>
              <span className="li-pickflag"><span className="s">✦</span>reader&rsquo;s pick</span>
              <span className="li-go">
                <span className="li-open"><svg viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg></span>
                <span className="li-tick"><svg viewBox="0 0 24 24"><path d="M5 12l4.5 4.5L19 7" /></svg></span>
              </span>
              <span className="li-card-g"><svg viewBox="0 0 24 24">{c.template ? glyphFor(c.template.id ?? c.template.lens_id) : c.svg}</svg></span>
              <div className="li-card-body">
                <div className="li-who">{c.name}</div>
                <div className="li-qq">{c.ask}</div>
                <div className="li-kind"><span className="li-kd" />{meta.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="li-shelf">
        <span><span className="li-spk">✦</span> The whole bank —</span>
        <button type="button" onClick={gotoBank}>see the whole shelf<svg viewBox="0 0 24 24" width="11" height="11"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg></button>
      </div>

      {/* ===== NEXT-STEP BAR ===== */}
      <div className={`li-nextbar${selected ? ' ready' : ''}`}>
        <span className="li-iris" />
        <div className="li-nb-txt">
          {selected ? (
            <><div className="li-nb-line">You picked <b>{selected.name}</b>.</div><div className="li-nb-meta">Next, you choose <b>what it looks at</b> — your outline, your scenes, or a thread.</div></>
          ) : flagged && picks.length > 0 ? (
            <><div className="li-nb-line"><b>✦ Gauges flagged</b> — the ones most likely to catch something.</div><div className="li-nb-meta">Pick whichever you like.</div></>
          ) : flagged ? (
            <><div className="li-nb-line">Nothing jumped out yet.</div><div className="li-nb-meta">Pick whichever gauge interests you.</div></>
          ) : (
            <><div className="li-nb-line"><span className="muted">Pick a gauge to start.</span></div><div className="li-nb-meta">It&rsquo;s free, and it keeps watching as you write.</div></>
          )}
        </div>
        <button type="button" className="li-btn-continue" onClick={onContinue} disabled={!selected}>
          Continue<svg viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
        </button>
      </div>

      {/* config → preset, then attach scopes; binding refetches the board so the
          page falls through to the watching grid. */}
      <ConfigPresetModal
        lens={configuring}
        onClose={() => setConfiguring(null)}
        onShowBindings={(p: any) => { setConfiguring(null); setBindingPreset(p); }}
        onSaved={(p: any) => { setConfiguring(null); setBindingPreset(p); }}
      />
      {bindingPreset && (
        <BindingsModal preset={bindingPreset} onClose={() => { setBindingPreset(null); onBound?.(); }} onChanged={() => onBound?.()} />
      )}
    </div>
  );
}
