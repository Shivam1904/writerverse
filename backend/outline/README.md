# outline

Plot threads and the grand outline tree. The single source of truth for story structure.

## Role in the System

The outline app owns two things: **plot threads** (rough narrative arcs with beats) and the **grand outline** (the act → chapter → scene tree, including each scene's prose). Both are stored in normal tables.

Plot threads are the author's rough ideas for narrative arcs. Each thread has a scope (character or story), a source, and a list of beats. The grand outline is the formal hierarchy: acts → chapters → scenes → outline beats.

## How It Connects

- `PlotThread` (FK → Project, `related_name='plot_threads'`) is one storyline; its `ThreadBeat` rows are the beats, in `position` order. A character thread also links to its `Character` (`character`), so a rename shows up everywhere (`scope.name` is read live). Both keep the app's string ids (`ro-…`, `ri-…`) in `uid`, because outline beats and proposals point at them. `store.py` reads them as a list of dicts (`load_threads`); writers change single rows through its helpers (`create_thread`, `open_beat_slot`, …). `save_threads` syncs a whole list and is used to seed tests.
- The grand outline is five tables, each row keeping the app's string id (`ac-…`, `ch-…`, `sc-…`, `bt-…`) in `uid` and its order among siblings in `position`:
  - `Act` (FK → Project) → `Chapter` (FK → Act, plus Project) → `Scene` (FK → Chapter, plus Project for fast per-project reads) → `OutlineBeat` (FK → Scene).
  - `SceneContent` (1:1 → Scene) holds the scene's prose (the TipTap doc). `rev` goes up by one each time the prose changes (a version number for a later "changed elsewhere" check, SA-313). `doc_hash` lets a save see whether the prose changed without reading it back.
  - A chapter's POV links to its `Character` (`pov_character`, so a rename follows); `pov_name` is the saved name, used if the character is hard-deleted.
  - An outline beat placed from a thread links to the `PlotThread` (`thread`) and `ThreadBeat` (`thread_beat`). Deleting either only clears the link: the beat and its text stay.
  - Each row has an `extra` JSON for rarely-used keys (e.g. a scene's `thread`), so nothing is lost.
- Three outline settings live on `Project`: `outline_base_template`, `pov_default` (POV a new chapter starts with) and `scene_pipelines` (on/off per scene analysis).
- `SceneRevision` (FK → Scene, CASCADE) keeps earlier versions of a scene's prose; deleting a scene deletes its history. Every commit that replaces scene content (`save_scene_content`, `propose_scene_edits`, `insert_scene_paragraphs`) calls `record_scene_revision` in `revisions.py` with the old content. Identical re-saves add nothing. Author autosaves (`save_scene_content`, every ~1.5 s while typing) keep at most one version per `SCENE_REVISION_MIN_GAP_SECONDS` (default 600 = 10 min), so the cap reaches back hours, not minutes; AI edits always keep the version from just before. The newest `SCENE_REVISION_CAP` (default 50, env-overridable) per scene are kept. The Write page lists and restores them (`list_scene_revisions`, `restore_scene_revision`).
- Outline actions are declared in `capabilities/` and run by the `actions` kernel. The app has no views or `urls.py` of its own.

## Key Patterns

- **One dict in, one dict out.** The app still reads and writes the outline as one nested dict (`{base_template, acts: [{id, text, chapters: [{id, text, pov, scenes: [{id, text, words, content, analysis, entity_links, mention_counts, beats}]}]}]}`). `mention_counts` (`{"character": {"51": 3}}`) is worked out from the prose on every prose write (`outline_rows.mention_counts`), so the character presence chart reads it from the lean outline; a client never sets it:
  - `load_outline(ctx)` builds it from the rows (one query per table). `load_outline(ctx, include_prose=False)` leaves out every scene's `content` and never reads `SceneContent`; screens that show structure only use it (`get_grand_outline(include_prose=False)`, the chat's outline skeleton and chapter reads).
  - `load_chapter_prose(ctx, chapter_id)` reads ONE chapter's scenes with their prose (`content` + `rev`), touching only that chapter's `SceneContent` rows. The Write page loads the outline lean and asks for prose one chapter at a time with the `get_chapter_docs` op (one TanStack query per chapter, `['chapter_docs', pid, chapterId]`, refetched on every `outline` invalidation; the write store never lets an answer overwrite a scene the author is typing in or typed in after the read left). Preview reads the same per-chapter queries, loading the next chapter as the reader scrolls. Chat's `get_chapter_prose` uses the same helper.
  - `load_scene(ctx, scene_id)`, `load_chapter(ctx, chapter_id)` and `load_chapter_of_scene(ctx, scene_id)` read ONE node by id and return the same dict `load_outline` nests for it. Code that needs one scene or chapter uses these instead of loading the whole book (`get_chapter`, `get_scene_paragraphs`, the paragraph-edit tools, scene pipelines, chat's active-scene block).
  - `save_outline(ctx, outline)` syncs a whole dict back in one transaction: it writes only rows that changed, inserts new items, deletes missing ones, bumps `rev` on changed prose, and rolls word/act/chapter/scene totals onto Project. A scene dict with no `content` key leaves the stored prose alone, so a lean dict saved back cannot wipe the manuscript.
  - `outline_rows.py` is the item ↔ columns conversion (pure functions). The data migration that copied the old JSON blob into the tables (0014) uses it too.
- **No own routes**: outline endpoints go through the actions facade (`/api/consistency/projects/<id>/op/<capability>/`).

## Source Map

| File | Purpose |
|------|---------|
| [models/outline.py](models/outline.py) | `Act`, `Chapter`, `Scene`, `SceneContent`, `OutlineBeat`; `SceneRevision` (prose history) |
| [models/thread.py](models/thread.py) | `PlotThread`, `ThreadBeat`: plot threads and their beats |
| [store.py](store.py) | Read/write for threads and the outline (`load_outline`, `save_outline`, …) |
| [outline_rows.py](outline_rows.py) | Outline dict item ↔ table columns |
| [outline_writes.py](outline_writes.py) | Row-level writers: insert, move or delete one act/chapter/scene/beat, write one scene's prose, refresh the book totals |
| [beat_undo.py](beat_undo.py) | Signed undo token for a deleted beat |
| [tree.py](tree.py) | Walk the outline dict: `iter_scenes`, `find_node`, `scene_crumb` |
| [revisions.py](revisions.py) | `record_scene_revision`: append old prose, skip unchanged, space autosaves, prune to the cap |
| [readers.py](readers.py) | Outline and thread readers behind the capabilities (`get_grand_outline`, `get_chapter`, `get_thread`, …) |
| [capabilities/](capabilities/) | This app's actions: `register/` declares them, `gather/` → `execute/` → `commit/` run them; `pipelines.py` is the on-save scene-pipeline factory |
| [engine/](engine/) | Pure outline code: base templates, merge helpers, paragraph ops (`scene_paragraphs.py`), outline/thread generation (`generation.py`) |
| [ai/](ai/) | Scene-check analyzers (`scene_analysis.py`) and their LangChain chains (`chains/`) |
| [config/thread_scaffolds.yml](config/thread_scaffolds.yml) | Storyline scaffolds for the New-storyline picker |
| [config/grand_outline.yml](config/grand_outline.yml) | Grand-outline base scaffolds and story templates (loaded by `engine/config.py`) |
