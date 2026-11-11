import { callOp } from '../../gateway';

export type TipTapDoc = Record<string, unknown>;

export interface MarginaliaItem {
  gid: string;
  type: 'char' | 'braindump' | 'world' | 'rule' | 'question';
  gl: string;
  kind: string;
  body: string;
  link: string;
}

export interface EntityLink {
  link_type: string;
  link_id: number;
}

// Per-scene AI analysis (scene-analysis pipelines). Loose by design — each
// pipeline owns its own key under `analysis` and the shape churns in dev.
// entity_type/entity_id are attached at commit (noun -> known entity) so a mention
// can be indexed by character id; both null when the noun matched no known entity.
export interface ResolvedMention {
  phrase: string;
  noun: string;
  entity_type?: 'character' | 'worldbuilding' | 'thread' | null;
  entity_id?: number | null;
}

export interface ResolveNounsData {
  status?: string;
  mentions?: ResolvedMention[];
  resolved?: (ResolvedMention & { pronoun: string })[];
  unresolved?: { phrase: string; pronoun: string }[];
}

export interface SceneAnalysis {
  resolve_nouns?: ResolveNounsData;
  [key: string]: any;
}

// A planning beat that lives on a scene in the grand outline. Beats are not a
// DB model — they ride inside the grand_outline JSON (scene.beats[]). `thread`
// is the source plot-thread id (`from_rough`); `kind` is 'text' (authored),
// 'placeholder' (a gap) or 'heading'; `proposal` is a pending AI edit. The
// chapters-v2 page derives todo/done/suggested display states from these.
export interface WriteBeat {
  id: string;
  text: string;
  kind?: string;
  thread?: string | null;
  proposal?: any;
  /** Author-toggled "written into the chapter prose" flag (persisted). */
  written?: boolean;
}

export interface WriteScene {
  id: number;
  text: string;
  /** Saved prose. Left out by the Write page's lean load: there the prose
   * comes one chapter at a time (loadChapterDocs → writeStore.contentById). */
  content?: TipTapDoc;
  words: number;
  status: 'drafted' | 'drafting' | 'sketch';
  entity_links: EntityLink[];
  marginalia: MarginaliaItem[];
  analysis: SceneAnalysis;
  beats: WriteBeat[];
}

export interface ChapterPov {
  mode: string;       // '' | 'first' | 'third-limited' | 'third-omniscient' | 'multiple'
  character: string;  // POV character name ('' when unset)
}

export interface WriteChapter {
  id: number;
  number: number;
  text: string | null;
  status: 'drafted' | 'drafting' | 'planned' | 'empty';
  pov: ChapterPov | null;
  scenes: WriteScene[];
}

export interface WriteData {
  chapters: WriteChapter[];
  totalWords: number;
}

export const EMPTY_WRITE: WriteData = { chapters: [], totalWords: 0 };

// A lightweight act→chapter→scene→beat tree, used by the chapters-v2 story
// rail (which browses the whole book, independent of the active chapter the
// manuscript renders). Built from the same get_grand_outline payload.
export interface OutlineSceneNode {
  id: any;
  n: number;        // 1-based within its chapter
  title: string;
  words: number;
  beats: WriteBeat[];
}
export interface OutlineChapterNode {
  id: any;
  n: number;        // sequential chapter number across the book
  title: string;
  scenes: OutlineSceneNode[];
}
export interface OutlineActNode {
  id: any;
  name: string;
  chapters: OutlineChapterNode[];
}

export interface WriteLoadResult {
  data: WriteData;
  contentById: Record<number, TipTapDoc>;
  acts: OutlineActNode[];
}

function parseBeats(sc: any): WriteBeat[] {
  return (sc.beats || []).map((b: any) => ({
    id: String(b.id),
    text: b.text || '',
    kind: b.kind || 'text',
    thread: b.from_rough ?? b.thread ?? null,
    proposal: b.proposal ?? null,
    written: !!b.written,
  }));
}

function deriveStatus(ch: any): WriteChapter['status'] {
  if (!ch.scenes?.length) return 'empty';
  const allDrafted = ch.scenes.every((s: any) => (s.words ?? 0) > 100);
  const anyDrafting = ch.scenes.some(
    (s: any) => (s.words ?? 0) > 0 && (s.words ?? 0) <= 100,
  );
  if (allDrafted) return 'drafted';
  if (anyDrafting) return 'drafting';
  return 'planned';
}

// Write and Preview load the book's STRUCTURE only (titles, word counts, beats —
// no prose): a series can be 1M+ words. Prose comes one chapter at a time via
// loadChapterDocs.
export async function loadWriteData(projectId: string | undefined): Promise<WriteLoadResult> {
  if (!projectId) return { data: EMPTY_WRITE, contentById: {}, acts: [] };

  // A failed read throws (SA-132): swallowing it into {} would render the
  // blank-book start over the author's real manuscript.
  const res = await callOp(projectId, 'get_grand_outline', { include_prose: false });
  const outline = res.grand_outline;
  if (!outline?.acts) return { data: EMPTY_WRITE, contentById: {}, acts: [] };

  let chapterNum = 0;
  let totalWords = 0;
  const chapters: WriteChapter[] = [];
  const contentById: Record<number, TipTapDoc> = {};
  const acts: OutlineActNode[] = [];

  for (const act of outline.acts) {
    const actChapters: OutlineChapterNode[] = [];
    for (const ch of act.chapters || []) {
      chapterNum++;
      const scenes = (ch.scenes || []).map((sc: any) => {
        const words = sc.words ?? 0;
        totalWords += words;
        return {
          id: sc.id,
          text: sc.text || '',
          // Lean load: no prose → `content` stays undefined (NOT an empty doc,
          // which would read as "this scene is blank" and could be saved over
          // the real prose).
          content: undefined,
          words,
          status:
            words > 100 ? ('drafted' as const) :
            words > 0 ? ('drafting' as const) :
            ('sketch' as const),
          entity_links: sc.entity_links || [],
          marginalia: [],
          analysis: sc.analysis || {},
          beats: parseBeats(sc),
        };
      });
      chapters.push({
        id: ch.id,
        number: chapterNum,
        text: ch.text || null,
        status: deriveStatus(ch),
        pov: ch.pov || null,
        scenes,
      });
      actChapters.push({
        id: ch.id,
        n: chapterNum,
        title: ch.text || '',
        scenes: (ch.scenes || []).map((sc: any, i: number) => ({
          id: sc.id,
          n: i + 1,
          title: sc.text || '',
          words: sc.words ?? 0,
          beats: parseBeats(sc),
        })),
      });
    }
    // Acts carry their title in `text`, like chapters and scenes.
    acts.push({ id: act.id, name: act.text || 'Act', chapters: actChapters });
  }

  return { data: { chapters, totalWords }, contentById, acts };
}

// One chapter's saved prose, for the Write page (op get_chapter_docs). `rev` is
// the server's prose version (+1 per change). `fetchedAt` is when the request
// LEFT, so the store can ignore an answer that is older than the author's
// latest keystroke in that scene (see writeStore.applyChapterDocs).
export interface ChapterDocScene {
  id: string;
  content: TipTapDoc | null;
  rev: number;
}
export interface ChapterDocs {
  fetchedAt: number;
  scenes: ChapterDocScene[];
}

export async function loadChapterDocs(projectId: string, chapterId: string): Promise<ChapterDocs> {
  const fetchedAt = Date.now();
  const res = await callOp(projectId, 'get_chapter_docs', { chapter_id: chapterId });
  return { fetchedAt, scenes: res?.scenes ?? [] };
}

/** One query per chapter. queryInvalidator maps the `outline` domain to the
 * `chapter_docs` prefix, so every outline invalidation (a save, an AI prose
 * edit, another tab) refetches the open chapter. Its own prefix (not under
 * ['outline', pid]) so outline-cache cancels/optimistic writes never touch it. */
export const chapterDocsKey = (projectId: string, chapterId: string) =>
  ['chapter_docs', String(projectId), String(chapterId)] as const;
