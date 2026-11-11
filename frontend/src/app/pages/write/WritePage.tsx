import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import './write.css';
// The braindumps-present second init reuses OutlineScaffoldPickerLight's `.ol-start*`
// styling, which lives in the outline page's stylesheet.
import '../outline/outline.css';
import { loadWriteData } from './data';
import { callOp } from '../../gateway';
import { useWriteStore } from './writeStore';
import { useWriteSelection } from './useWriteSelection';
import { useWriteSave } from './useWriteSave';
import { useWriteEntities } from './useWriteEntities';
import { useScenePipelines } from './useScenePipelines';
import { useChapterDocs, sceneDoc } from './useChapterDocs';
import type { MentionItemInput } from '../../components/DraftingCanvas/useMentionExtension';
import { SceneBlock } from './components/SceneBlock';
import { MarginaliaPanel } from './components/MarginaliaPanel';
import { ChapterPovControl } from './components/ChapterPovControl';
import { SaveFailureBanner } from './components/SaveFailureBanner';
import { ChaptersStart } from './components/ChaptersStart';
import { LoadError } from '../../components/LoadError';
import { OutlineScaffoldPickerLight } from '../outline/components/OutlineScaffoldPickerLight';
import { initGrandOutline } from '../outline/data';
import { subscribeInvalidation } from '../../queryInvalidator';
import { addSceneOrUndo, renameOrUndo } from './undoFromServer';

export function WritePage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  // Active chapter / focused scene live entirely in the URL (?chap=<id>&sc=<id>)
  // — the rail, scene clicks and prev/next all just navigate. No `chap` → fall
  // back to the first chapter; no `sc` → no scene focused. The rail reads the
  // same params, so the two stay in lockstep with nothing to ping-pong.
  const { chap, sc, select } = useWriteSelection();
  const data = useWriteStore((s) => s.data);
  const contentById = useWriteStore((s) => s.contentById);
  const saveStatusById = useWriteStore((s) => s.saveStatusById);
  const dirtySceneIds = useWriteStore((s) => s.dirtySceneIds);
  const setData = useWriteStore((s) => s.setData);
  const mergeServerOutline = useWriteStore((s) => s.mergeServerOutline);
  const initContent = useWriteStore((s) => s.initContent);
  const updateChapter = useWriteStore((s) => s.updateChapter);
  const updateScene = useWriteStore((s) => s.updateScene);
  const setSceneContent = useWriteStore((s) => s.setSceneContent);
  const storeAddScene = useWriteStore((s) => s.addScene);

  const [showMarginalia, _setShowMarginalia] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped after a dive-in seeds the blank outline, to re-fetch the now-existing
  // first chapter and drop straight into the manuscript.
  const [reloadKey, setReloadKey] = useState(0);
  const divingRef = useRef(false);

  const { characters, braindumps, worldbuildings, loaded: entitiesLoaded, failed: entitiesFailed } =
    useWriteEntities(projectId, reloadKey);
  const { pipelines, toggle: togglePipeline, anyEnabled } =
    useScenePipelines(projectId);
  const { saveScene, saveAllDirty, hasUnsavedChanges } = useWriteSave(
    projectId,
    anyEnabled,
  );

  const mentionItems: MentionItemInput[] = useMemo(() => {
    const items: MentionItemInput[] = [];
    characters.forEach((c: any) =>
      items.push({ id: c.id, label: c.name, entityType: 'character' }),
    );
    braindumps.forEach((b: any) =>
      items.push({ id: b.id, label: b.title, entityType: 'braindump' }),
    );
    worldbuildings.forEach((w: any) =>
      items.push({ id: w.id, label: w.title, entityType: 'worldbuilding' }),
    );
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
      setLoaded(true);
    }).catch(() => {
      if (alive) setLoadFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [projectId, reloadKey, setData, initContent]);

  // Stay live with the `outline` domain: a scene save that auto-generates a
  // title, an edit in the chapter rail, chat, or another tab all invalidate it.
  // We refetch and MERGE (preserving scenes with unsaved edits), so the title
  // shows up immediately without clobbering in-flight prose — the same staleness
  // loop the chapter rail (useOutlineModel) rides.
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const unsub = subscribeInvalidation('outline', (pid) => {
      if (String(pid) !== String(projectId)) return;
      loadWriteData(projectId).then((result) => {
        if (alive) mergeServerOutline(result.data);
      }).catch(() => {}); // keep what's on screen; the next invalidation retries
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [projectId, mergeServerOutline]);

  const activeChapter = useMemo(
    () => (chap == null ? null : data.chapters.find((ch) => String(ch.id) === chap) ?? null),
    [data.chapters, chap],
  );
  const activeChapterId: any = activeChapter?.id ?? null;
  const chapterDocs = useChapterDocs(projectId, activeChapterId);

  // No scene focused unless `sc` names one inside the active chapter.
  const focusedScene = useMemo(() => {
    if (!activeChapter || sc == null) return null;
    return activeChapter.scenes.find((s) => String(s.id) === sc) ?? null;
  }, [activeChapter, sc]);
  const focusedSceneId = focusedScene?.id ?? null;

  const focusedSceneIndex = useMemo(() => {
    if (!activeChapter || !focusedScene) return -1;
    return activeChapter.scenes.findIndex((s) => s.id === focusedScene.id);
  }, [activeChapter, focusedScene]);

  // Normalise selection from the URL: no/invalid `chap` → first chapter; a valid
  // chapter with no/invalid `sc` → its first scene (a chapter with zero scenes
  // simply stays scene-less).
  useEffect(() => {
    if (!loaded || !data.chapters.length) return;
    const chapter =
      chap != null ? data.chapters.find((c) => String(c.id) === chap) : null;
    if (!chapter) {
      const first = data.chapters[0];
      select(first.id, first.scenes[0]?.id ?? null);
      return;
    }
    const sceneValid = sc != null && chapter.scenes.some((s) => String(s.id) === sc);
    if (!sceneValid && chapter.scenes.length) {
      select(chapter.id, chapter.scenes[0].id);
    }
  }, [loaded, data.chapters, chap, sc, select]);

  const handleAddScene = useCallback(() => {
    if (!projectId || !activeChapterId) return;
    const id = `sc-${Math.random().toString(36).slice(2, 10)}`;
    storeAddScene(activeChapterId, {
      id,
      text: '',
      content: { type: 'doc', content: [] },
      words: 0,
      status: 'sketch',
      entity_links: [],
      marginalia: [],
      analysis: {},
    });
    // Pass the client id so the persisted scene keeps the same id the store
    // optimistically created — otherwise an `outline` refetch would surface a
    // server-generated id and duplicate the row. (Mirrors useOutlineModel.add.)
    addSceneOrUndo(projectId, String(activeChapterId), id);
    select(activeChapterId, id);
  }, [projectId, activeChapterId, storeAddScene, select]);

  const handleFocusScene = useCallback(
    (index: number) => {
      if (!activeChapter) return;
      const scene = activeChapter.scenes[index];
      if (scene) select(activeChapter.id, scene.id);
    },
    [activeChapter, select],
  );

  const handleTogglePipeline = useCallback(
    async (key: string, enabled: boolean) => {
      await togglePipeline(key, enabled);
      // Turning one on → analyse the focused scene right away so results appear
      // without waiting for the next save. analyze_scene runs only enabled ones.
      if (enabled && projectId && focusedSceneId != null) {
        callOp(projectId, 'analyze_scene', {
          scene_id: String(focusedSceneId),
        }).catch(() => {}); // not optimistic: nothing on screen to undo
      }
    },
    [togglePipeline, projectId, focusedSceneId],
  );

  const _statusLabel = activeChapter
    ? activeChapter.status === 'drafted'
      ? 'drafted'
      : activeChapter.status === 'drafting'
        ? 'drafting'
        : ''
    : '';

  const _statusCls =
    activeChapter?.status === 'drafted'
      ? 'wr-stat-drafted'
      : '';

  const _sceneWords = focusedScene?.words ?? 0;
  const chapterWords = activeChapter
    ? activeChapter.scenes.reduce((s, sc) => s + sc.words, 0)
    : 0;

  // Seed the grand outline from any scaffold choice (blank act, a preset shape,
  // or custom acts), then re-fetch so the now-existing first chapter renders and
  // the author lands in the draft. This is the exact wiring the grand outline
  // page uses (`OutlineScaffoldPickerLight` → `onInit` → `initGrandOutline`).
  const handleScaffoldInit = useCallback(
    async (args: { base_template?: string; acts?: string[] }) => {
      if (!projectId || divingRef.current) return;
      divingRef.current = true;
      try {
        await initGrandOutline(projectId, args);
      } finally {
        divingRef.current = false;
        setReloadKey((k) => k + 1);
      }
    },
    [projectId],
  );

  // "Dive in the prose" — the blank-book fork's write path: one act "Story" + one
  // empty chapter (the OutlineScaffoldPickerLight `startBlank` wiring).
  const handleDiveIn = useCallback(
    () => handleScaffoldInit({ acts: ['Story'] }),
    [handleScaffoldInit],
  );

  // "Brain dump & plan" — head over to the braindumps page to gather material.
  const handleBrainDump = useCallback(() => {
    if (!projectId) return;
    navigate(`/project/${projectId}/braindumps`);
  }, [projectId, navigate]);

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

  // No first chapter to route to → an init landing. We wait for both the write
  // data and the entities to load so we pick the right one without a flash:
  //  · no braindumps yet → the blank-book fork (write now, or go braindump).
  //  · braindumps present → a lighter grand-outline start, so the author turns
  //    the material they already have into a frame to write into. Same shapes,
  //    spines and wiring as the grand outline page, just trimmed.
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

  const failedScenes = data.chapters.flatMap((ch) =>
    ch.scenes.filter((s) => saveStatusById[s.id] === 'error'),
  );

  return (
    <div className={`wr-page${showMarginalia ? '' : ' marginalia-off'}`}>
      <div className="wr-manuscript">
        <SaveFailureBanner
          sceneNames={failedScenes.map((s) => s.text || 'Untitled scene')}
          onRetry={() => failedScenes.forEach((s) => void saveScene(s.id))}
        />
        <div className="wr-ms-scroll">
          {activeChapter ? (
            <>
              <header className="wr-chap-head">
                <div className="wr-chap-head-lhs">
                  <div className="wr-eyebrow">
                    <PenLine size={16} strokeWidth={1.5} className="wv2-page-icon" />
                    <span className="wr-eyebrow-subtle">Chapter {activeChapter.number}</span>
                  </div>
                  <input
                    className="wr-chap-title"
                    value={activeChapter.text ?? ''}
                    placeholder="untitled"
                    spellCheck={false}
                    onChange={(e) => {
                      updateChapter(activeChapterId!, {
                        text: e.target.value || null,
                      });
                    }}
                    onBlur={(e) => {
                      if (!projectId || !activeChapterId) return;
                      renameOrUndo(projectId, 'chapter', String(activeChapterId), e.target.value);
                    }}
                  />
                  {activeChapter && projectId && (
                    <ChapterPovControl
                      projectId={projectId}
                      chapterId={activeChapterId}
                      pov={activeChapter.pov ?? null}
                      characters={characters}
                      onLocalUpdate={(pov) => updateChapter(activeChapterId!, { pov })}
                    />
                  )}
                </div>
                <div className="wr-chap-head-rhs">
                  <div className="wr-chap-meta">
                    <span>
                      <b>{activeChapter.scenes.length}</b>{' '}
                      scene{activeChapter.scenes.length !== 1 ? 's' : ''}
                    </span>
                    <span className="wr-dotpip" />
                    <span>
                      <b>{chapterWords.toLocaleString()}</b> words
                    </span>
                  </div>
                  <div className="wr-chap-nav">
                    <button
                      className="wv2-btn wv2-btn-ghost wv2-btn-sm"
                      title="Previous chapter"
                      onClick={() => {
                        const idx = data.chapters.findIndex(
                          (c) => c.id === activeChapterId,
                        );
                        if (idx > 0) select(data.chapters[idx - 1].id, null);
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15 6l-6 6 6 6" />
                      </svg>
                    </button>
                    <button
                      className="wv2-btn wv2-btn-ghost wv2-btn-sm"
                      title="Next chapter"
                      onClick={() => {
                        const idx = data.chapters.findIndex(
                          (c) => c.id === activeChapterId,
                        );
                        if (idx < data.chapters.length - 1)
                          select(data.chapters[idx + 1].id, null);
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </header>

              {chapterDocs.failed ? (
                <LoadError what="this chapter's prose" onRetry={chapterDocs.retry} />
              ) : activeChapter.scenes.length === 0 ? (
                <div className="wr-chap-empty">
                  <div className="wr-chap-empty-gl">¶</div>
                  <h3>A blank chapter, waiting.</h3>
                  <p>
                    Drop the first scene here and the reader will start tracking
                    what changes across the book.
                  </p>
                  <button
                    className="wv2-btn wv2-btn-primary"
                    type="button"
                    onClick={handleAddScene}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    start the first scene
                  </button>
                </div>
              ) : (
                <div className="wr-scenes">
                  {activeChapter.scenes.map((scene, i) => sceneDoc(contentById, scene) === undefined ? (
                    // Prose not loaded yet (it comes per chapter): no editor until it is.
                    <p key={scene.id} className="py-4" aria-busy="true">Loading this scene…</p>
                  ) : (
                    <SceneBlock
                      key={scene.id}
                      projectId={projectId}
                      scene={scene}
                      index={i}
                      chapterNumber={activeChapter.number}
                      isFocused={scene.id === focusedSceneId}
                      content={sceneDoc(contentById, scene)}
                      saveStatus={saveStatusById[scene.id] ?? 'idle'}
                      isDirty={dirtySceneIds.has(scene.id as any)}
                      onFocus={() => select(activeChapter.id, scene.id)}
                      onContentChange={(doc) => setSceneContent(scene.id, doc)}
                      onTitleChange={(t) =>
                        updateScene(scene.id, { text: t })
                      }
                      onTitleBlur={(t) => {
                        if (!projectId) return;
                        renameOrUndo(projectId, 'scene', String(scene.id), t);
                      }}
                      onSave={() => saveScene(scene.id)}
                      onFocusPrev={
                        i > 0 ? () => handleFocusScene(i - 1) : undefined
                      }
                      onFocusNext={
                        i < activeChapter.scenes.length - 1
                          ? () => handleFocusScene(i + 1)
                          : undefined
                      }
                      mentionItems={mentionItems}
                      braindumps={braindumps}
                      worldbuildings={worldbuildings}
                    />
                  ))}
                  <div style={{
                    backgroundImage: 'repeating-linear-gradient(to right, var(--line-3) 0, var(--line-3) 3px, transparent 3px, transparent 6px)',
                    backgroundSize: '100% 1.5px',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    WebkitMaskImage: 'linear-gradient(to right, transparent, #000)',
                    maskImage: 'linear-gradient(to right, transparent, #000)',
                    height: '1px',
                    width: '100%',
                  }}>
                  </div>
                  <button
                    className="wr-add-scene"
                    type="button"
                    onClick={handleAddScene}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    add a scene 
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="wr-chap-empty">
              <div className="wr-chap-empty-gl">¶</div>
              <h3>No chapters yet.</h3>
              <p>Add your first chapter from the sidebar.</p>
            </div>
          )}
        </div>

        <div className="wr-foot">
          <div className="wr-foot-right">
            {hasUnsavedChanges && (
              <button
                className="wv2-btn wv2-btn-ghost wv2-btn-sm"
                type="button"
                onClick={saveAllDirty}
              >
                Save all
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Marginalia is the write page's own in-page panel — it renders its own
          `.wr-ctx` column (a sibling of the manuscript), so it sits directly in
          the editor layout. The universal suggestions rail is intentionally NOT
          mounted on the focused editor (the manuscript needs the width;
          proposals still surface via the global toast). */}
      {showMarginalia && (
        <MarginaliaPanel
          focusedScene={focusedScene}
          sceneIndex={focusedSceneIndex}
          sceneContent={
            focusedScene
              ? contentById[focusedScene.id] ?? focusedScene.content ?? null
              : null
          }
          projectId={projectId}
          characters={characters}
          braindumps={braindumps}
          worldbuildings={worldbuildings}
          pipelines={pipelines}
          onTogglePipeline={handleTogglePipeline}
        />
      )}
    </div>
  );
}
