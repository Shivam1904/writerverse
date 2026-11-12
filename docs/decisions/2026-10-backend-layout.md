# Decision: backend split into story-area apps, a small kernel, and checked layers

> Covers: `pyproject.toml`, `backend/actions/`

**Date:** October 2026. **Status:** done.

## What we decided

1. **One app per story area** (a "bounded context": the app owns everything about its area). `characters`, `worldbuilding`, `braindumps`, `outline`, `gauges` and `projects` each hold their own tables, `readers.py` (the reads and writes their actions use), `capabilities/` (their actions), and, when they need them, `engine/`, `ai/`, `config/` and `tests/`. Each mounts its own REST routes.
2. **A small kernel.** The old `consistency` app became `actions/`. It only runs actions: what a capability is, the registry, dispatch, the args check, the action door (`facade.py`), proposals and the stale-accept guard, "what changed" versions and the live stream, and startup checks. It finds each app's actions at startup (`autodiscover_modules("capabilities")`), so it never names a story area. Its Django label stays `consistency` and its URL prefix stays `/api/consistency/`, so no table or frontend change was needed.
3. **Layers, checked on every run.** import-linter (config in `pyproject.toml`, the `imports` step of `scripts/verify.sh`) allows only downward imports: `night_eyes` → story apps → `actions` → `accounts`/`notifications`/`activity` → `usage` → `common`/`ai_engine`. Story apps may import each other; the leaf apps, and `common` and `ai_engine`, may not.
4. **One toolkit.** Small helpers live once: ids, timestamps and TipTap text in `common/`; the outline walk in `outline/tree.py`. `ai_engine/` is AI plumbing only and no longer a Django app.
5. **A guarded contract.** `actions/tests/contract_snapshot.json` records every capability's name and args. Changing one on purpose means regenerating it (`UPDATE_CONTRACT_SNAPSHOT=1`); changing one by accident fails a test.

## Why

An architecture review found six problems:

- **R1. Readers loaded everything.** Many reads loaded a whole area (every braindump, every gauge analysis, the whole outline) to answer a small question. At series scale that is too slow. Readers now read only the rows they need.
- **R2. Dead systems stayed next to their replacements.** Old routes, configs and services (e.g. page estimation) were still in the tree and confused readers. They are deleted.
- **R3. The capability contract was not enforced.** Args were only checked for the AI, and nothing stopped a rename from breaking the frontend. Now `dispatch()` checks args for every caller, startup checks (`actions/checks.py`) catch broken wiring, and the snapshot catches renames.
- **R4. AI cost was recorded in several places.** The activity log and the cost bookkeeping both kept token costs. Now `usage.AIUsage` is the one record, and an AI call outside an AI unit raises an error in dev and tests.
- **R5. Helpers were copied.** The same id, timestamp, TipTap and outline-walk code lived in several apps, each a little different.
- **R6. Dev shortcuts reached production.** A dev reset route existed, the API schema was public, and a missing `SECRET_KEY` fell back to a default. Now the reset route is gone, the schema and docs pages exist only when `DEV_SHORTCUTS_ENABLED`, and `SECRET_KEY` is required when `DEBUG` is off.

## Known exceptions

Listed in `ignore_imports` in `pyproject.toml`. A new one fails the check.

- **Tests and migrations** may import anything.
- **`projects.models`, `projects.scoping`, `projects.signals`** may be imported by any layer. The project is the owner of all data: the kernel scopes every action to it and locks its row for writes, and leaf apps check ownership through it.
- **The stale-accept guard** (`actions/capabilities/stamps.py`, `actions/awareness/signals.py`) still imports a few domain models and field helpers to read a proposal's target. It is the one place where the kernel still knows about story areas.
