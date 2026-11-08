# Backend (Django)

General rules (running, testing, paid AI commands) are in the root `CLAUDE.md`. Layout and layers: `docs/system/code-layout.md`.

## Where things live

- **Story areas** (`characters/`, `worldbuilding/`, `braindumps/`, `outline/`, `gauges/`, `projects/`): each app owns its tables, `readers.py`, `capabilities/` (its actions) and `tests/`. Put new area code in its app, not in `actions/`.
- **The kernel** (`actions/`): runs every action for the frontend and the AI. `capabilities/dispatch.py` runs gather → execute → commit; `facade.py` serves `projects/<id>/op/<capability>/`. It never names a story area.
- **Shared helpers:** `common/` (ids, timestamps, TipTap text, errors). The outline walk: `outline/tree.py`. AI plumbing: `ai_engine/`.
- **AI chat (Night Eyes):** `night_eyes/`. Prompts: `night_eyes/prompts.py`.
- **Proposals** (AI changes waiting for the author's OK): `actions/models.py`; accept/reject in `actions/capabilities/register/_proposals.py`. Every per-type accept commit must be wrapped in `guarded_accept` (a test enforces it). See `docs/how-it-works/proposals.md`.
- **Notifications:** `create_notification()` in `notifications/notifications.py`.

## How to add a capability (an action)

1. Add it in your app's `capabilities/` with `register(Capability(...))` (a new file must be imported by `capabilities/__init__.py`). Put its reads and writes in the app's `readers.py`.
2. Nothing to wire: `actions/apps.py` imports every app's `capabilities` at startup. `manage.py check` then runs `actions/checks.py` (staleness names, stamps for accepts, a staleness domain for writes).
3. Update the contract on purpose: `UPDATE_CONTRACT_SNAPSHOT=1 uv run python manage.py test actions.tests.test_contract_snapshot`, and commit `actions/tests/contract_snapshot.json`.
4. Run `scripts/verify.sh` (its `imports` step runs `lint-imports`): import only from layers below yours.

Note: `actions` was called `consistency` before. Its Django label is still `consistency` (DB tables and migrations unchanged), and its URL prefix is still `/api/consistency/`.
