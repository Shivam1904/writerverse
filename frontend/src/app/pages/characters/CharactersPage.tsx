import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import './characters.css';
import './people-init.css';
import {
  addCharacter,
  deleteCharacter,
  EMPTY_CAST,
  partitionByTier,
  updateCharacter,
  undeleteCharacter,
} from './data';
import { deletedWithUndo } from '../../modules/receipt/receiptStore';
import { loadBraindumps, addBraindump } from '../braindumps/data';
import { CastPageHeader, CastTierStrip } from './components/CastHead';
import { ProtagonistSpread } from './components/ProtagonistSpread';
import { MainGrid } from './components/MainGrid';
import { SupportingList } from './components/SupportingList';
import { DraftCharacterCandidates } from './components/DraftCharacterCandidates';
import { PeopleInit } from './components/PeopleInit';
import { LoadState } from '../../components/LoadError';
import { loadStatus } from '../../lib/loadStatus';
// CharacterFormModal removed — creation flows through the "describe one" field
// and the by-hand form; editing happens inline on the character studio page.
import { ProfileForm, type ProfileFieldDef } from '../../components/ProfileForm';
import { GenerateIdeasPopover } from '../../components/GenerateIdeasPopover';
import { PageShell } from '../../components/PageShell';
import { MarginBlock, MarginOverlay, type MarginItem } from '../../modules/margin';
import { WorldSectionEntry } from '../world/components/WorldMargin';
import { Users, Crown, Star, Brain, Plus } from 'lucide-react';
import { qk, queries } from '../../queries';

const ROLE_OPTIONS = ['Protagonist', 'Antagonist', 'Main', 'Supporting'];

const INLINE_PROFILE_FIELDS: ProfileFieldDef[] = [
  { key: 'type', label: 'Role', options: ROLE_OPTIONS },
  { key: 'description', label: 'Identity', multiline: true, placeholder: 'Spends hours alone, inventing people. Talks to them. Files it under "work."' },
  { key: 'internal_arc', label: 'Emotional journey', multiline: true, placeholder: 'Slowly discovers that being right about everything isn\'t actually a personality.' },
  { key: 'story', label: 'Plot', multiline: true, placeholder: 'Gets what they wanted. Turns out it was the wrong thing. Classic.' },
];

const SEEDS = ['the sister no one mentions', 'a kindly villain'];

const SHAPES: Array<{ id: string; text: string; kicker: string; icon: React.ReactNode }> = [
  {
    id: 'chosen',
    text: 'the orphan with a lightning scar and a destiny',
    kicker: 'the chosen one',
    icon: <svg viewBox="0 0 24 24"><path d="M5 14l-2 7 9-4 9 4-2-7" /><path d="M12 3v8" /><path d="M9 7l3-3 3 3" /></svg>,
  },
  {
    id: 'fallen',
    text: 'the mild teacher who became a kingpin',
    kicker: 'the fallen man',
    icon: <svg viewBox="0 0 24 24"><path d="M3 19l5-12 4 7 4-9 5 14" /></svg>,
  },
  {
    id: 'vigilante',
    text: 'the billionaire orphan who fights crime by night',
    kicker: 'the masked vigilante',
    icon: <svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7" /><path d="M5 10v9h14v-9" /><circle cx="12" cy="14" r="2" /></svg>,
  },
  {
    id: 'bearer',
    text: 'the small one carrying a ring that wants to be lost',
    kicker: 'the reluctant bearer',
    icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 4v8l5 3" /></svg>,
  },
  {
    id: 'symbol',
    text: "the girl who volunteered in her sister's place",
    kicker: 'the unwilling symbol',
    icon: <svg viewBox="0 0 24 24"><path d="M5 4l3 8-3 8M19 4l-3 8 3 8M8 12h8" /></svg>,
  },
  {
    id: 'mind',
    text: 'the cold genius who solves what no one else can',
    kicker: 'the consulting mind',
    icon: <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M16 16l5 5" /></svg>,
  },
];

const NAME_SLOT = '____';

const splitNameDesc = (raw: string): { name: string; description: string } => {
  const noBlank = raw.trim().replace(/^_{2,}\s*,?\s*/, '').trim();
  const m = noBlank.match(/^([^,]{1,40}),\s+((?:the|a|an)\s.+)$/i);
  if (m) return { name: m[1].trim(), description: m[2].trim() };
  return { name: '', description: noBlank };
};

const appendSentence = (d: string, t: string) =>
  d.trim() ? `${d.replace(/\s+$/, '')} ${t}` : `${NAME_SLOT}, ${t}`;
const removeSentence = (d: string, t: string) => {
  const next = d.replace(t, '').replace(/\s{2,}/g, ' ').replace(/\s*,\s*$/, '').trim();
  return next === NAME_SLOT ? '' : next;
};

type Tier = 'all' | 'protagonist' | 'main' | 'supporting';

export function CharactersPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tier, setTier] = useState<Tier>('all');
  const [desc, setDesc] = useState('');
  const [genOpen, setGenOpen] = useState(false);
  const [braindumps, setBraindumps] = useState<any[]>([]);
  // Name of the character the describe box just added ('' when they typed none),
  // shown as a one-line confirmation; null once the author starts the next one.
  const [addedName, setAddedName] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const genBtnRef = useRef<HTMLButtonElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const selectSlotRef = useRef(false);
  const describeRef = useRef<HTMLDivElement>(null);
  const addByHandRef = useRef<HTMLDivElement>(null);
  // Anchor for the margin overlay — measures the gutter position. Mounted on the
  // first shown tier block's gutter entry (see the return).
  const gutterAnchorRef = useRef<HTMLDivElement>(null);

  // D31 / Step 11 — first app page on TanStack Query. The queryKey is
  // ['characters', projectId] so the staleness bridge in `queryInvalidator.ts`
  // can call `invalidateQueries({queryKey: ['characters', pid]})` and refetch
  // this page from any write (UI button OR chat-accept) that hits the
  // `characters` domain in `backend/config/staleness.yml`.
  const castQuery = useQuery({
    ...queries.characters(projectId),
    enabled: !!projectId,
    staleTime: 60_000, // refetch is driven by invalidations, not polling
  });
  const { data: cast = EMPTY_CAST } = castQuery;
  // Until the cast has loaded, an empty list means nothing: show a spinner (or
  // "Couldn't load" + Retry), never the first-run cast init (SA-132, SA-154).
  const status = loadStatus(castQuery);

  // ---- mutations ----
  // Each mutation just `await`s the call. The gateway forwards the dispatch
  // response's `invalidates` to `handleDispatchInvalidates`, which calls
  // `queryClient.invalidateQueries(['characters', pid])` for us — useQuery
  // re-runs `loadCharacters` automatically. No more manual setCast / reload.

  // By-hand profile (PeopleInit). The create capability only carries
  // name/type/description; arc fields the author filled in (want / misbelief)
  // ride a follow-up update_character. Invalidate so the page flips from the
  // init surface to the populated cast the moment the first person lands.
  const onCreateByHand = useCallback(
    async (vals: Record<string, string>) => {
      const created = await addCharacter(projectId, {
        name: vals.name,
        type: vals.type || undefined,
        description: vals.description || undefined,
      });
      let saved = created;
      const extra: Record<string, string> = {};
      for (const k of ['want', 'need', 'misbelief', 'story', 'internal_arc']) {
        if (vals[k]?.trim()) extra[k] = vals[k].trim();
      }
      if (created?.id != null && Object.keys(extra).length) {
        saved = await updateCharacter(projectId, created.id, extra);
      }
      // Push the new person straight into the cache so the page flips from the
      // init takeover to the populated cast NOW — no waiting on the refetch.
      // The invalidate right after reconciles with server truth.
      if (saved?.id != null) {
        queryClient.setQueryData(qk.characters(projectId), (prev: any) => {
          const base = prev ?? EMPTY_CAST;
          const list = base.characters ?? [];
          const exists = list.some((c: any) => c.id === saved.id);
          return {
            ...base,
            characters: exists
              ? list.map((c: any) => (c.id === saved.id ? saved : c))
              : [...list, saved],
          };
        });
      }
      queryClient.invalidateQueries({ queryKey: qk.characters(projectId) });
    },
    [projectId, queryClient],
  );

  // Generate (Cast head / init) — create the character directly. The gateway
  // forwards the dispatch's `invalidates` so the cast query refetches; nothing
  // to update locally.
  const onGenerate = useCallback(
    async ({ name, description }: { name: string; description: string }) => {
      await addCharacter(projectId, { name, description });
    },
    [projectId],
  );

  // Two header buttons, two destinations at the foot of the page:
  //  • Create        → the "describe one" field (free text, saved as written; no AI).
  //  • Add character → the by-hand form (name + the structured fields).
  const focusDescribe = useCallback(() => {
    describeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => taRef.current?.focus(), 400);
  }, []);
  const focusAddForm = useCallback(() => {
    addByHandRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      const el = addByHandRef.current?.parentElement?.querySelector('.pf-name') as HTMLInputElement | null;
      el?.focus();
    }, 400);
  }, []);

  const showShapes = focused || picked.size > 0;

  useEffect(() => {
    if (!selectSlotRef.current) return;
    selectSlotRef.current = false;
    const ta = taRef.current;
    if (ta) { ta.focus(); ta.setSelectionRange(0, NAME_SLOT.length); }
  }, [desc]);

  const toggleShape = useCallback((s: (typeof SHAPES)[number]) => {
    const isOn = picked.has(s.id);
    const justAddedName = !isOn && !desc.trim();
    setPicked((prev) => {
      const next = new Set(prev);
      if (isOn) next.delete(s.id);
      else next.add(s.id);
      return next;
    });
    setDesc((d) => (isOn ? removeSentence(d, s.text) : appendSentence(d, s.text)));
    if (justAddedName) selectSlotRef.current = true;
    setAddedName(null);
  }, [picked, desc]);

  useEffect(() => {
    if (genOpen && braindumps.length === 0 && projectId) {
      loadBraindumps(projectId).then((r) => setBraindumps(r.braindumps || [])).catch(() => {});
    }
  }, [genOpen, projectId, braindumps.length]);

  const handleInlineGenerate = useCallback(
    async ({ focus, added }: { focus: string[]; all: string[]; added: string[] }) => {
      const { name, description } = splitNameDesc(desc);
      const parts: string[] = [];
      if (description) parts.push(description);
      if (focus.length) parts.push('Ideas to weave in:\n' + focus.map((i) => `- ${i}`).join('\n'));
      const full = parts.join('\n\n');
      if (!full) return;
      await addCharacter(projectId, { name, description: full });
      if (added.length && projectId) {
        await Promise.allSettled(added.map((body) => addBraindump(projectId, { body })));
      }
      setDesc('');
      setPicked(new Set());
      setBraindumps([]);
      setAddedName(name);
    },
    [projectId, desc],
  );

  const onDelete = useCallback(
    async (characterId: number | string) => {
      await deleteCharacter(projectId, characterId);
      queryClient.invalidateQueries({ queryKey: qk.characters(projectId) });
      // 10-second "Deleted — Undo" instead of a confirm(): the delete is soft.
      deletedWithUndo(async () => {
        try {
          await undeleteCharacter(projectId, characterId);
          queryClient.invalidateQueries({ queryKey: qk.characters(projectId) });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('undo delete character failed:', err);
        }
      });
    },
    [projectId, queryClient],
  );

  // Edit happens inline on the studio page now (the modal is gone), so the card
  // pencil just opens the character there — same destination as opening a card.
  const openPerson = useCallback(
    (character: any) => {
      navigate(`/project/${projectId}/characters/${character.id}`);
    },
    [projectId, navigate],
  );
  const openEdit = openPerson;

  const { protagonist, main, supporting } = useMemo(
    () => partitionByTier(cast.characters),
    [cast.characters],
  );

  const heroProtagonist = protagonist[0];
  const displayedMain = useMemo(
    () => [...protagonist.slice(1), ...main],
    [protagonist, main],
  );

  const totalNamed = cast.characters.length;
  const counts = {
    protagonist: heroProtagonist ? 1 : 0,
    main: displayedMain.length,
    supporting: supporting.length,
  };

  const show = {
    protagonist: (tier === 'all' || tier === 'protagonist') && !!heroProtagonist,
    main: (tier === 'all' || tier === 'main') && displayedMain.length > 0,
    supporting: (tier === 'all' || tier === 'supporting') && supporting.length > 0,
  };

  // Number the tier headings over whatever sections actually show, so the page
  // always reads i. → ii. → iii. in order (e.g. a cast with no protagonist
  // starts at "i. Main" rather than a dangling "ii.").
  const ROMAN = ['i.', 'ii.', 'iii.'];
  const num: Record<string, string> = {};
  let n = 0;
  for (const t of ['protagonist', 'main', 'supporting'] as const) {
    if (show[t]) num[t] = ROMAN[n++];
  }

  // ── Margin gutter entries, synthesized from the shown sections ──
  // Each section becomes a <MarginBlock> whose gutter is a small label,
  // reusing WorldSectionEntry. The first shown section id drives the
  // overlay anchor + which block carries `gutterAnchorRef`.
  const SECTION_META: Record<string, { label: string; sub: string; icon: React.ReactNode; count?: number }> = {
    spotted: { label: 'Spotted by AI', sub: 'suggested characters', icon: <Brain size={17} strokeWidth={1.8} /> },
    protagonist: { label: 'Protagonist', sub: 'who the story follows', icon: <Crown size={17} strokeWidth={1.8} />, count: counts.protagonist },
    main: { label: 'Main', sub: 'the central cast', icon: <Star size={17} strokeWidth={1.8} />, count: counts.main },
    supporting: { label: 'Supporting', sub: 'the wider world', icon: <Users size={17} strokeWidth={1.8} />, count: counts.supporting },
    create: { label: 'Create', sub: 'add to your cast', icon: <Plus size={17} strokeWidth={1.8} /> },
  };
  const shownSections = [
    'spotted',
    ...(show.protagonist ? ['protagonist'] : []),
    ...(show.main ? ['main'] : []),
    ...(show.supporting ? ['supporting'] : []),
    'create',
  ];
  const sectionEntry = (t: string, onClick?: () => void) => {
    const m = SECTION_META[t];
    const labelText = m.count !== undefined ? `${m.label} · ${m.count}` : m.label;
    return <WorldSectionEntry icon={m.icon} label={labelText} sub={m.sub} onClick={onClick} />;
  };
  const overlayItems: MarginItem[] = shownSections.map((t) => ({
    id: t,
    render: (s) => sectionEntry(t, s),
  }));

  const empty = totalNamed === 0;

  if (status !== 'ready') {
    return (
      <div className="wv2-init-page">
        <LoadState status={status} what="your characters" onRetry={() => castQuery.refetch()} />
      </div>
    );
  }

  // First touch — no cast yet. Render the init on the shared full-bleed init
  // stage. Init pages carry no right rail — just the centred takeover.
  if (empty) {
    return (
      <div className="wv2-init-page">
        <div className="wv2-init-stage">
          <PeopleInit projectId={projectId} onCreate={onCreateByHand} onGenerate={onGenerate} />
        </div>
      </div>
    );
  }

  // The first shown section block carries the overlay anchor on its gutter.
  const anchorSection = shownSections[0];
  const sectionGutter = (t: string) =>
    t === anchorSection ? <div ref={gutterAnchorRef}>{sectionEntry(t)}</div> : sectionEntry(t);

  return (
    <PageShell
      header={
        <CastPageHeader
          totalNamed={totalNamed}
          onAddClick={focusAddForm}
          onGenerateClick={focusDescribe}
        />
      }
      overlay={<MarginOverlay items={overlayItems} anchorRef={gutterAnchorRef} />}
    >
      {/* tier-filter strip — plain child, auto-aligned to the body column */}
      <CastTierStrip
        totalNamed={totalNamed}
        counts={counts}
        activeTier={tier}
        onTierChange={setTier}
      />

      <MarginBlock id="spotted" gutter={sectionGutter('spotted')}>
        <DraftCharacterCandidates
          projectId={projectId}
          onAddNew={focusDescribe}
          onInvent={focusDescribe}
        />
      </MarginBlock>

      {show.protagonist && (
        <MarginBlock id="protagonist" gutter={sectionGutter('protagonist')}>
          <ProtagonistSpread
            character={heroProtagonist}
            num={num.protagonist}
            onEdit={openEdit}
            onOpen={openPerson}
            onDelete={onDelete}
          />
        </MarginBlock>
      )}
      {show.main && (
        <MarginBlock id="main" gutter={sectionGutter('main')}>
          <MainGrid
            characters={displayedMain}
            num={num.main}
            onEdit={openEdit}
            onOpen={openPerson}
            onDelete={onDelete}
          />
        </MarginBlock>
      )}
      {show.supporting && (
        <MarginBlock id="supporting" gutter={sectionGutter('supporting')}>
          <SupportingList
            characters={supporting}
            num={num.supporting}
            onEdit={openEdit}
            onOpen={openPerson}
            onDelete={onDelete}
          />
        </MarginBlock>
      )}

      <MarginBlock id="create" gutter={sectionGutter('create')}>
        <div className="wv2-init-seam">
          <span className="wv2-init-seam-lbl">Describe one in a line</span>
          <span className="wv2-init-seam-ln" />
        </div>

        <div className="pi-describe" ref={describeRef}>
          <textarea
            ref={taRef}
            className="pi-dtext"
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setAddedName(null); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={'their name, then a line — "Mara, a retired diver who\'s afraid of the sea now"…'}
            rows={2}
            aria-label="describe a person"
          />
          <div className="pi-dfoot">
            <div className="pi-seeds">
              <span className="pi-seeds-lbl">try —</span>
              {SEEDS.map((s) => (
                <button key={s} type="button" className="pi-seed" onClick={() => { setDesc(s); setAddedName(null); taRef.current?.focus(); }}>{s}</button>
              ))}
            </div>
            <button
              type="button"
              ref={genBtnRef}
              className="pi-generate"
              onClick={() => setGenOpen((v) => !v)}
            >
              Create
            </button>
          </div>
          {addedName !== null && (
            <div className="pi-gennote">Added {addedName ? `${addedName} ` : ''}to your cast — open them to fill in the rest.</div>
          )}
          {showShapes && (
            <div className="pi-shapes-wrap">
              <div className="pi-shapes-lead">borrow a shape — tap one; we leave their name blank for you</div>
              <div className="pi-shapes">
                {SHAPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`pi-shape ${picked.has(s.id) ? 'is-on' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggleShape(s)}
                    aria-pressed={picked.has(s.id)}
                  >
                    <span className="pi-shape-i">{s.icon}</span>
                    <span className="pi-shape-l">
                      {s.text}
                      <span className="pi-shape-k">{s.kicker}</span>
                    </span>
                    <span className="pi-shape-tick" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" /></svg>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <GenerateIdeasPopover
          open={genOpen}
          onClose={() => setGenOpen(false)}
          anchorRef={genBtnRef}
          braindumps={braindumps}
          ai={false}
          title="Add a character"
          hint="Ticked ideas are added to their description as notes — untick any to leave out, or jot a new one."
          generateLabel="Add to cast"
          busyLabel="Adding…"
          addPlaceholder="add an idea…"
          saveNote="New ideas are saved to your braindumps."
          extraReady={!!desc.trim()}
          onGenerate={handleInlineGenerate}
        />

        <div className="wv2-init-seam" ref={addByHandRef}>
          <span className="wv2-init-seam-lbl">Or add by hand</span>
          <span className="wv2-init-seam-ln" />
        </div>

        <ProfileForm
          fields={INLINE_PROFILE_FIELDS}
          tabLabel="New character"
          badge={`No. ${String(totalNamed + 1).padStart(3, '0')}`}
          note="Placeholders are only a suggestion — overwrite every line."
          submitLabel="Add to cast"
          busyLabel="Adding…"
          onSave={onCreateByHand}
        />
      </MarginBlock>
    </PageShell>
  );
}
