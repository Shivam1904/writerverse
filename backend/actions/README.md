# actions

The **kernel**: the engine that runs every action (a "capability") in WriterVerse, plus proposals, "what changed" tracking and cross-tab sync.

Formerly `consistency`. The Django app label is still `consistency` (DB tables and migrations unchanged) and the URL prefix is still `/api/consistency/`.

## Role in the System

Every action, from a UI button, a chat turn, an on-save hook or a cron job, goes through `dispatch()` here. The kernel knows nothing about any one story area: the actions themselves live in each story app's `capabilities/` (`characters`, `worldbuilding`, `braindumps`, `outline`, `gauges`, `projects`). At startup `apps.py` imports every app's `capabilities` module (`autodiscover_modules("capabilities")`), and each one registers its actions.

- **Dispatch**: one pipeline for every caller: actor check, args check, the AI policy check, the per-project write lock, version bumping.
- **Proposals**: AI changes the author must accept. One `Proposal` model; accept and reject are capabilities too.
- **Staleness**: tracks which parts of a project changed and tells open tabs.

## How It Connects

- `Proposal` FK → Project. A chat proposal keeps the chat's id as a plain `thread_id` (no FK); `night_eyes` deletes a thread's proposals when it deletes the thread.
- `ProjectDomainVersion` FK → Project (one row per project + domain).
- Imports only from layers below: `activity`, `notifications`, `usage`, `common`, `ai_engine`, plus `projects.models` / `projects.scoping` / `projects.signals` (allowed for everyone). Exception: the stale-accept guard (`capabilities/stamps.py`, `awareness/signals.py`) still reads a few domain models; see `ignore_imports` in the root `pyproject.toml`.
- Imported by: every story app (to register capabilities), `night_eyes` (dispatch, domain versions).
- Plain REST writes in `projects` send the `domains_changed` signal; `apps.py` listens and bumps the domain versions.

## Key Patterns

**Capability** — Each one has a `Route` (READ / WRITE / PROPOSE), the `Actor`s allowed to run it (USER_BUTTON / CHAT / INTERNAL / CRON), declared `args`, and three steps (`gather → execute → commit`). `uses_ai=True` marks one that spends AI tokens, so the AI policy is asked first; it also needs a `label`, the plain words saved with its usage record ("Tagged an idea"; a test checks). A plain action that wants a small free AI helper (like naming an untitled scene) dispatches that helper as its own capability instead of calling the model itself, so the plain action stays plain.

**Args check** — `capabilities/args.py` turns each capability's `args` into a pydantic model. `dispatch()` checks args for every caller: a wrong type is a 400; a missing required arg is a 400 for the AI and a logged warning otherwise; extra keys pass.

**Contract checks** — `checks.py` runs on `manage.py check`: every name in `staleness.yml` must be registered, a PROPOSE capability with an `accept` needs a `stamp`, and a write should map to a staleness domain. `tests/contract_snapshot.json` records every capability's name and args; a test fails when they change by accident.

**Facade** — maps HTTP routes to capabilities. `/op/<capability>/` runs any one; a few named resource routes map GET/POST/PATCH/DELETE to capabilities. The URL project and URL record id win over the body.

**Write lock** — `dispatch()` runs every WRITE commit inside `transaction.atomic()` holding `SELECT FOR UPDATE` on the Project row. Two writes to the same project run one after the other; different projects never wait on each other. LLM calls run outside the lock; only the commit is locked.

**Staleness** — Each capability maps to a staleness domain (`config/staleness.yml`). Writes set that domain's `ProjectDomainVersion.changed_at` to now; reads return it as `staleness`, and Night Eyes compares it with what a chat last read to add a `[STALE]` warning (`domain_versions.py`). The stream at `staleness/stream/` polls those rows (~1.5 s) and sends the domains that moved, so it works across server processes; each stream ends after 4 minutes and the frontend reconnects with `?since=<versions>` to replay anything missed.

**Stale-accept guard** — `capabilities/stamps.py` saves what a proposal will overwrite and refuses an accept that would clobber a newer author edit. How it works: [`docs/how-it-works/proposals.md`](../../docs/how-it-works/proposals.md).

## How to add a capability

See "How to add a capability" in [`backend/CLAUDE.md`](../CLAUDE.md).

## Source Map

| File / Dir | Purpose |
|---|---|
| `models.py` | `Proposal`, `ProjectDomainVersion` |
| `facade.py` | HTTP routes → `dispatch()` |
| `views/` | `_scope`: the ownership check the facade uses (404 unless the project is the caller's) |
| `urls.py` | Routes: dev logs, dev registry, staleness stream, facade |
| `capabilities/spec.py` | `Capability`, `Route`, `Actor`, `ProposeWhen`, `DispatchContext`, `ProjectScope` |
| `capabilities/registry.py` | The `name → Capability` menu and `register()` |
| `capabilities/dispatch.py` | The one dispatch path for all callers |
| `capabilities/args.py` | Args spec → pydantic model; `check_args` |
| `capabilities/stamps.py` | Stale-accept guard: stamp functions, `check_fresh` |
| `capabilities/register/_proposals.py` | `accept_proposal`, `reject_proposal` |
| `capabilities/commit/_proposals.py` | Proposal commits and `guarded_accept` |
| `capabilities/gather/_common.py` | Shared gather helper (load a proposal's preview) |
| `checks.py` | Startup contract checks |
| `errors.py` | `_capability_error()`: the helper readers use to raise a `CapabilityError` |
| `domain_versions.py` | Bump / read "what changed when" per project + domain |
| `staleness_stream.py` | The live stream that polls `ProjectDomainVersion` |
| `awareness/` | `staleness.py`: capability → domain lookup. `config.py`, `evaluate.py`, `signals.py`: shadow nudge rules (worked out and logged, not shown to authors yet) |
| `config/staleness.yml` | Which capability changes which data domain |
| `registry_view.py`, `dev_logs.py` | Developer-only pages (capability list, activity log) |
| `management/commands/notify_test.py` | Dev command: send a test notification |
| `tests/` | Kernel tests and `contract_snapshot.json` |
