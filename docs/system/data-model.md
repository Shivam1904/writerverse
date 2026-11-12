# Data model: which tables exist and how they link

> Covers: `backend/projects/models/`, `backend/outline/models/`, `backend/outline/store.py`, `backend/outline/outline_writes.py`, `backend/gauges/models.py`, `backend/gauges/store.py`, `backend/worldbuilding/models/`, `backend/worldbuilding/store.py`, `backend/characters/models/`, `backend/braindumps/models/`, `backend/actions/models.py`, `backend/night_eyes/models.py`, `backend/notifications/models.py`, `backend/activity/models.py`, `backend/usage/models.py`, `scripts/models_map.py`

A **table** here means a Django model (one Postgres table). This page explains who owns what and how the tables hang together. It does not list fields: the code does that.

**See the live list:** `cd backend && uv run python ../scripts/models_map.py` prints every table with its links (FK, 1:1) and its JSON fields, straight from Django. Use it instead of copying fields into docs.

## Who owns which tables

| App | Tables |
| --- | --- |
| `accounts/` | `User` (log in with email) |
| `projects/` | `Project`: one story or series. The hub everything hangs off. |
| `outline/` | The outline tree `Act`, `Chapter`, `Scene`, `OutlineBeat`; a scene's prose `SceneContent` and its history `SceneRevision`; plot threads `PlotThread` and their `ThreadBeat`s |
| `characters/` | `Character`, `CharacterRelationship` (one directed row per link between two characters) |
| `worldbuilding/` | `Worldbuilding` (world entries), `WorldBlock` (World-page headings), `StoryItem` and `StoryRule` (items and rules the author accepted from the AI's first read) |
| `braindumps/` | `Braindump` (raw ideas) |
| `gauges/` | Lenses: `GaugePreset`, `GaugeBinding`, `GaugeCandidate`, `GaugeAnalysis`, `GaugeDataPoint` |
| `actions/` | `Proposal` (an AI change waiting for the author's OK), `ProjectDomainVersion` (when each part of a project last changed) |
| `night_eyes/` | `ChatThread` (a saved chat) |
| `notifications/` | `Notification` (the bell) |
| `activity/` | `ActivityEvent` (developer debug log, admin only) |
| `usage/` | `AIUsage` (one row per piece of AI work: tokens and $ cost; the one record of what AI cost) |

Not ours, but in the same database: Django's own tables (auth, sessions, admin), JWT token blacklist, django-axes (admin login lockout), django-silk (profiler, only when `DEBUG` is on), and LangGraph's chat checkpoint tables (made by `night_eyes/checkpointer.py` on first use, not by a migration).

## How they link

```
User ─┬─ Project ─┬─ Act ─ Chapter ─ Scene ─┬─ SceneContent (1:1, the prose)
      │           │          │              ├─ SceneRevision (old prose)
      │           │          │              └─ OutlineBeat ··→ PlotThread / ThreadBeat
      │           │          └ pov ··→ Character
      │           ├─ PlotThread ─ ThreadBeat      (character thread ··→ Character)
      │           ├─ Character, CharacterRelationship, Braindump, Worldbuilding, WorldBlock, StoryItem, StoryRule
      │           ├─ GaugePreset, GaugeCandidate
      │           ├─ GaugeBinding ─ GaugeAnalysis (1:1) ─ GaugeDataPoint ──→ Scene
      │           │      (character lens ··→ Character)
      │           ├─ ChatThread ─ Proposal (by plain `thread_id`; night_eyes deletes them with the thread; button proposals have none)
      │           └─ Proposal, ProjectDomainVersion, Notification, ActivityEvent
      └─ AIUsage
```

`─` means "belongs to": delete the parent and the children go too. `──→` is a hard link the same way (deleting a scene deletes its lens data points). `··→` is a soft link: deleting the target only clears the link, the row stays (e.g. deleting a character keeps the chapter, with its saved `pov_name`).

`Chapter`, `Scene` and `SceneRevision` also point straight at `Project`, so "all scenes of this project" is one query, not a walk down the tree.

## The store pattern: rows in, dicts out

Before October 2026 each project kept big JSON "blobs" (one row holding the whole outline, all threads, all gauges…). All of those are gone. Every one is now normal tables. The code above the tables still mostly works with plain dicts, through a small store module per area:

- **`load_*`** builds a dict from the rows: `outline/store.py` (`load_outline`, `load_chapter_prose`, `load_threads`), `gauges/store.py` (`load_gauges`; `load_presets` when only the presets are needed), `worldbuilding/store.py` (`load_world_blocks`, `load_elements`).
- **`save_*`** makes the rows match a whole dict in one transaction, writing only what changed (`save_outline`, `save_threads`, `save_gauges`). Use it for big merges, templates and test setup.
- **Row-level writers** change one item without loading the whole thing. For the outline these live in `outline/outline_writes.py` (insert, move, delete one act/chapter/scene/beat, write one scene's prose). The outline's own actions (`outline/capabilities/commit/`) use these, so a prose autosave never reads the whole series.

Why this matters at series scale: a book series can have thousands of scenes. Read with `load_outline(ctx, include_prose=False)` or `load_chapter_prose` when you can, and write with a row-level helper, not `save_outline`.

Every row in the outline and thread tables keeps the app's string id (`sc-…`, `ro-…`) in `uid` and its order in `position`, because the frontend, proposals and AI prompts all use those ids.

**New per-project data gets its own table, never a new blob.**

## What is still JSON on purpose

JSON fields are fine for small, self-contained values that nothing else needs to query or point at:

- `SceneContent.doc`: the scene's prose as a TipTap document. It is read and written whole, so splitting it into rows would gain nothing. `SceneRevision.content` holds old copies of it.
- `Project.book_config` (page-estimate settings), `pov_default`, `scene_pipelines`, `ai_tool_settings`, and the genre/tone/theme lists.
- Lists and small shapes on a single row: a character's traits, wants, aliases and `voice_profile` (tone, signature line); braindump `tags` and `ai_data` (the annotator's breakdown); a scene's `analysis`, `entity_links` and `mention_counts` (how often each entity is @mentioned in its prose, recounted on every prose save).
- `extra` on outline rows and gauge rows: rarely-used keys, so nothing is lost when a dict has a key with no column.
- Gauge settings and results (`config`, `spec`, `summary`, data point `value`), and `Proposal.args` / `proposal` / `base` (what the AI wants to change, and what it will overwrite, for the stale-accept check).

If you find yourself searching inside one of these, or wanting another table to point into it, that is the sign it should become rows.
