import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addBraindump,
  annotateBraindump,
  deleteBraindump,
  undeleteBraindump,
  updateBraindump,
  tmpId,
} from './data';
import { deletedWithUndo } from '../../modules/receipt/receiptStore';
import { qk, queries } from '../../queries';
import { BraindumpsHead } from './components/BraindumpsHead';
import { BraindumpsFilterBar } from './components/BraindumpsFilterBar';
import { ideaColorOf, stripIdeaColor } from './components/colorIdea';
import { EntityTagProvider, useEntityTagIndex } from './components/entityTags';
import { StreamView } from './components/StreamView';
import { ChatInput } from './components/ChatInput';
import { BraindumpsInit } from './components/BraindumpsInit';
import { SpineShell, useSpineWidth } from './components/SpineShell';
import { LoadError } from '../../components/LoadError';
import { braindumpsCopy } from '../../../config/braindumps';
import { ideaDraftKey } from './useIdeaDraft';

export function BraindumpsPage() {
  const { projectId } = useParams();
  // Filter lives in the URL (?filter=) so the idea-tree second rail can steer
  // the stream — branch click → ?filter=tag:<x> / ?filter=untagged — without a
  // shared store. The in-page filter bar writes the same param.
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get('filter') || 'all';
  // Focus steering from the idea-tree rail: ?focus=<ideaId>&fp=<phrase> scrolls
  // that idea into view, pulses it, and highlights the phrase inside its body.
  const focusId = searchParams.get('focus') || '';
  const focusPhrase = searchParams.get('fp') || '';
  const setFilter = useCallback(
    (next: string) => {
      const sp = new URLSearchParams(searchParams);
      if (next && next !== 'all') sp.set('filter', next);
      else sp.delete('filter');
      setSearchParams(sp, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const [query, setQuery] = useState('');
  const [paneOpen, setPaneOpen] = useState(false);
  const spine = useSpineWidth();

  // D31 / counts-staleness refactor — braindumps now live in TanStack Query
  // (was local `useState` + a manual load effect). The cache IS the source of
  // truth: every mutation writes the cache optimistically via `setQueryData`,
  // and the shell's count for this domain is derived from this same cache
  // (no more stale snapshot). The queryKey is the staleness domain name so the
  // invalidator (queryInvalidator.ts) refetches us on any `braindumps`-domain
  // write from chat / cron / another tab. See COUNTS_STALENESS_REFACTOR.md.
  const queryClient = useQueryClient();
  const bdKey = useMemo(() => qk.braindumps(projectId), [projectId]);
  const bdQuery = useQuery({
    ...queries.braindumps(projectId),
    enabled: !!projectId,
    staleTime: 60_000, // refetch is driven by invalidations, not polling
  });
  const { data: items = [], isLoading } = bdQuery;
  // The first load failed (nothing cached): show "Couldn't load", never the
  // first-run surface (SA-132).
  const loadFailed = bdQuery.isError && bdQuery.data === undefined;

  // keepInit pins the init surface for the duration of the first dump session.
  // We can't derive it from items.length (the first Enter makes items > 0 mid-
  // session and would yank the surface away), so we snapshot the decision ONCE
  // when the initial load finishes: empty project → stay in init until the user
  // clicks "open the notebook"; project with existing dumps → straight to view.
  // `null` = undecided (still loading). A ref guards against re-seeding when the
  // cache later changes (an add must NOT flip keepInit off — only "open the
  // notebook" does that).
  const [keepInit, setKeepInit] = useState<boolean | null>(null);
  const keepInitSeeded = useRef(false);
  // Re-arm the one-shot seed on project switch (refs persist across param change).
  useEffect(() => {
    keepInitSeeded.current = false;
    setKeepInit(null);
  }, [projectId]);
  useEffect(() => {
    if (keepInitSeeded.current || isLoading || loadFailed) return;
    keepInitSeeded.current = true;
    setKeepInit(items.length === 0);
  }, [isLoading, loadFailed, items.length]);

  // ---- mutations (add + edit) ----
  // All optimistic: write the cache immediately via setQueryData, call the
  // backend, on failure roll back. Drag-reorder is cache-only (not persisted).
  // Prior-value reads use getQueryData (a PURE read) — NEVER a side-effect
  // inside a setQueryData updater (StrictMode double-invokes updaters in dev,
  // which is what made multi-delete flaky in the old local-state version).

  // Cache writer — the setQueryData equivalent of the old `setItems`. Every
  // mutation funnels writes through here so the optimistic update and the
  // derived count both come from this one cache line.
  const writeItems = useCallback(
    (updater: (prev: any[]) => any[]) =>
      queryClient.setQueryData(bdKey, (prev: any[] = []) => updater(prev ?? [])),
    [queryClient, bdKey],
  );

  // Run the AI annotator on a saved idea and swap its tags + ai_data in. The
  // card shimmers ("reading…") meanwhile. Both failure kinds end the same way:
  // the idea shows "couldn't tag" with a Try again (SA-158) — whether the AI
  // failed inside a 200 (ai_data.status "failed") or the request itself threw.
  const runAnnotation = useCallback(
    async (id) => {
      writeItems((prev) => prev.map((it) => (it.id === id ? { ...it, tagging: true } : it)));
      try {
        const annotated = await annotateBraindump(projectId, id);
        writeItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...annotated, tagging: false } : it)));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('annotate braindump failed:', err);
        writeItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, tagging: false, aiData: { ...it.aiData, status: 'failed' } } : it,
          ),
        );
      }
    },
    [projectId, writeItems],
  );

  const onAddBraindump = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return false;
      const id = tmpId();
      const optimistic = {
        id,
        body: trimmed,
        tags: [],
        pinned: false,
        // Tagging starts as soon as the save lands — show it from the first frame (wrt-117).
        tagging: true,
      };
      writeItems((prev) => [optimistic, ...prev]);
      try {
        const created = await addBraindump(projectId, { body: trimmed });
        writeItems((prev) => prev.map((it) => (it.id === id ? { ...created, tagging: true } : it)));
        // Tag it in the background; the add itself is done.
        void runAnnotation(created.id);
        return true;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('add braindump failed:', err);
        writeItems((prev) => prev.filter((it) => it.id !== id));
        return false;
      }
    },
    [projectId, writeItems, runAnnotation],
  );

  // Save an edited idea's text (StreamView's autosave calls this; SA-134).
  // Typing already wrote the text into the cache, so there is nothing to
  // compare against or roll back: the caller only asks when the author changed
  // it. On failure the typed text stays on screen (the gateway shows the problem
  // toast) and the autosave retries on the next blur / keystroke. Editing never
  // re-runs the AI tagging — re-tag only when the author asks.
  const onEditBody = useCallback(
    async (id, nextBody: string) => {
      const trimmed = nextBody.trim();
      if (!trimmed) return false;
      // Skip the round-trip on optimistic / temp rows (the add is still in flight).
      if (String(id).startsWith('tmp-')) return false;
      try {
        const updated = await updateBraindump(projectId, id, { body: trimmed });
        // Keep the on-screen body: the author may have typed more since this was sent.
        writeItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...updated, body: it.body } : it)));
        return true;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('edit braindump failed:', err);
        return false;
      }
    },
    [projectId, writeItems],
  );

  // Re-tag an edited idea (wrt-28): save the text on screen first, so the AI
  // reads the new words and not a save still in flight, then re-run tagging.
  // The backend swaps the old AI tags for new ones; hand-added tags stay.
  const onRetag = useCallback(
    async (id) => {
      const cur = (queryClient.getQueryData(bdKey) as any[] | undefined) ?? [];
      const body = cur.find((it) => it.id === id)?.body;
      if (body === undefined || !(await onEditBody(id, body))) return;
      await runAnnotation(id);
    },
    [queryClient, bdKey, onEditBody, runAnnotation],
  );

  const onTogglePin = useCallback(
    async (id) => {
      if (String(id).startsWith('tmp-')) return;
      const cur = (queryClient.getQueryData(bdKey) as any[] | undefined) ?? [];
      const target = cur.find((it) => it.id === id);
      if (!target) return;
      const prevPinned = !!target.pinned;
      const nextPinned = !prevPinned;
      writeItems((prev) => prev.map((it) => (it.id === id ? { ...it, pinned: nextPinned } : it)));
      try {
        await updateBraindump(projectId, id, { pinned: nextPinned });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('toggle pin failed:', err);
        writeItems((prev) => prev.map((it) => (it.id === id ? { ...it, pinned: prevPinned } : it)));
      }
    },
    [projectId, writeItems, queryClient, bdKey],
  );

  const onDeleteBraindump = useCallback(
    async (id) => {
      // Read prior position FIRST (pure read) so failure can restore in place,
      // then write the optimistic removal. No side-effects inside the updater.
      const cur = (queryClient.getQueryData(bdKey) as any[] | undefined) ?? [];
      const removedIdx = cur.findIndex((it) => it.id === id);
      if (removedIdx === -1) return;
      const removed = cur[removedIdx];
      writeItems((prev) => prev.filter((it) => it.id !== id));
      // Temp / optimistic rows never persisted — nothing to delete server-side.
      if (String(id).startsWith('tmp-')) return;
      try {
        await deleteBraindump(projectId, id);
        // 10-second "Deleted — Undo": the delete is soft, so Undo restores
        // the idea server-side and puts it back where it was.
        deletedWithUndo(async () => {
          try {
            const restored = await undeleteBraindump(projectId, id);
            writeItems((prev) => {
              if (prev.some((it) => it.id === id)) return prev;
              const next = [...prev];
              next.splice(Math.min(removedIdx, next.length), 0, { ...removed, ...restored });
              return next;
            });
            // The list may have changed since the delete; refetch for the true order.
            queryClient.invalidateQueries({ queryKey: bdKey });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('undo delete braindump failed:', err);
          }
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('delete braindump failed:', err);
        writeItems((prev) => {
          const next = [...prev];
          next.splice(Math.max(0, removedIdx), 0, removed);
          return next;
        });
      }
    },
    [projectId, writeItems, queryClient, bdKey],
  );

  const onEditTags = useCallback(
    async (id, newTags: string[]) => {
      if (String(id).startsWith('tmp-')) return;
      const cur = (queryClient.getQueryData(bdKey) as any[] | undefined) ?? [];
      const prevTags = cur.find((it) => it.id === id)?.tags;
      if (prevTags === undefined) return;
      writeItems((prev) => prev.map((it) => (it.id === id ? { ...it, tags: newTags } : it)));
      try {
        const updated = await updateBraindump(projectId, id, { tags: newTags });
        writeItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...updated } : it)));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('edit tags failed:', err);
        writeItems((prev) => prev.map((it) => (it.id === id ? { ...it, tags: prevTags } : it)));
      }
    },
    [projectId, writeItems, queryClient, bdKey],
  );

  // The live tag vocabulary (static craft categories merged with real project
  // entities). Built once here so the group filter predicate and all three tag
  // surfaces (picker / TagRow / filter bar) share one resolver.
  const tagIndex = useEntityTagIndex(projectId);

  // Visible list — the page filter bar's chip (pinned / group:<k> / tag:<x>) AND
  // the UI-only search query, applied over the live items. Data is unchanged.
  const visible = useMemo(() => {
    let list = items;
    if (filter === 'pinned') {
      list = list.filter((i) => i.pinned || String(i.id).startsWith('tmp-'));
    } else if (filter === 'untagged') {
      list = list.filter((i) => stripIdeaColor(i.tags).length === 0 || String(i.id).startsWith('tmp-'));
    } else if (filter.startsWith('group:')) {
      const key = filter.slice(6);
      list = list.filter((i) => (i.tags || []).some((t: string) => tagIndex.groupOf(t) === key) || String(i.id).startsWith('tmp-'));
    } else if (filter.startsWith('tag:')) {
      const t = filter.slice(4);
      list = list.filter((i) => (i.tags || []).includes(t) || String(i.id).startsWith('tmp-'));
    } else if (filter.startsWith('color:')) {
      const c = filter.slice(6);
      list = list.filter((i) => ideaColorOf(i.tags) === c || String(i.id).startsWith('tmp-'));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => String(i.body || '').toLowerCase().includes(q) || String(i.id).startsWith('tmp-'));
    }
    return list;
  }, [items, filter, query, tagIndex]);

  useEffect(() => {
    if (!focusId) return;
    const t = window.setTimeout(() => {
      const sel = (window as any).CSS?.escape ? CSS.escape(focusId) : focusId;
      const el = document.querySelector(`[data-bd-id="${sel}"]`) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusId, focusPhrase, visible]);

  // First touch — a project with no braindumps gets the brain-dump init
  // surface, which owns the whole content area. Unlike the old behaviour, the
  // init persists across additions during this session: the user dumps a pile,
  // sees it stack in front of them, and only leaves by clicking "open the
  // notebook" (which flips keepInit off). A project that already had dumps on
  // load skips init entirely (decided once in the load effect above).
  // Until the initial load resolves (keepInit still undecided) we don't know if
  // init applies — render nothing rather than briefly flashing the wrong view.
  if (loadFailed) return <LoadError what="your braindumps" onRetry={() => bdQuery.refetch()} />;
  if (keepInit === null) return null;
  if (keepInit) {
    return (
      <div className="wv2-init-page">
        <BraindumpsInit
          onSubmit={onAddBraindump}
          onDone={() => setKeepInit(false)}
          draftKey={ideaDraftKey(projectId)}
        />
      </div>
    );
  }

  const lw = paneOpen ? `${spine.w}px` : '50px';

  return (
    <EntityTagProvider value={tagIndex}>
      <div
        className="absolute inset-0 grid grid-rows-1 grid-cols-[var(--lw)_1fr] overflow-hidden transition-all duration-300"
        style={{ '--lw': lw } as any}
      >
        <SpineShell
          projectId={projectId!}
          items={items}
          paneOpen={paneOpen}
          onToggle={() => setPaneOpen((v) => !v)}
          onResizeStart={spine.startDrag}
        />
        <div className="flex flex-col h-full min-w-0 relative w-full pt-7 px-7 pb-0 col-start-2 box-border">
          <div className="w-full max-w-[var(--read-max,1200px)] pl-0 md:pl-[100px] mx-auto flex flex-col h-full min-h-0 box-border">
            <div className="w-full flex flex-col box-border gap-6 h-full min-h-0">
              <BraindumpsHead />
              <BraindumpsFilterBar
                items={items}
                query={query}
                onQueryChange={setQuery}
                active={filter}
                onFilterChange={setFilter}
              />
              <div className="flex-1 min-h-0 overflow-y-auto pb-6 flex flex-col">
                <ChatInput
                  placeholder={braindumpsCopy.composerPlaceholder}
                  onSubmit={onAddBraindump}
                  variant="composer"
                  draftKey={ideaDraftKey(projectId)}
                />
                <StreamView
                  allItems={items}
                  visibleItems={visible}
                  writeItems={writeItems}
                  onEditBody={onEditBody}
                  onTogglePin={onTogglePin}
                  onAddBraindump={onAddBraindump}
                  onEditTags={onEditTags}
                  onDelete={onDeleteBraindump}
                  onRetryAnnotate={runAnnotation}
                  onRetag={onRetag}
                  focusId={focusId}
                  focusPhrase={focusPhrase}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </EntityTagProvider>
  );
}
