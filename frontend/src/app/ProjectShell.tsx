import { Suspense, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import './app.css';
import { findItem, resolveLanding, type ShellState } from './nav';
import { useCounts } from './useCounts';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Placeholder } from './pages/Placeholder';
import { BUILT_PAGES } from './pages/registry';
import { ThemePanel } from './theme/ThemePanel';
import { ReceiptToasts } from './modules/receipt/ReceiptToasts';
import { NightEyes } from './modules/chat/NightEyes';
import { extensions } from './extensions';
import { useChatStore } from './modules/chat/useChatStore';
import { subscribeStaleness } from './stalenessStream';
import { syncPendingProposals } from './modules/chat/syncPendingProposals';
import { TooltipProvider } from './ui';
import { bindQueryClient, handleDispatchInvalidates, installInvalidatesInterceptor } from './queryInvalidator';
import { useWriteStore } from './pages/write/writeStore';
import { PageLoading } from './components/LoadError';
import { lazyNamed } from './lib/lazyNamed';

// Pages outside the section registry, lazy like the registry's (pages/registry.ts).
const CharacterStudioPage = lazyNamed(() => import('./pages/characters/CharacterStudioPage'), 'CharacterStudioPage');
const ChaptersMockupPage = lazyNamed(() => import('./pages/write/mockup/ChaptersMockupPage'), 'ChaptersMockupPage');

export default function ProjectShell() {
  const { projectId, section, characterId, sub } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Character page redesign (WIP): the parallel /studio detail route reuses this
  // shell; detect the trailing segment to render the forked CharacterStudioPage.
  const _isCharacterStudio = useLocation().pathname.endsWith('/studio');
  const [themeOpen, setThemeOpen] = useState(false);
  // When Night Eyes is docked AND open it reserves a right-edge column (rather
  // than overlaying), so the main content + proposal toast shift left to clear it.
  const docked = useChatStore((s) => s.mode === 'dock' && s.isOpen);

  // Section counts — LIVE, derived from the shared TanStack caches (useCounts),
  // not a one-shot snapshot. Drives both which rail groups appear (passed to
  // <Sidebar> via shellState) and the default landing section (`resolveLanding`).
  // `loaded` gates the default redirect so the counts-driven landing wins over
  // the fallback instead of redirecting too early. Because these are the same
  // caches the pages + right rail read, a write anywhere updates rail visibility
  // and counts together — no reload (fixes the "second rail doesn't open" bug).
  const { counts: liveCounts, loaded: countsLoaded } = useCounts(projectId);

  // D31 — wire the project-scoped query invalidator once. Every gateway call
  // and every chat-accept response forwards its `invalidates` list through
  // this bridge, so any useQuery subscribed to the matched domain auto-refetches.
  useEffect(() => {
    bindQueryClient(queryClient);
    // Tier 2 — global X-Invalidates header → TanStack, for semantic-facade calls.
    installInvalidatesInterceptor();
  }, [queryClient]);

  // Live-update stream: a write in another tab (or by chat / a background job)
  // refetches this tab's pages. Same domain→queryKey bridge the dispatch-response
  // fast path uses. Reconnects by itself; aborts on project switch.
  useEffect(() => {
    if (!projectId) return;
    const ctrl = new AbortController();
    subscribeStaleness(
      projectId,
      (domains) => handleDispatchInvalidates(projectId, domains),
      ctrl.signal,
    );
    return () => ctrl.abort();
  }, [projectId]);

  // Rehydrate any pending Proposal rows for this project on mount. Proposals
  // live in the DB across reloads (NIGHT_EYES.md § "Proposals and surface pings
  // — UI coexistence"); without this effect the three surfaces would all go
  // blank after refresh even though the backend still has the rows.
  // Night Eyes re-runs the same sync (merge-only) after every chat turn, so a
  // chat-created proposal reaches the bell without a reload.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void syncPendingProposals(projectId, { replace: true, isStale: () => cancelled });
    return () => { cancelled = true; };
  }, [projectId]);

  // Counts drive both rail group visibility and the default landing. Groups
  // reveal one stage ahead so the next tool is always discoverable: Outline
  // tools appear once there's any material; Write once an outline exists; See
  // once a chapter exists.
  const counts = liveCounts as unknown as Record<string, number>;
  const n = (k: string) => counts[k] ?? 0;
  const shellState: ShellState = {
    hasMaterial: n('braindumps') > 0 || n('threads') > 0 || n('outline') > 0 || n('chapters') > 0,
    hasOutline: n('outline') > 0 || n('chapters') > 0,
    hasChapter: n('chapters') > 0,
    counts,
  };

  const item = findItem(section);
  const isKnownSection = !!item || (!!section && !!BUILT_PAGES[section]);
  // For a bare/unknown URL, land on the highest-value next activity per the counts
  // ladder (chapters → outline → threads → braindumps). Free navigation is
  // untouched — an explicitly-clicked section still just opens.
  const defaultSection = resolveLanding(shellState);
  const active = item?.id ?? (section && BUILT_PAGES[section] ? section : defaultSection);
  const chaptersFocusMode = useWriteStore((s) => s.chaptersFocusMode);
  const isFocusMode = active === 'chapters' && chaptersFocusMode;
  const isChaptersMockup = section === 'chapters' && sub === 'mockup';

  useEffect(() => {
    // Skip the section redirect when we're on a character detail page
    // (the route has characterId but no section param).
    if (characterId) return;
    // For a bare/unknown URL we fall back to the default section — wait until
    // counts have loaded so the build-stage default (braindumps) can win over
    // chapters instead of redirecting too early.
    if (!isKnownSection && !countsLoaded) return;
    if (projectId && section !== active) {
      navigate(`/project/${projectId}/${active}`, { replace: true });
    }
  }, [projectId, section, active, navigate, characterId, isKnownSection, countsLoaded]);

  const BuiltPage = BUILT_PAGES[active];
  const activeItem = findItem(active);
  const headerLabel = activeItem?.label ?? 'Page';
  const HeaderIcon = activeItem?.icon;
  // While resolving the default landing section, hold the content blank rather
  // than briefly mounting the wrong page (e.g. chapters) before redirecting.
  const awaitingDefault = !characterId && !isKnownSection && !countsLoaded;

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <div className={`wv2-root${docked && !isFocusMode ? ' wv2-dock-open' : ''}${isFocusMode ? ' wv2-focus-mode' : ''}`}>
        {!isFocusMode && <Topbar projectId={projectId ?? ''} />}
        <div className="wv2-body">
          {!isFocusMode && (
            <Sidebar
              projectId={projectId ?? ''}
              state={shellState}
              onOpenTheme={() => setThemeOpen(true)}
            />
          )}
          <main className="wv2-main">
            <div className="wv2-content">
              <Suspense fallback={<PageLoading />}>
                {isChaptersMockup ? (
                  <ChaptersMockupPage />
                ) : characterId ? (<CharacterStudioPage />
                ) : awaitingDefault ? null : BuiltPage ? (
                  <BuiltPage />
                ) : (
                  <Placeholder title={headerLabel} icon={HeaderIcon} />
                )}
              </Suspense>
            </div>
          </main>
        </div>
        {themeOpen && <ThemePanel onClose={() => setThemeOpen(false)} />}
        {/* Pending proposals render inside the right rail's <SuggestionsRail>. */}
        {!isFocusMode && <NightEyes page={characterId ? 'character-studio' : active} />}
        <ReceiptToasts />
        {/* Extension overlays: modals, banners (app/extensions.ts) */}
        {extensions.shellOverlays?.map((Overlay, i) => <Overlay key={i} projectId={projectId} />)}
      </div>
    </TooltipProvider>
  );
}
