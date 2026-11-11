import { create } from 'zustand';
import { restoreStashedProse } from './unsavedStash';
import type { ChapterDocScene, EntityLink, WriteChapter, WriteData, WriteScene, TipTapDoc } from './data';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface WriteState {
  data: WriteData;
  contentById: Record<number, TipTapDoc>;
  /** When the author last changed each scene's prose here (ms). A server read
   * that left before this is older than the screen and must not land. */
  editedAtById: Record<string, number>;
  dirtySceneIds: Set<number>;
  saveStatusById: Record<number, SaveStatus>;
  hoveredEntityKey: string | null;

  setData: (data: WriteData) => void;
  mergeServerOutline: (server: WriteData) => void;
  initContent: (contentById: Record<number, TipTapDoc>) => void;
  applyChapterDocs: (scenes: ChapterDocScene[], fetchedAt: number) => void;
  updateChapter: (id: any, patch: Partial<WriteChapter>) => void;
  updateScene: (sceneId: any, patch: Record<string, any>) => void;
  setSceneLinks: (sceneId: any, links: EntityLink[]) => void;
  addScene: (chapterId: any, scene: any) => void;
  setSceneContent: (sceneId: number, doc: TipTapDoc) => void;
  applyRestoredContent: (sceneId: number, doc: TipTapDoc, words?: number) => void;
  setSaveStatus: (sceneId: number, status: SaveStatus) => void;
  clearDirty: (sceneId: number) => void;
  setHoveredEntityKey: (key: string | null) => void;
  chaptersFocusMode: boolean;
  /** The scene the Write page treats as current: the last one the author
   * scrolled to or focused (`?sc`). Night Eyes sends it as "this scene". */
  activeSceneId: string | null;
  setActiveSceneId: (id: string | number | null) => void;
  setChaptersFocusMode: (mode: boolean | ((prev: boolean) => boolean)) => void;
}

export const useWriteStore = create<WriteState>((set, get) => ({
  data: { chapters: [], totalWords: 0 },
  contentById: {},
  editedAtById: {},
  dirtySceneIds: new Set(),
  saveStatusById: {},
  hoveredEntityKey: null,
  chaptersFocusMode: false,
  activeSceneId: null,

  setActiveSceneId: (id) => set({ activeSceneId: id == null || id === '' ? null : String(id) }),

  setChaptersFocusMode: (mode) =>
    set((s) => ({
      chaptersFocusMode: typeof mode === 'function' ? mode(s.chaptersFocusMode) : mode,
    })),

  setData: (data) => set({ data }),

  // Re-sync structure (titles, word counts, scene/chapter shape) from a fresh
  // server fetch WITHOUT touching contentById / dirty state — used when the
  // `outline` domain is invalidated (e.g. a scene save that auto-generated a
  // title). Any scene with unsaved edits is kept from the current store so a
  // background refetch never clobbers in-flight prose or a title being typed;
  // every other scene takes the server copy (which carries the new title).
  mergeServerOutline: (server) =>
    set((s) => {
      const dirty = s.dirtySceneIds;
      // Refresh CONTENT for every non-dirty scene from the server too, not just
      // structure. The editor reads `contentById[id] ?? scene.content`, and
      // contentById is seeded for all scenes at mount — so without this an AI
      // prose write (or another tab's edit) lands in `data` but the stale
      // mount-time contentById keeps winning and never reaches the editor (e.g.
      // a freshly-inserted 'ai-generated' green block would never show). Dirty
      // scenes keep their in-flight prose.
      const nextContent: Record<number, TipTapDoc> = { ...s.contentById };
      for (const ch of server.chapters)
        for (const sc of ch.scenes)
          if (!dirty.has(sc.id as any) && sc.content)
            nextContent[sc.id as any] = sc.content as TipTapDoc;

      if (!dirty.size) return { data: server, contentById: nextContent };

      const cur = new Map<any, WriteScene>();
      for (const ch of s.data.chapters)
        for (const sc of ch.scenes) cur.set(sc.id, sc);
      const chapters = server.chapters.map((ch) => ({
        ...ch,
        scenes: ch.scenes.map((sc) =>
          dirty.has(sc.id as any) ? (cur.get(sc.id) ?? sc) : sc,
        ),
      }));
      const totalWords = chapters.reduce(
        (t, ch) => t + ch.scenes.reduce((a, sc) => a + (sc.words || 0), 0),
        0,
      );
      return { data: { chapters, totalWords }, contentById: nextContent };
    }),

  // Prose stashed by a dead-session redirect (see unsavedStash.ts) is laid back
  // over the server copy and marked dirty so it saves again.
  // Matched against the project's scenes (set by setData just before), since
  // contentById only holds scenes the editor has touched.
  initContent: (contentById) => {
    const sceneIds = get().data.chapters.flatMap((c) => c.scenes.map((sc) => String(sc.id)));
    const { merged, restored } = restoreStashedProse(contentById, sceneIds);
    set({ contentById: merged, dirtySceneIds: restored, saveStatusById: {}, editedAtById: {} });
  },

  // One chapter's prose from the server (get_chapter_docs) → contentById. A
  // scene keeps what's on screen when the author has unsaved edits in it, or
  // edited it after this read left (an older answer landing late). A scene with
  // nothing loaded yet always takes the server copy.
  applyChapterDocs: (scenes, fetchedAt) =>
    set((s) => {
      let next: Record<number, TipTapDoc> | null = null;
      for (const sc of scenes) {
        const id = sc.id as any;
        const have = s.contentById[id];
        if (have !== undefined) {
          if (s.dirtySceneIds.has(id)) continue;
          if ((s.editedAtById[String(id)] ?? 0) >= fetchedAt) continue;
        }
        const doc = (sc.content ?? { type: 'doc', content: [] }) as TipTapDoc;
        if (have !== undefined && JSON.stringify(have) === JSON.stringify(doc)) continue;
        (next ??= { ...s.contentById })[id] = doc;
      }
      return next ? { contentById: next } : {};
    }),

  updateChapter: (id, patch) =>
    set((s) => ({
      data: {
        ...s.data,
        chapters: s.data.chapters.map((ch) =>
          ch.id === id ? { ...ch, ...patch } : ch,
        ),
      },
    })),

  updateScene: (sceneId, patch) =>
    set((s) => ({
      data: {
        ...s.data,
        chapters: s.data.chapters.map((ch) => ({
          ...ch,
          scenes: ch.scenes.map((sc) =>
            sc.id === sceneId ? { ...sc, ...patch } : sc,
          ),
        })),
      },
      dirtySceneIds: new Set(s.dirtySceneIds).add(sceneId),
    })),

  // Scene links are saved by their own op (sceneLinks.ts), so this must NOT mark
  // the scene dirty: that would fire a prose save for a scene whose prose may
  // not be loaded yet (the T133 prose-zeroing path).
  setSceneLinks: (sceneId, links) =>
    set((s) => ({
      data: {
        ...s.data,
        chapters: s.data.chapters.map((ch) => ({
          ...ch,
          scenes: ch.scenes.map((sc) =>
            sc.id === sceneId ? { ...sc, entity_links: links } : sc,
          ),
        })),
      },
    })),

  setSceneContent: (sceneId, doc) => {
    const prev = get().contentById[sceneId];
    const isRealEdit =
      prev !== undefined && JSON.stringify(prev) !== JSON.stringify(doc);
    set((s) => ({
      contentById: { ...s.contentById, [sceneId]: doc },
      dirtySceneIds: isRealEdit
        ? new Set(s.dirtySceneIds).add(sceneId)
        : s.dirtySceneIds,
      editedAtById: isRealEdit
        ? { ...s.editedAtById, [String(sceneId)]: Date.now() }
        : s.editedAtById,
    }));
  },

  // A history restore already saved this text on the server: show it as clean
  // (no dirty flag, so a pending autosave timer finds nothing to send).
  applyRestoredContent: (sceneId, doc, words) =>
    set((s) => {
      const dirty = new Set(s.dirtySceneIds);
      dirty.delete(sceneId);
      const data =
        words === undefined
          ? s.data
          : {
              ...s.data,
              chapters: s.data.chapters.map((ch) => ({
                ...ch,
                scenes: ch.scenes.map((sc) =>
                  String(sc.id) === String(sceneId) ? { ...sc, content: doc, words } : sc,
                ),
              })),
            };
      return {
        data,
        contentById: { ...s.contentById, [sceneId]: doc },
        dirtySceneIds: dirty,
        editedAtById: { ...s.editedAtById, [String(sceneId)]: Date.now() },
      };
    }),

  setSaveStatus: (sceneId, status) =>
    set((s) => ({
      saveStatusById: { ...s.saveStatusById, [sceneId]: status },
    })),

  clearDirty: (sceneId) =>
    set((s) => {
      const next = new Set(s.dirtySceneIds);
      next.delete(sceneId);
      return { dirtySceneIds: next };
    }),

  setHoveredEntityKey: (hoveredEntityKey) => set({ hoveredEntityKey }),

  addScene: (chapterId, scene) =>
    set((s) => ({
      data: {
        ...s.data,
        chapters: s.data.chapters.map((ch) =>
          ch.id === chapterId
            ? {
                ...ch,
                status: ch.status === 'empty' ? ('planned' as const) : ch.status,
                scenes: [...ch.scenes, scene],
              }
            : ch,
        ),
      },
    })),
}));
