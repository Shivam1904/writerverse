import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPlotThread,
  deleteThread,
  EMPTY_THREADS,
  extractUserPlot,
  generateThread,
  loadBraindumps,
  loadReadiness,
  updatePlotThread,
} from './data';
import { useOutlineModel } from '../../modules/outline/useOutlineModel';
import { addBraindump } from '../braindumps/data';
import type { NewThreadDraft } from './components/NewThreadModal';
import type { EditThreadPatch } from './components/EditThreadModal';
import { useBeatProposalRefetch } from '../../modules/threadList/useBeatProposalRefetch';
import { usePendingByCapability } from '../../modules/proposal';
import { qk, queries } from '../../queries';
import { useThreadDialog } from './threadDialog';
import { useCounts } from '../../useCounts';
import { loadStatus } from '../../lib/loadStatus';

/**
 * useThreadsPage — all of the Threads page's data plumbing: the threads query,
 * readiness, outline model, focus/expand state (driven by the `tab` query
 * param), the modal stack (new / scaffold / edit / generate), and every
 * mutation handler. The component consumes this and does nothing but lay out
 * the margin stack. Pure extraction — behaviour is unchanged.
 */
export function useThreadsPage(projectId: string | undefined) {
  const queryClient = useQueryClient();
  // Refetch threads when Night Eyes proposes/edits a beat, so the green overlay
  // shows live (the proposal is read-merged into get_thread → plotThreads).
  useBeatProposalRefetch(projectId);

  // The focused thread lives in the `tab` query param. Selecting from the
  // sidebar or clicking a card sets it; the page highlights + scrolls to it.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab');

  const setActiveThread = useCallback(
    (threadId: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (threadId) next.set('tab', threadId);
          else next.delete('tab');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [readiness, setReadiness] = useState({ braindumps: 0, characters: 0 });
  const [plotExtracting, setPlotExtracting] = useState(false);
  // "Extract from scenes" only QUEUES a proposal (run_user_wishes_rough is a
  // PROPOSE op) — nothing is extracted until the author accepts it. So read the
  // live proposal store instead of a local flag: while the proposal is pending
  // the button says "queued"; once it's accepted or rejected it frees up again.
  const plotExtractQueued = usePendingByCapability('run_user_wishes_rough').length > 0;
  // Total beats across the whole outline — gates "Extract from scenes" on the
  // start page (only worth offering once there are ≥2 beats to mine).
  const { counts } = useCounts(projectId);

  // The live grand-outline tree + edit/placement ops feed the rail's
  // <ThreadedOutline>. Shares the ['outline', pid] cache with every other
  // outline consumer, so drops/edits here stay in sync everywhere.
  const outlineModel = useOutlineModel(projectId);

  // D31 — threads data is on TanStack now. The `plot_threads` queryKey is
  // registered in `queryInvalidator.ts` under BOTH the `plot_threads` and
  // `outline` domains, so any cap that mutates either (generate_thread,
  // run_user_wishes_rough, place_thread_beat, run_merge_rough_into_grand,
  // …) auto-refetches this page — no more ref-edge-detection dance.
  const threadsQuery = useQuery({
    ...queries.plotThreads(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const { data = EMPTY_THREADS } = threadsQuery;
  // Until the threads have loaded, an empty list means nothing: the page shows a
  // spinner (or "Couldn't load" + Retry), never the first-run start (SA-132, SA-154).
  const status = loadStatus(threadsQuery);
  const retryLoad = threadsQuery.refetch;

  useEffect(() => {
    let alive = true;
    loadReadiness(projectId).then((r) => {
      if (alive) setReadiness(r);
    });
    return () => { alive = false; };
  }, [projectId]);

  const threads = data.threads as any[];
  const empty = threads.length === 0;

  // ThreadsList expand state — each thread opens independently. Default is
  // EXPANDED: every thread starts open, and any newly-loaded / newly-created
  // thread opens too (see effect below).
  const [expandedIds, setExpandedIds] = useState<string[]>(threads.map((t) => t.id));

  // Threads load async (the query is empty on first render), and new threads
  // appear over time. Auto-expand any id we haven't seen yet so the default is
  // "open" — while preserving any thread the author has explicitly collapsed.
  const seenThreadIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = threads.map((t) => t.id).filter((id) => !seenThreadIds.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => seenThreadIds.current.add(id));
    setExpandedIds((prev) => [...prev, ...fresh.filter((id) => !prev.includes(id))]);
  }, [threads]);

  // Header click toggles one thread. Opening also sets `tab` (drives the scroll +
  // the legacy card highlight); closing clears it so the deep-link effect below
  // won't immediately reopen it.
  const toggleThread = useCallback(
    (id: string) => {
      const open = expandedIds.includes(id);
      setExpandedIds(open ? expandedIds.filter((x) => x !== id) : [...expandedIds, id]);
      setActiveThread(open ? null : id);
    },
    [expandedIds, setActiveThread],
  );

  // Open a deep-linked / legacy-selected thread (`?tab=<id>`); with no tab the
  // list stays fully collapsed.
  useEffect(() => {
    if (activeTab) setExpandedIds((s) => (s.includes(activeTab) ? s : [...s, activeTab]));
  }, [activeTab]);

  // Scroll the focused thread into view when the `tab` param changes (e.g. a
  // sidebar selection). Re-clicking the already-active card keeps `tab`
  // unchanged, so this won't re-scroll. Runs once threads have rendered.
  useEffect(() => {
    if (!activeTab || !threads.length) return;
    const el =
      document.getElementById(`thr-block-${activeTab}`) ||
      document.getElementById(`thr-card-${activeTab}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeTab, threads.length]);

  // ── Modal stack ──
  const [genOpen, setGenOpen] = useState(false);
  // Idea typed into the start page's describe field, handed to the popover so it
  // opens pre-seeded. Empty for the header's plain Generate button.
  const [genSeed, setGenSeed] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  // The header "New storyline" button opens the scope→scaffold picker (the
  // enriched studio modal); the other triggers still use NewThreadModal.
  const [scaffoldNewOpen, setScaffoldNewOpen] = useState(false);
  // 'invent' focus = the Night-Eyes draft path (picker opens on its invent tab);
  // undefined = the plain scope→scaffold picker. Drives the section's "Draft
  // more threads" / "Draft more with Night Eyes" buttons.
  const [scaffoldFocus, setScaffoldFocus] = useState<'invent' | undefined>(undefined);
  const openScaffolds = useCallback((focus?: 'invent') => { setScaffoldFocus(focus); setScaffoldNewOpen(true); }, []);
  const closeScaffolds = useCallback(() => { setScaffoldNewOpen(false); setScaffoldFocus(undefined); }, []);
  // Optional scope/title the New storyline modal opens with — set when a scope
  // lane / quick-start chip launches it; cleared for the plain header buttons.
  const [threadInitial, setThreadInitial] = useState<Partial<NewThreadDraft> | undefined>(undefined);
  const [braindumps, setBraindumps] = useState<any[]>([]);

  const openNewThread = useCallback((initial?: Partial<NewThreadDraft>) => {
    setThreadInitial(initial);
    setNewOpen(true);
  }, []);

  // The suggestions-rail "Map out every subplot" initialize hint lives outside
  // this page tree (it's in the right rail), so it asks us to open the New
  // storyline modal through the threadDialog signal. Consume → open → clear.
  const openThreadSignal = useThreadDialog((s) => s.request);
  const clearThreadSignal = useThreadDialog((s) => s.clear);
  useEffect(() => {
    if (openThreadSignal == null) return;
    openNewThread();
    clearThreadSignal();
  }, [openThreadSignal, clearThreadSignal, openNewThread]);

  // Persist the new storyline via add_plot_thread (Route.WRITE), then let the
  // TanStack invalidate refetch the plot_threads query.
  const handleCreateThread = useCallback(async (draft: NewThreadDraft) => {
    setNewOpen(false);
    try {
      // Colour is auto-assigned server-side (the authoritative "our side"): every
      // new storyline gets a distinct colour, and the first thread for a given
      // character mirrors that character. See outline.store.pick_thread_color.
      await createPlotThread(projectId, draft);
      queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[new storyline] create failed:', err);
    }
  }, [projectId, queryClient]);

  // Rename a storyline (title only for now) via update_plot_thread.
  const handleRenameThread = useCallback(async (threadId: string, name: string) => {
    const next = (name || '').trim();
    if (!next) return;
    try {
      await updatePlotThread(projectId, threadId, { name: next });
      queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[rename storyline] failed:', err);
    }
  }, [projectId, queryClient]);

  const handleColorThread = useCallback(async (threadId: string, color: string) => {
    try {
      // '' clears the override → thread falls back to its derived colour.
      await updatePlotThread(projectId, threadId, { color });
      queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[colour storyline] failed:', err);
    }
  }, [projectId, queryClient]);

  // Edit-storyline dialog (rename + re-scope), opened from a thread block's
  // "Change scope" menu item via setEditingThreadId. Deriving the thread from the live list (not a snapshot) keeps it fresh if
  // the list refetches while open.
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const editingThread = useMemo(
    () => threads.find((t) => t.id === editingThreadId) ?? null,
    [threads, editingThreadId],
  );
  const handleSaveThreadEdit = useCallback(
    async (threadId: string, patch: EditThreadPatch) => {
      setEditingThreadId(null);
      try {
        await updatePlotThread(projectId, threadId, {
          name: patch.name,
          scopeType: patch.scopeType,
          scopeName: patch.scopeName,
        });
        queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[edit storyline] failed:', err);
      }
    },
    [projectId, queryClient],
  );

  useEffect(() => {
    if (genOpen && braindumps.length === 0) {
      loadBraindumps(projectId).then(setBraindumps);
    }
  }, [genOpen, projectId, braindumps.length]);

  const handleGenerate = useCallback(
    async ({ focus, all, added }: { focus: string[]; all: string[]; added: string[] }) => {
      if (!projectId) return;
      // New ideas typed into the popover are saved as real braindumps (best-effort
      // — a save failure shouldn't block the generate).
      if (added.length) {
        await Promise.allSettled(added.map((body) => addBraindump(projectId, { body })));
        queryClient.invalidateQueries({ queryKey: qk.braindumps(projectId) });
        setBraindumps([]); // re-fetch the list (it grew) next time the popover opens
      }
      // The invalidator refetches on accept (or immediately if the cap ran
      // directly). No manual reload needed.
      await generateThread(projectId, focus, all);
    },
    [projectId, queryClient],
  );

  const canExtractPlot = readiness.braindumps >= 1 && readiness.characters >= 1;

  // Extract can run as many times as the author wants — no one-shot lock, no
  // readiness gate. A soft in-flight guard only avoids double-firing one request
  // (the start screen also holds its button while a proposal awaits review).
  const handleExtractPlot = useCallback(async () => {
    if (plotExtracting) return;
    setPlotExtracting(true);
    try {
      await extractUserPlot(projectId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('extract user plot failed:', err);
    } finally {
      setPlotExtracting(false);
    }
  }, [projectId, plotExtracting]);

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      if (!confirm('Delete this storyline?')) return;
      await deleteThread(projectId, threadId);
      queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
    },
    [projectId, queryClient],
  );

  // A scaffold-created thread refetches the list and closes the picker.
  const handleScaffoldCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
    closeScaffolds();
  }, [projectId, queryClient, closeScaffolds]);

  return {
    status,
    retryLoad,
    // data
    threads,
    empty,
    counts,
    activeTab,
    outlineModel,
    canExtractPlot,
    plotExtracting,
    plotExtractQueued,
    braindumps,
    // expand / focus
    expandedIds,
    toggleThread,
    setActiveThread,
    // modals
    genOpen,
    setGenOpen,
    genSeed,
    setGenSeed,
    newOpen,
    setNewOpen,
    threadInitial,
    scaffoldNewOpen,
    setScaffoldNewOpen,
    scaffoldFocus,
    openScaffolds,
    closeScaffolds,
    editingThread,
    setEditingThreadId,
    // handlers
    openNewThread,
    handleCreateThread,
    handleRenameThread,
    handleColorThread,
    handleSaveThreadEdit,
    handleGenerate,
    handleExtractPlot,
    handleDeleteThread,
    handleScaffoldCreated,
  };
}
