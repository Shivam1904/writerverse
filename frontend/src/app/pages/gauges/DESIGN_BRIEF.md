# Frontend Brief — Gauges route (the lens/charts contract)

> Handed over by the backend team, 2026-06-02. This is the live seam the FE wires to.
> Everything is `callOp(projectId, name, args)` — no REST. Loose JSON, no typed
> contracts (use `any`, defend with optional chaining).

## Mental model

A lens comes from one of **four sources** (`bank · mine · suggested · invented`), all
returned in the same loose **bank-shape + a `source` field**. Binding crystallizes a
**self-contained chart** — the bind call carries the **full config**; the backend stores
it verbatim. **Analyse reads only the bound chart**, never the bank. For
`suggested`/`invented`, **bind and proposal-accept are two separate calls**.

## The four lists + the board (READ)

| callOp | Returns | Notes |
|---|---|---|
| `get_gauge_bank` | `{ types:[{…, lenses:[lens]}], shared }` | `source: bank`. Grouped by type; each lens carries `tier` (core/range) + `pack` (launch/…). |
| `get_gauge_custom_library` | `{ lenses:[lens] }` | `source: mine` — your reusable custom lenses. |
| `get_gauge_suggestions` | `{ lenses:[lens] }` | `source: suggested`, each with `proposal_id` + scope/visual hints. **No dedup** (same template+scope repeats). |
| `get_gauge_inventions` | `{ lenses:[lens] }` | `source: invented`, each with `proposal_id` + the full AI-authored spec. |
| `get_gauge_board` | `{ charts:[chart], scenes:[…] }` | The bound charts (self-contained) + their analysis. |

## The one lens/chart shape (every list + the board)

```json
{
  "source": "bank|mine|suggested|invented",
  "proposal_id": 123,            // present only for suggested/invented (for accept)
  "lens_id": "...", "name": "...", "kind_word": "an arc", "glyph": "arc",
  "data_style": "scene_mapped|coverage", "type_id": "arc|map|tracker|checklist|setup_payoff",
  "display": "ladder_line", "visuals": ["ladder_line","line_with_ideal","gauge"],   // "Show as ▾"
  "report_view": "inline_markers", "report_views": ["inline_markers","list","summary"], // "Show findings as ▾"
  "rule": "rising", "rules": [{ "id":"rising","label":"should climb","status":"live" }], // verdict menu (family-gated)
  "scope": { "type":"character", "name":"Mira", "pair":null }, "scope_type":"character",
  "y_items": [{ "value":"principled", "description":"..." }], "y_items_source":"predefined", "block_key": null,
  "watches":"…", "read_as":"…", "look_for":"…", "good":"…", "off":"…", "invariant":"…",
  "direction":"…", "empty_state":"…", "output_language":"…", "tier":"core", "pack":"launch",
  // present only on get_gauge_board (after analyse):
  "data_points": [{ "scene_id":"s1","value":"principled" }],   // scene_mapped
  "coverage":    [{ "y_item":"Midpoint","covered":false }],     // checklist
  "pairs":       [{ "setup":"the postcards","paid":false }],    // setup→payoff
  "offending":   [{ "scene_id":"s3","detail":"knowledge goes backward" }], // THE REPORT (any rule)
  "score": 0.92, "deferred": false, "verdict": "holds", "analysed_at": "…"
}
```

- The FE render registry switches on `display`; the verdict banner/caption on `rule`/`offending`/`deferred`; `offending[]` **is the report**.
- `deferred:true` (arc/oscillate/no_jump/cover_in_order) → render as a **map, no verdict**.

## Lifecycle per source (the load-bearing flow)

| Source | list call | "try on" / preview | bind | proposal call |
|---|---|---|---|---|
| bank | `get_gauge_bank` | from the list item | `bind_gauge(fullConfig)` | — |
| mine | `get_gauge_custom_library` | from the list item | `bind_gauge(fullConfig)` | — |
| suggested | `get_gauge_suggestions` | from the list item (config + hints) | `bind_gauge(fullConfig)` | `accept_proposal(proposal_id)` — **separate** |
| invented | `get_gauge_inventions` | from the proposal (item carries the full spec) | `bind_gauge(fullConfig)` (fresh) | `accept_proposal(proposal_id)` — **separate** |

## WRITE capabilities

- `bind_gauge(fullConfig)` → `{ chart_id }`. You send the **entire chart bag** (name, data_style, display, scope, rule, visual, report_view, `y_items:[{value,description}]`, `block_key?`, all the copy). **Uniform across all sources.** `chart_id = lens_id|scope_type|scope_name` (re-binding the same lens+scope **updates** it).
- `accept_proposal(proposal_id)` / `reject_proposal(proposal_id)` → pure status flip. **Never binds.** Call after/alongside `bind_gauge`, as a second call. (accept removes it from the suggestions/inventions list; reject dismisses.)
- `update_gauge(chart_id, patch)` → merge any fields into the bound chart (scope/rule/visual/report_view/y_items/description). (`set_gauge_scale` / `set_gauge_view` exist as specific shortcuts.)
- `unbind_gauge(chart_id)`.
- `analyse_gauge(chart_id)` → runs analysis on the bound chart; refetch `get_gauge_board` to see `data_points|coverage|pairs` + `offending` + `verdict`.
- `extract_gauge_scale(chart_id)` → for extract-type lenses; fills `y_items` on the bound chart.
- `suggest_gauges()` / `suggest_custom_gauges()` → no args; create the suggested/invented proposal lists (refetch the respective get).
- `create_custom_gauge(config)` → writes to the **mine** library (does **not** bind). `delete_custom_gauge(lens_id)`.

## Don't expect (deferred backend-side)

- **Report content** — only the `report_views` menu + the per-binding pick are served; generated findings beyond `offending[]` are deferred.
- **arc / oscillate / no_jump / cover_in_order** verdicts → come back `deferred:true` (render as a map).
- **Section `y_items`** may be empty until the author populates the World block (live-read).

## Staleness

Writes invalidate the `gauges` domain (and World edits restale it too) → TanStack
queries on the gauge gets auto-refetch via the existing `X-Invalidates` interceptor.
