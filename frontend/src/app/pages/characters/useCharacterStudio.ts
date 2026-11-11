import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queries, qk } from '../../queries';
import { useChatStore } from '../../modules/chat/useChatStore';
import { EMPTY_THREADS, deleteThread, updatePlotThread } from '../threads/data';
import { useCharacterFields } from './components/useCharacterFields';
import { loadStatus } from '../../lib/loadStatus';
import { useBeatProposalRefetch } from '../../modules/threadList/useBeatProposalRefetch';
import type { StudioStep } from './components/StudioStepper';

const norm = (s: any) => String(s ?? '').trim().toLowerCase();

/** Does this scene record any mention of anyone? Either an @mention the backend
 *  counted on save (`mention_counts`, any entity type) or a hit from the optional
 *  noun resolver (`analysis.resolve_nouns`). */
function sceneHasMentions(sc: any): boolean {
  const counted = Object.values(sc?.mention_counts ?? {}).some((perId: any) =>
    Object.values(perId ?? {}).some((n) => Number(n) > 0));
  const rn = sc?.analysis?.resolve_nouns;
  return counted || (!!rn && ((rn.mentions?.length || 0) + (rn.resolved?.length || 0)) > 0);
}

/**
 * useCharacterStudio — every bit of the Character Studio page's data and state:
 * the four queries, derived flags, Night Eyes seeds, thread handlers, section
 * open/collapse, scroll-spy, and proposal dots. Crucially ALL hooks run here
 * unconditionally, so the component can do a single `if (!character)` early
 * return with no hooks after it. Pure extraction — behaviour is unchanged.
 */
export function useCharacterStudio(projectId: string | undefined, characterId: string | undefined) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const castQuery = useQuery({
    ...queries.characters(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const { data, refetch: retryCast } = castQuery;
  const character = data?.characters?.find((c: any) => String(c.id) === characterId);
  // Until the cast has loaded, a missing character means nothing: the page shows
  // a spinner (or "Couldn't load" + Retry), never "Character not found" (SA-131).
  const castStatus = loadStatus(castQuery);

  // The character's plot threads (lifted: Outline selects, Lenses attach gauges).
  const { data: threadData = EMPTY_THREADS } = useQuery({
    ...queries.plotThreads(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  // Refetch threads when Night Eyes proposes/edits a beat, so the green overlay
  // shows live. Lives here (always mounted) not in <ThreadsList>, which the
  // collapsible Outline section unmounts when closed.
  useBeatProposalRefetch(projectId);
  const charThreads = useMemo(
    () => (threadData.threads || []).filter(
      (t: any) => t?.scope?.type === 'character' && norm(t.scope?.name) === norm(character?.name),
    ),
    [threadData, character?.name],
  );

  // Grand outline — drives the "any chapter present?" smart default-open (and is
  // the same cached query StudioPresence reads, so no extra fetch).
  const { data: outline, isFetched: outlineFetched } = useQuery({
    ...queries.outline(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const hasChapters = useMemo(
    () => (outline?.acts || []).some((a: any) => (a?.chapters || []).length > 0),
    [outline],
  );
  // Does the grand outline already hold any beats? Once it does, the first-time
  // "weave" teaching box gives way to the bare "Merge into one outline" button
  // (the same one the Plot-threads page shows in the ThreadsList head).
  const outlineHasBeats = useMemo(
    () =>
      (outline?.acts || []).some((a: any) =>
        (a?.chapters || []).some((ch: any) =>
          (ch?.scenes || []).some((sc: any) => (sc?.beats || []).length > 0),
        ),
      ),
    [outline],
  );
  // Project lifecycle status — drives the smart default-open's Outline-vs-Presence
  // choice: Writing/Editing → Presence, Planning → Outline.
  const { data: projectMeta, isFetched: metaFetched } = useQuery({
    ...queries.projectMeta(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const status: string = norm(projectMeta?.status) || 'imagine';
  // Any recorded mention of anyone across the manuscript? Drives the Presence
  // section: until at least one scene records a mention (an @mention or a
  // resolver hit — see sceneHasMentions), the teaching card stays in place of
  // the (empty) mention bar-graph.
  const hasAnyMention = useMemo(() => {
    for (const a of outline?.acts || [])
      for (const ch of a?.chapters || [])
        for (const sc of ch?.scenes || []) if (sceneHasMentions(sc)) return true;
    return false;
  }, [outline]);

  /* ---- Night Eyes (scoped per-section ask) ---- */
  const setSeed = useChatStore((s) => s.setSeed);
  const openChat = useChatStore((s) => s.open);
  const ask = useCallback((sectionKey: string) => {
    const who = character?.name || 'this character';
    const SEEDS: Record<string, string> = {
      essence: `Help me sharpen ${who}'s essence — who they are in one breath.`,
      appearance: `Help me flesh out ${who}'s appearance from the attached ideas.`,
      world: `Help me develop ${who}'s world — where they live and the object that carries their story.`,
      backstory: `Help me write ${who}'s backstory — what happened before page one.`,
      relationships: `Help me map ${who}'s relationships — who matters to them, and how.`,
      arc: `Help me develop ${who}'s arc — their want, need, misbelief and plot points.`,
      internal: `Help me sharpen ${who}'s internal arc — want, need, and misbelief.`,
      external: `Help me develop the external plot points that force ${who}'s story.`,
      outline: `Help me flesh out the plot threads for ${who}.`,
      voice: `Help me pin down how ${who} sounds — their voice and the line only they could say.`,
      lenses: `Help me pick analysis lenses for ${who} — what's worth watching across their threads and prose?`,
      invent: `Invent a custom plot-thread scaffold for ${who} from their arc — their wants, needs and misbeliefs should shape the beats.`,
    };
    setSeed(SEEDS[sectionKey] ?? `Help me develop ${who}.`);
    openChat();
  }, [character?.name, setSeed, openChat]);

  /* ---- global show/hide for the attached idea phrases ---- */
  const [showIdeas, setShowIdeas] = useState(true);

  /* ---- "Draft scaffolds" picker modal (Arc CTA) ---- */
  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const [scaffoldFocus, setScaffoldFocus] = useState<'invent' | undefined>(undefined);
  const openScaffolds = useCallback((focus?: 'invent') => { setScaffoldFocus(focus); setScaffoldOpen(true); }, []);
  const closeScaffold = useCallback(() => { setScaffoldOpen(false); setScaffoldFocus(undefined); }, []);

  /* ---- section expand/collapse. All sections start collapsed; a smart default
   *      (see the init effect below) opens the FIRST one that needs attention once
   *      the character + outline have loaded. A stepper-tab click opens that one
   *      section (without collapsing the others). ---- */
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  /* ---- per-thread rename / delete (the block's top-right menu) — same ops the
   *      legacy thread box uses; refetch the threads query on success. ---- */
  const handleRenameThread = useCallback(async (id: string, name: string) => {
    const n = (name || '').trim();
    if (!n) return;
    try {
      await updatePlotThread(projectId, id, { name: n });
      queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
    } catch (err) { console.error('[studio] rename thread failed:', err); }
  }, [projectId, queryClient]);
  const handleDeleteThread = useCallback(async (id: string) => {
    if (!confirm('Delete this storyline?')) return;
    try {
      await deleteThread(projectId, id);
      queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
    } catch (err) { console.error('[studio] delete thread failed:', err); }
  }, [projectId, queryClient]);

  const toggleSection = useCallback(
    (id: string) => setOpenSections((p) => ({ ...p, [id]: !p[id] })),
    [],
  );

  /* ---- scroll-spy + jump ----
   * Since the PageShell migration (2026-06-27) the page no longer owns its own
   * scroll element (the old `.cst2-scroll`). PageShell renders inside the app's
   * `.wv2-content`, which IS the scroll container — so scroll-spy and `jump`
   * resolve that element (the same default MarginOverlay uses). One scroll
   * context, no nesting. */
  const getScroller = () => document.querySelector('.wv2-content') as HTMLElement | null;
  const gutterAnchorRef = useRef<HTMLDivElement>(null);
  const refs = {
    identity: useRef<HTMLElement | null>(null),
    outline: useRef<HTMLElement | null>(null),
    voice: useRef<HTMLElement | null>(null),
    lenses: useRef<HTMLElement | null>(null),
  };
  const setSectionRef = useCallback(
    (id: string) => (el: any) => { (refs as any)[id].current = el; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [current, setCurrent] = useState('identity');

  const jump = useCallback((id: string) => {
    // a tab click expands that section (only that one) and scrolls to it
    setOpenSections((p) => ({ ...p, [id]: true }));
    // wait a tick so a just-expanded section has its real height before scrolling
    setTimeout(() => {
      const el = (refs as any)[id]?.current as HTMLElement | null;
      const cont = getScroller();
      if (el && cont) {
        // el.offsetTop is relative to the offsetParent, not the scroller — use the
        // measured delta between the element and the scroller's viewport top.
        const top = cont.scrollTop + el.getBoundingClientRect().top - cont.getBoundingClientRect().top - 12;
        cont.scrollTo({ top, behavior: 'smooth' });
      }
    }, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cont = getScroller();
    if (!cont) return;
    const onScroll = () => {
      // a section is "current" once its top has scrolled above 100px below the
      // scroller's viewport top — measured via rects (offsetTop is relative to the
      // offsetParent, not the scroller, so it's not comparable after PageShell).
      const contTop = cont.getBoundingClientRect().top;
      let cur = 'identity';
      (['identity', 'outline', 'voice', 'lenses'] as const).forEach((id) => {
        const el = refs[id].current as HTMLElement | null;
        if (el && el.getBoundingClientRect().top - contTop <= 100) cur = id;
      });
      setCurrent(cur);
    };
    cont.addEventListener('scroll', onScroll);
    onScroll();
    return () => cont.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id, openSections]);

  /* ---- smart default-open: once the character (and project status) have loaded,
   *      open the FIRST section that needs attention:
   *        essence empty → Identity (now also holds the arc) ·
   *        then by project lifecycle — Writing/Editing → Presence, Planning → Outline
   *        (so in planning, Outline is the last thing to open).
   *      Runs once per character; a manual toggle afterwards is never overridden. ---- */
  const initedOpenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!character || initedOpenFor.current === characterId) return;
    const descFilled = !!String(character?.description ?? '').trim();
    let def: string;
    if (!descFilled) def = 'identity';
    else {
      if (!metaFetched) return;  // need project status before choosing Outline vs Presence
      def = status === 'write' ? 'voice' : 'outline';
    }
    setOpenSections({ [def]: true });
    initedOpenFor.current = characterId ?? null;
  }, [character, characterId, metaFetched, status]);

  const back = useCallback(() => navigate(`/project/${projectId}/characters`), [navigate, projectId]);
  const onWriteChapters = useCallback(() => navigate(`/project/${projectId}/chapters`), [navigate, projectId]);

  /* ---- proposal dots (shared cached query — no extra network call) ---- */
  const { hasAnyProposal } = useCharacterFields(projectId, character);
  // Identity now also holds the arc → its dot reflects arc-field proposals too.
  const identityHasProposal = hasAnyProposal(['description', 'appearance', 'want', 'need', 'misbelief', 'story']);
  const voiceHasProposal = hasAnyProposal(['voice']);

  /* ---- stepper status ---- */
  const descFilled = !!String(character?.description ?? '').trim();
  const coreFilled = ['want', 'need', 'misbelief'].filter((k) => String(character?.[k] ?? '').trim()).length;
  const voiceSet = !!String(character?.voice_profile?.tone ?? '').trim();
  const arcReady = coreFilled >= 1 && !!String(character?.story ?? '').trim();
  const steps: StudioStep[] = [
    { id: 'identity', label: 'Identity', done: descFilled, status: descFilled ? `essence · ${coreFilled}/3 arc` : 'start here' },
    { id: 'outline', label: 'Outline', done: charThreads.length > 0, status: `${charThreads.length} thread${charThreads.length === 1 ? '' : 's'}` },
    { id: 'voice', label: 'Presence', done: voiceSet, status: voiceSet ? 'set' : 'not started' },
  ];

  const siblings = (data?.characters ?? []).filter((c: any) => String(c.id) !== characterId);

  // The Outline "weave" teaching box shows once there are ≥2 threads AND the
  // grand outline is still empty — it's first-time teaching. Once the
  // outline has beats, the bare merge button (ThreadsList head) replaces it.
  const teachShowing = charThreads.length >= 2 && !outlineHasBeats;

  /* ---- scaffold modal callbacks ---- */
  const onScaffoldCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
    queryClient.invalidateQueries({ queryKey: qk.characters(projectId) });
    closeScaffold();
    jump('outline');
  }, [queryClient, projectId, closeScaffold, jump]);
  const onScaffoldSketchArc = useCallback(() => { closeScaffold(); jump('identity'); }, [closeScaffold, jump]);

  return {
    // identity / data
    character,
    castStatus,
    retryCast,
    siblings,
    charThreads,
    outlineFetched,
    hasChapters,
    hasAnyMention,
    // derived flags
    descFilled,
    coreFilled,
    voiceSet,
    arcReady,
    identityHasProposal,
    voiceHasProposal,
    steps,
    teachShowing,
    // ui state
    showIdeas,
    setShowIdeas,
    openSections,
    toggleSection,
    scaffoldOpen,
    scaffoldFocus,
    // refs / scroll
    gutterAnchorRef,
    setSectionRef,
    current,
    jump,
    // handlers
    ask,
    handleRenameThread,
    handleDeleteThread,
    openScaffolds,
    closeScaffold,
    onScaffoldCreated,
    onScaffoldSketchArc,
    back,
    onWriteChapters,
  };
}
