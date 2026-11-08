# gauges

The tables behind the gauges (lenses): the author's presets, the gauges on the
board, the AI's candidate lenses, and each gauge's latest analysis.

## Role in the System

Gauges are checks the author points at part of the story (pacing, a character's
arc, tension, …). This app owns the tables and the one read / one write over
them. All AI logic lives in `engine/`; all edits are pure dict functions in
`binding.py`. The gauge capabilities (buttons) are in `capabilities/`; the
`actions` kernel runs them. The app has no REST routes of its own.

## The tables

| Model | One row per | Key the app uses |
|---|---|---|
| `GaugePreset` | lens in the author's bank | `uid` (what `ref.id` points at) |
| `GaugeBinding` | gauge on the board (a preset + a scope) | `binding_id` |
| `GaugeCandidate` | entry in the `suggested` or `invented` list | (`kind`, `uid`) |
| `GaugeAnalysis` | binding (its latest analysis; one-to-one, deleted with it) | its binding |
| `GaugeDataPoint` | tick of that analysis (a scene, beat, chapter, …) | `position` |

Data points are one per tick and are replaced on every re-analysis, so an
analysis never grows past the number of ticks on its axis.

A data point about a scene links to the `outline.Scene` row (`scene`).
Deleting the scene deletes its points, so no cleanup code is needed. In the
dict the point still carries the scene's uid as `scene_id`; `save_gauges`
looks the uid up (one query per save). A uid that matches no scene stays in
the point's `extra` as text.

## The dict the app works with

The rest of the app still reads and writes ONE dict per project:
`{presets, bindings, suggested, invented, analyses}`.

- `store.load_gauges(project_id)` builds it from the rows (callers use
  `readers.py:load_gauges(ctx)`).
- `store.save_gauges(project_id, dict)` makes the rows match it, in one
  transaction, writing only rows that changed (callers use `_save_gauges` in
  `capabilities/commit.py`).

A key gets its own column only when the column gives back the exact same value
(e.g. a non-empty string, a float, a UTC time in `isoformat()` text). Every
other key stays in the row's JSON field (`config`, `extra`, `spec`, `summary`).
So save → load gives the same dict back.

## Character gauges follow a rename

A binding with `scope_type: "character"` links to the `Character` row
(`character`, set by name or alias with `outline.store.find_character_id`).
The loaded dict shows the character's **current** name as `scope_name`, so a
rename shows up with no extra code. If the character is hard-deleted the link
clears and the last saved name stays as the label.

`binding_id` (`preset|scope_type|scope_name[|thread]`) is made once, when the
gauge is bound, and never rebuilt. After a rename it still holds the old name.
That is fine: it is only a key (the analysis is filed under it). Never read the
scope out of it. Binding the same lens to the same scope again (any case)
reuses the existing gauge, so a rename can't create a duplicate.

## Source Map

| File | Purpose |
|---|---|
| `models.py` | The five tables |
| `store.py` | `load_gauges` / `save_gauges` (rows ↔ dict), plus small reads: `load_presets`, `load_preset_map`, `load_binding`, `load_candidates` |
| `readers.py` | Context-level reads: the board, catalogue, presets, `resolve_binding` |
| `lenses.py` | Lens library + suggestions readers (`get_lens_templates`, `get_suggestions`) |
| `section_lenses.py` | Per-section lens readers |
| `binding.py` | Pure dict transforms for presets / bindings / analyses |
| `capabilities/` | Gauge capability registrations + their gather / execute / commit steps |
| `engine/` | Lens config loader, verdict rules, LLM analysis, board builder |
| `config/` | Lens type YAML (`_shared.yml` + one file per type) |
| `admin.py` | Admin pages for each table |
| `tests/` | This app's tests |
| `migrations/0003_copy_gaugestore.py` | Copied the old one-blob-per-project `GaugeStore` into the tables (a no-op now) |
| `migrations/0005_datapoint_scene_fk.py` | Turned the point's scene uid text into the `scene` link |
