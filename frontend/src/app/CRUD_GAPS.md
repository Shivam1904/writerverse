# app — CRUD gap list

Audit of basic CRUD (add / edit / delete) availability per item type across app pages, with scoping decisions from 2026-05-29. Tracks what's done and what's left.

**Legend:** ✅ done · ⏳ in progress / partial · **TODO** = build it · **OUT OF SCOPE** = intentionally skipped.

> **Status (2026-05-29):** Sidebar badge ✅ · Plot Threads ✅ · Characters ✅ · Lenses ✅ (custom-lens persistence deferred) · Braindumps ✅ (delete now wired end-to-end) · World — not started.

---

## ✅ Sidebar thread-count badge — DONE

- Per-character plot-thread badge in `sublists/CharacterRail.tsx` now fetches `get_plot_threads` alongside `get_characters` and rebuilds character-scope counts. (Earlier regression from the `rail2/` refactor is resolved.)

---

## ✅ Plot Threads — DONE

Scope was: wire all thread operations (thread + beats); map stays read-only.

- ✅ **Thread create** — `createPlotThread` (`data.ts`) → existing `add_plot_thread` cap; `ThreadsPage.handleCreateThread` persists + invalidates.
- ✅ **Thread rename** — `updatePlotThread` (`data.ts`) → existing `update_plot_thread`; inline name edit in `ThreadCard` head, wired via `onRename`.
- ✅ **Beat delete** — NEW backend cap `delete_thread_beat` (gather/commit/register in `outline_crud.py`, smoke-tested) + `deleteThreadBeat` (`data.ts`) + hover trash button per beat in `ThreadCard`.
- Already worked: beat add, beat edit, thread delete, beat placement (drag→map).
- **OUT OF SCOPE** — map editing (placed beats stay read-only).

---

## ✅ Braindumps — DONE (2026-05-29)

Scope was: braindump delete (tags/edit/pin already shipped in the refactored page). The page was renamed `ideas/` → `braindumps/` since the original audit; views are `StreamView` + `CanvasView` (the old `CommonplaceView` is gone).

**Backend — the missing helper that would have crashed on accept is now in place:**
- ✅ `gather_delete_braindump`, `commit_delete_braindump`, `register delete_braindump` (route `WRITE` — direct, no proposal) already existed in `capabilities/{gather,commit,register}/crud.py`.
- ✅ **`data.delete_braindump(project_id, braindump_id)`** added in `backend/actions/data/braindumps.py` (mirrors `delete_worldbuilding`) + exported from `data/__init__.py`. Verified: helper importable, capability registered, gather/commit wired.

**Frontend — delete wired end-to-end (optimistic + rollback):**
- ✅ `pages/braindumps/data.ts` — `deleteBraindump()` → `callOp('delete_braindump', { id })`.
- ✅ `pages/braindumps/BraindumpsPage.tsx` — `onDeleteBraindump` (optimistic remove, restores on failure; skips temp rows) passed as `onDelete` to both views.
- ✅ `pages/braindumps/components/StreamView.tsx` — hover trash button in the item controls.
- ✅ `pages/braindumps/components/CanvasView.tsx` — hover trash button on each canvas card.
- ✅ `pages/braindumps/braindumps.css` — `.sg-del` + `.cpc-del` styling.

Note: the stray `*.orig` files flagged in the original audit are already gone.

---

## ✅ Characters — DONE (2026-05-29)

`update_character` already accepted a `relationships` list — no backend work.

- ✅ **Delete** — from the cast list (`CharactersPage.tsx` `onDelete`, with undo). The character detail page (`CharacterStudioPage`) has no delete button.
- ✅ **Relationships managed list** — `CharacterFormModal.tsx` now has an add/edit/delete list of `{name, relation}` entries (tolerant of legacy string/object shapes), serialized into the `relationships` array on save. The old free-text `relationship_notes` field stays. Styles: `.chr-rel-*`.

---

## ✅ Lenses — DONE (delete-in-modal + config); custom-lens persistence deferred

Scope: delete only from the modal, per bound scope, never the card.

- ✅ **Card delete removed** — `LensCard.tsx` and `LensCatalogue.tsx` now show only the "Bound" pill (no card-level Remove).
- ✅ **Per-scope delete in modal** — `ConfigureLensModal.tsx` adds a "Remove scope" button on the active binding (in the existing binding stepper). `LensesPage.removeScopeFromModal` → scoped `unbindLens`.
- ✅ **Scoped unbind** — `unbindLens(projectId, lens, sel, {scope_type, scope_name})` now pins removal to ONE bound scope (was defaulting to story → ambiguous for multi-scope lenses).
- ✅ **`updateChartConfig` wired** — editing y-items on an already-bound library template now persists via `onSaveConfig` (the bind op didn't carry per-template items).
- ⏳ **Custom lens (`custom:*`) persistence** — still frontend-only (`LensesPage.openCustom`). Deferred: needs a backend write op; out of scope for this pass.

---

## TODO — World (backend + frontend)

`update_project_meta` / `get_project_meta` exist; **title + themes already persist** (themes ↔ `tones`). Remaining:

- `pages/world/components/WorldSynopsis.tsx` — themes **inline edit** (today display-only, delete+re-add); title clear.
- `pages/world/WorldPage.tsx` — wire "+ new section" (stub button, no onClick); **remove the Phase-3 floating test panel**.
- `pages/world/data.ts` — custom-section load/save plumbing.
- Backend — custom sections dropped by the `_META_ALLOWED` whitelist:
  - `backend/projects/capabilities/gather.py` — allow `customSections` (or a dedicated discovery write).
  - `backend/projects/capabilities/commit.py` — persist it.

---

## ✅ Outline — no gaps

Act / Chapter / Scene / Beat each have add, edit, delete, reorder.

---

## OUT OF SCOPE

- **Watching** — read-only view (dead "Re-scan all" / "Add scene" / welcome-banner buttons left as-is).
- **charts-view / story-so-far** — read-only dashboards.
- **write** — prose editor, own save model.

---

## Remaining file count — World only

| Area | Files |
|---|---|
| **World** | `projects/capabilities/gather.py`, `projects/capabilities/commit.py` (backend) · `WorldPage.tsx`, `WorldSynopsis.tsx`, `data.ts` (frontend) — **~5** |

Done already: Sidebar badge (`sublists/CharacterRail.tsx`) · Plot Threads (`outline_crud.py` ×3, `threads/data.ts`, `ThreadCard.tsx`, `ThreadsPage.tsx`, `ThreadRow.tsx`, `threads.css`) · Characters (`data.ts`, `CharacterFormModal.tsx`) · Lenses (`LensCard.tsx`, `ConfigureLensModal.tsx`, `LensesPage.tsx`, `data.ts`) · Braindumps (`data/braindumps.py`, `data/__init__.py` · `braindumps/data.ts`, `BraindumpsPage.tsx`, `StreamView.tsx`, `CanvasView.tsx`, `braindumps.css`).
