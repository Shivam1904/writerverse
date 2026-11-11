import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, PanelRight } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import './chaptersV2.css';
import '../../../modules/margin/margin.css';
import '../../outline/outline.css';
import '../write.css';
import { Button } from '../../../ui';
import { PageHeader } from '../../../components/PageHeader';
import { loadWriteData } from '../data';
import { useWriteStore } from '../writeStore';
import { useWriteSelection } from '../useWriteSelection';
import { useCurrentSceneId } from '../currentScene';
import { useWriteSave } from '../useWriteSave';
import { useWriteEntities } from '../useWriteEntities';
import { initGrandOutline } from '../../outline/data';
import { subscribeInvalidation } from '../../../queryInvalidator';
import { addSceneOrUndo, renameOrUndo } from '../undoFromServer';
import { ChaptersStart } from '../components/ChaptersStart';
import { LoadError } from '../../../components/LoadError';
import { SaveFailureBanner } from '../components/SaveFailureBanner';
import { OutlineScaffoldPickerLight } from '../../outline/components/OutlineScaffoldPickerLight';
import { ManuscriptV2 } from './ManuscriptV2';
import { StoryRail } from './StoryRail';
import { DrawerV2 } from './DrawerV2';
import { useChapterBeats } from './useChapterBeats';
import { useChapterDocs } from '../useChapterDocs';
import type { MentionItemInput } from '../../../components/DraftingCanvas/useMentionExtension';
import type { OutlineActNode } from '../data';

export function ChaptersV2Page() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { chap, sc, select } = useWriteSelection();

  const data = useWriteStore((s) => s.data);
  const contentById = useWriteStore((s) => s.contentById);
  const saveStatusById = useWriteStore((s) => s.saveStatusById);
  const dirtySceneIds = useWriteStore((s) => s.dirtySceneIds);
  const setData = useWriteStore((s) => s.setData);
  const mergeServerOutline = useWriteStore((s) => s.mergeServerOutline);
  const initContent = useWriteStore((s) => s.initContent);
  const updateChapter = useWriteStore((s) => s.updateChapter);
  const setSceneContent = useWriteStore((s) => s.setSceneContent);
  const storeAddScene = useWriteStore((s) => s.addScene);

  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [acts, setActs] = useState<OutlineActNode[]>([]);
  const divingRef = useRef(false);
  // The editor's own scroll element — drives active-scene tracking (the manuscript
  // scrolls internally inside its fixed-height workspace, not in `.wv2-content`).
  const paperRef = useRef<HTMLDivElement>(null);

  const focus = useWriteStore((s) => s.chaptersFocusMode);
  const setFocus = useWriteStore((s) => s.setChaptersFocusMode);
  const [drawerOpen, setDrawerOpen] = useState(() => localStorage.getItem('cv2:drawer') !== 'closed');
  const [drawerMode, setDrawerMode] = useState<'plan' | 'analysis'>(() => (localStorage.getItem('cv2:drawerMode') === 'analysis' ? 'analysis' : 'plan'));
  // Scroll-driven — which scene block is in view (not the URL ?sc focus).
  // Lives in the write store so Night Eyes can send it as "this scene".
  const setActiveSceneId = useWriteStore((s) => s.setActiveSceneId);
  // The current scene (shared rule with Night Eyes): drives the margin.
  const currentSceneId = useCurrentSceneId();
  // Leaving the Write page: no scene is current any more.
  useEffect(() => () => setActiveSceneId(null), [setActiveSceneId]);

  const { characters, braindumps, worldbuildings, loaded: entitiesLoaded, failed: entitiesFailed } =
    useWriteEntities(projectId, reloadKey);
  const { saveScene } = useWriteSave(projectId);
  const { beatStates, cycleBeat, colorFor, threads } = useChapterBeats(projectId, acts);

  const mentionItems: MentionItemInput[] = useMemo(() => {
    const items: MentionItemInput[] = [];
    characters.forEach((c: any) => items.push({ id: c.id, label: c.name, entityType: 'character' }));
    braindumps.forEach((b: any) => items.push({ id: b.id, label: b.title, entityType: 'braindump' }));
    worldbuildings.forEach((w: any) => items.push({ id: w.id, label: w.title, entityType: 'worldbuilding' }));
    return items;
  }, [characters, braindumps, worldbuildings]);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setLoadFailed(false);
    loadWriteData(projectId).then((result) => {
      if (!alive) return;
      setData(result.data);
      initContent(result.contentById);
      setActs(result.acts);
      setLoaded(true);
    }).catch(() => {
      if (alive) setLoadFailed(true);
    });
    return () => { alive = false; };
  }, [projectId, reloadKey, setData, initContent]);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const unsub = subscribeInvalidation('outline', (pid) => {
      if (String(pid) !== String(projectId)) return;
      loadWriteData(projectId).then((result) => {
        if (!alive) return;
        mergeServerOutline(result.data);
        setActs(result.acts);
      }).catch(() => {}); // keep what's on screen; the next invalidation retries
    });
    return () => { alive = false; unsub(); };
  }, [projectId, mergeServerOutline]);

  const activeChapter = useMemo(
    () => (chap == null ? null : data.chapters.find((ch) => String(ch.id) === chap) ?? null),
    [data.chapters, chap],
  );
  const activeChapterId: any = activeChapter?.id ?? null;
  const chapterDocs = useChapterDocs(projectId, activeChapterId);

  const focusedScene = useMemo(() => {
    if (!activeChapter || sc == null) return null;
    return activeChapter.scenes.find((s) => String(s.id) === sc) ?? null;
  }, [activeChapter, sc]);
  const focusedSceneId = focusedScene?.id ?? null;

  // Normalise URL after load: missing/invalid chap → first chapter
  useEffect(() => {
    if (!loaded || !data.chapters.length) return;
    const chapter = chap != null ? data.chapters.find((c) => String(c.id) === chap) : null;
    if (!chapter) {
      const first = data.chapters[0];
      select(first.id, first.scenes[0]?.id ?? null);
      return;
    }
    const sceneValid = sc != null && chapter.scenes.some((s) => String(s.id) === sc);
    if (!sceneValid && chapter.scenes.length) select(chapter.id, chapter.scenes[0].id);
  }, [loaded, data.chapters, chap, sc, select]);

  // Seed activeSceneId from the URL param so the scene margin is expanded on
  // first render before the user has scrolled at all. Scroll tracking takes over
  // from there — the two coexist because scroll always wins on subsequent events.
  useEffect(() => {
    if (sc != null) setActiveSceneId(sc);
  }, [sc]);

  // Scroll → activeSceneId: last [data-scene] block whose top edge has scrolled
  // past the 60px threshold. The editor owns its own scroll (.wmock-paper-wrap,
  // `paperRef`), so the tracker listens there. Re-binds when the chapter changes.
  useEffect(() => {
    const wrap = paperRef.current;
    if (!wrap) return;
    let raf: number | null = null;
    const compute = () => {
      const sections = wrap.querySelectorAll<HTMLElement>('[data-scene]');
      const wrapTop = wrap.getBoundingClientRect().top;
      let best: string | null = null;
      sections.forEach((el) => {
        if (el.getBoundingClientRect().top - wrapTop <= 60)
          best = el.getAttribute('data-scene');
      });
      if (best == null && sections.length > 0)
        best = sections[0].getAttribute('data-scene');
      setActiveSceneId(best);
      raf = null;
    };
    const onScroll = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(compute);
    };
    wrap.addEventListener('scroll', onScroll, { passive: true });
    compute();
    return () => {
      wrap.removeEventListener('scroll', onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [activeChapterId]);

  const handleAddScene = useCallback(() => {
    if (!projectId || !activeChapterId) return;
    const id = `sc-${Math.random().toString(36).slice(2, 10)}`;
    storeAddScene(activeChapterId, {
      id, text: '', content: { type: 'doc', content: [] }, words: 0,
      status: 'sketch', entity_links: [], marginalia: [], analysis: {}, beats: [],
    });
    addSceneOrUndo(projectId, activeChapterId, id, (r) => setActs(r.acts));
    select(activeChapterId, id);
  }, [projectId, activeChapterId, storeAddScene, select]);

  const handleFocusScene = useCallback((index: number) => {
    if (!activeChapter) return;
    const scene = activeChapter.scenes[index];
    if (scene) select(activeChapter.id, scene.id);
  }, [activeChapter, select]);

  const handleScaffoldInit = useCallback(async (args: { base_template?: string; acts?: string[] }) => {
    if (!projectId || divingRef.current) return;
    divingRef.current = true;
    try { await initGrandOutline(projectId, args); }
    finally { divingRef.current = false; setReloadKey((k) => k + 1); }
  }, [projectId]);

  const handleDiveIn = useCallback(() => handleScaffoldInit({ acts: ['Story'] }), [handleScaffoldInit]);

  const handleBrainDump = useCallback(() => {
    if (!projectId) return;
    navigate(`/project/${projectId}/braindumps`);
  }, [projectId, navigate]);

  const chapterIndex = useMemo(() => {
    if (!activeChapterId) return 0;
    const idx = data.chapters.findIndex((c) => String(c.id) === String(activeChapterId));
    return idx >= 0 ? idx : 0;
  }, [data.chapters, activeChapterId]);
  const chapterNumber = chapterIndex + 1;

  const handlePrevChapter = useCallback(() => {
    const prev = data.chapters[chapterIndex - 1];
    if (prev) select(prev.id, prev.scenes[0]?.id ?? null);
  }, [data.chapters, chapterIndex, select]);

  const handleNextChapter = useCallback(() => {
    const next = data.chapters[chapterIndex + 1];
    if (next) select(next.id, next.scenes[0]?.id ?? null);
  }, [data.chapters, chapterIndex, select]);

  // A failed load is not an empty book (SA-132): never fall through to the
  // blank-book start over the author's real manuscript. The entity lists only
  // pick the landing, so they block the page only when there are no chapters.
  if (loadFailed || (entitiesFailed && data.chapters.length === 0)) {
    return (
      <div className="wv2-init-page">
        <LoadError what="your manuscript" onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  }

  // Init pages — reuse the v1 scaffold pickers
  if (loaded && entitiesLoaded && data.chapters.length === 0) {
    if (braindumps.length > 0) {
      return (
        <div className="wv2-init-page">
          <div className="wv2-init-stage">
            <OutlineScaffoldPickerLight onInit={handleScaffoldInit} />
          </div>
        </div>
      );
    }
    return (
      <div className="wv2-init-page">
        <ChaptersStart onDiveIn={handleDiveIn} onBrainDump={handleBrainDump} />
      </div>
    );
  }

  // ── The chapter head, lifted into a standard PageHeader ──
  // The editable title keeps its exact wiring (updateChapter on change, persist
  // on blur) — it's the same <textarea> styled as the H1, now passed as the
  // header `title`. Prev/next chapter nav + the focus toggle become the header
  // `actions`. (PageHeader's `title` is typed `string`; we feed it a node under
  // this phase's loose typing.)
  const pageHeader = (null
  );

  const failedScenes = data.chapters.flatMap((ch) =>
    ch.scenes.filter((s) => saveStatusById[s.id] === 'error'),
  );

  return (
    <div className={`cm2v2${drawerOpen ? ' has-drawer' : ''}${focus ? ' is-focus' : ''}`}
    style={{ margin: 0,  backgroundColor: 'var(--canvas)'}}
    >
      {/* Row 1 — the standardized top-left header (replaces the old centered
          chapter breadcrumb). Rows 2–3 keep the editor's native 3-zone layout. */}
      <div className="wmock-header-wrap">
        {pageHeader}
      </div>

      {/* Row 2 — workspace: the editor (own scroll via .wmock-paper-wrap) and the
          Plan/Analysis drawer as a real right margin (its .wmock-drawer root gets
          the grid column + focus-hide from chaptersV2.css). */}
      <div className="wmock-workspace">
        <div className="wmock-editor">
          <SaveFailureBanner
            sceneNames={failedScenes.map((s) => s.text || 'Untitled scene')}
            onRetry={() => failedScenes.forEach((s) => void saveScene(s.id))}
          />
          <PageHeader
            section="chapters"
            eyebrow={`Write · chapter ${chapterNumber}`}
            title={(
              <textarea
                className="wr-chap-title"
                value={activeChapter?.text ?? ''}
                placeholder="untitled"
                spellCheck={false}
                rows={1}
                onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                onChange={(e) => updateChapter(activeChapterId, { text: e.target.value })}
                onBlur={(e) => {
                  if (!projectId || !activeChapterId) return;
                  renameOrUndo(projectId, 'chapter', activeChapterId, e.target.value, (r) => setActs(r.acts));
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              />
            ) as any}
            actions={(
              <>
                {chapterIndex > 0 ? (
                  <Button variant="ghost" size="icon-sm" onClick={handlePrevChapter} tooltip="Previous chapter">
                    <ChevronLeft size={14} strokeWidth={2} />
                  </Button>
                ) : null}
                {chapterIndex < data.chapters.length - 1 ? (
                  <Button variant="ghost" size="icon-sm" onClick={handleNextChapter} tooltip="Next chapter">
                    <ChevronRight size={14} strokeWidth={2} />
                  </Button>
                ) : null}
                <button
                  type="button"
                  className={`wmock-focus-mini${focus ? ' is-on' : ''}`}
                  onClick={() => setFocus((v) => !v)}
                  title={focus ? 'Exit focus' : 'Focus mode'}
                >
                  {focus ? <Minimize2 size={12} strokeWidth={1.9} /> : <Maximize2 size={12} strokeWidth={1.9} />}
                  {focus ? <span>Exit focus</span> : null}
                </button>
              </>
            )}
          />
          <div className="wmock-paper-wrap" ref={paperRef}>
            {activeChapter && chapterDocs.failed ? (
              <LoadError what="this chapter's prose" onRetry={chapterDocs.retry} />
            ) : activeChapter ? (
              <ManuscriptV2
                projectId={projectId}
                chapter={activeChapter}
                contentById={contentById}
                saveStatusById={saveStatusById}
                dirtySceneIds={dirtySceneIds}
                currentSceneId={currentSceneId}
                focusedSceneId={focusedSceneId}
                beatStates={beatStates}
                colorFor={colorFor}
                onCycleBeat={cycleBeat}
                onSelectScene={(sceneId) => select(activeChapterId, sceneId)}
                onAddScene={handleAddScene}
                mentionItems={mentionItems}
                braindumps={braindumps}
                worldbuildings={worldbuildings}
                onSceneContentChange={(sceneId, doc) => setSceneContent(sceneId, doc)}
                onSaveScene={(sceneId) => saveScene(sceneId)}
                onSceneFocus={(sceneId) => select(activeChapterId, sceneId)}
                onFocusScene={handleFocusScene}
              />
            ) : null}
          </div>
        </div>

        {!drawerOpen && !focus ? (
          <button
            className="wmock-margin-reopen"
            type="button"
            title="Open margin"
            onClick={() => { setDrawerOpen(true); localStorage.setItem('cv2:drawer', 'open'); }}
          >
            <PanelRight size={13} strokeWidth={1.9} />
          </button>
        ) : null}

        {drawerOpen ? (
          <DrawerV2
            mode={drawerMode}
            setMode={(m) => { setDrawerMode(m); localStorage.setItem('cv2:drawerMode', m); }}
            onClose={() => { setDrawerOpen(false); localStorage.setItem('cv2:drawer', 'closed'); }}
            acts={acts}
            activeChapId={activeChapterId}
            activeSc={sc}
            onSelect={select}
            beatStates={beatStates}
            onCycleBeat={cycleBeat}
            focusedScene={focusedScene}
            sceneContent={focusedSceneId != null ? (contentById[focusedSceneId] ?? focusedScene?.content ?? null) : null}
            projectId={projectId}
            characters={characters}
            braindumps={braindumps}
            worldbuildings={worldbuildings}
          />
        ) : null}
      </div>

      {/* Row 3 — StoryRail spans the full width below the editor AND the drawer
          (it excludes only Night Eyes, a separate dock outside .wv2-content). */}
      {!focus && (
        <StoryRail acts={acts} beatStates={beatStates} colorFor={colorFor} threads={threads} />
      )}
    </div>
  );
}
