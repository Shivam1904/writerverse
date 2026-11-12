# Code layout: what lives where

> Covers: `backend/`, `frontend/src/`, repo root

Folder level only. For how the pieces work together, see [`map.md`](./map.md).

## Repo root

<!-- docs-check: ignore db/logs/ --> <!-- docs-check: ignore archive/ -->

| Path | What |
| --- | --- |
| `backend/` | Django server |
| `frontend/` | React app (Vite) |
| `docs/` | These docs |
| `scripts/` | Checks and helpers: `verify.sh` (the pre-review check), `e2e.sh`, `docs_check.py`, `models_map.py` |
| `db/logs/` | Local log files (`django.log`, `persistence.log`, …) |
| `Makefile` | Dev commands (`make local`, `make test`, …) |
| `pyproject.toml` / `uv.lock` | Python dependencies (managed with `uv`) and the import-linter layers. `uv.lock` pins exact versions so every machine installs the same ones. |
| `docker-compose.yml` | Local Postgres with pgvector |
| `archive/` | Old docs, local only, not trusted (git-ignored) |

## Backend apps (`backend/`)

The backend is split by **story area** (a "bounded context": one app owns one area's tables, reads, actions and AI). A small **kernel** (`actions/`) runs the actions; it knows nothing about any one area.

| App | What it owns | Its URLs |
| --- | --- | --- |
| `config/` | Settings, root URL list, health check, file storage choice (local disk or R2) | `/`, `/health/`, the admin (path from `DJANGO_ADMIN_PATH`); `/api/schema/` and `/docs/` only when `DEV_SHORTCUTS_ENABLED` |
| `accounts/` | Users (`User`), login with JWT tokens, password reset | `/api/auth/` |
| `projects/` | A story project (`Project`), the project list, project-detail actions, startup AI-config checks | `/api/projects/` |
| `outline/` | Acts → chapters → scenes → beats, scene prose and its history, plot threads, and the outline walk (`tree.py`) | none (reached through actions) |
| `characters/` | Characters (`Character`) and the links between them (`CharacterRelationship`) | `/api/projects/<id>/characters/` |
| `worldbuilding/` | World entries, World-page headings, accepted story items and rules | `/api/projects/<id>/worldbuildings/` |
| `braindumps/` | The author's raw ideas and their AI annotation | `/api/projects/<id>/braindumps/` |
| `gauges/` | Lenses: their tables, analysis engine and lens YAML | none (reached through actions) |
| `actions/` | **The kernel**: runs every action, proposals, live updates (see below) | `/api/consistency/` |
| `night_eyes/` | The AI chat assistant (LangGraph agent, tools, streaming, saved threads) | under `/api/consistency/projects/<id>/` |
| `usage/` | The AI policy seam (`policy.py`: `AIPolicy`, `Refusal`, `get_policy`; default allows everything) and `AIUsage`, the one record of what each piece of AI work cost (`services.py`: `gate`, `settle`) | none |
| `notifications/` | The author's notification bell | under `/api/consistency/projects/<id>/notifications/` |
| `activity/` | Developer debug log (`ActivityEvent`) | none |
| `common/` | Pure shared helpers: ids, timestamps, TipTap text, errors, HTML cleaning, persistence audit log | none |
| `ai_engine/` | AI plumbing only: model roles, `create_llm`, usage meter, AI units (`units.py`), image generation. A plain Python package, not a Django app | none |

**Inside a story app** (`characters`, `worldbuilding`, `braindumps`, `outline`, `gauges`, `projects`): `readers.py` holds the reads and writes its actions use; `capabilities/` declares the actions; `tests/` holds its tests. Apps with more logic add `engine/` (pure logic), `ai/` (prompts and chains) and `config/` (YAML). Each app mounts its own REST routes in `config/urls.py`.

**Layers** (checked by import-linter; config in the root `pyproject.toml`, run as the `imports` step of `scripts/verify.sh` and in CI). An app may import only apps below it:

1. `night_eyes`
2. story apps: `characters`, `worldbuilding`, `braindumps`, `outline`, `gauges`, `projects` (they may import each other, e.g. `gauges` reads `worldbuilding.store`)
3. `actions` (the kernel)
4. `accounts`, `notifications`, `activity` (independent: they may not import each other)
5. `usage` (the AI policy seam: an edition's policy plugs into it through `WRITERVERSE_AI_POLICY`)
6. `common`, `ai_engine` (independent too)

Exceptions, listed in `ignore_imports`: anyone may import `projects.models`, `projects.scoping` and `projects.signals` (the project is the owner of everything), and the stale-accept guard (`actions/capabilities/stamps.py`, `actions/awareness/signals.py`) still reads a few domain models. A new exception fails the check. Why: [`decisions/2026-10-backend-layout.md`](../decisions/2026-10-backend-layout.md).

### Inside `actions/`

| Part | What |
| --- | --- |
| `facade.py` | The action door: `projects/<id>/op/<action>/` plus a few named routes |
| `capabilities/` | The kernel: `spec.py` (what a capability is), `registry.py`, `dispatch.py` (gather → execute → commit), `args.py` (checks args for every caller). `register/` holds only accept/reject proposal; every other action lives in its story app |
| `capabilities/stamps.py` | Stale-accept guard: saves what a proposal will overwrite, and refuses an accept that would clobber a newer author edit |
| `checks.py` | Startup contract checks (`manage.py check`) on the registry |
| `awareness/` + `staleness_stream.py` | Working out what changed; the stream polls the change times in the database and tells open tabs |
| `domain_versions.py` | Remembers when each part of a project last changed |
| `models.py` | `Proposal` (AI changes awaiting the author's OK) and `ProjectDomainVersion` |
| `config/` | `staleness.yml`: which action changes which data domain |
| `tests/contract_snapshot.json` | Every capability's name and args; a test fails when they change by accident |
| `registry_view.py`, `dev_logs.py` | Developer-only pages |

## Frontend (`frontend/src/`)

| Folder | What |
| --- | --- |
| `app/` | **The app.** All new UI goes here. |
| `components/` | Older code that still runs **login, signup, password reset, profile**, the error boundary and toasts |
| `stores/` | `authStore.ts` (the logged-in user, tokens, and the shared HTTP client setup) and `projectStore.ts` |
| `config/` | User-facing text (error messages, labels), one file per topic; `api.ts` is the backend base URL |
| `extensions/` | Plug-ins the build can add (see **Extensions** below). `none.ts` = no extension (the default) |
| `pages/` | Two developer-only pages (logs, lens catalogue) |
| `demo/` | Demo pages under `/demo/*` |
| `utils/`, `hooks/`, `types/` | Older helpers, mostly used by the older pages |
| `App.tsx` | The list of all URLs (routes). Page routes load lazily: each page is its own build chunk, downloaded the first time it opens, with a spinner meanwhile. If a chunk is gone after a deploy (an old tab), the page reloads once (`app/lib/chunkReload.ts`). A page's CSS loads with its chunk, so a component used on several pages imports its own CSS file |

### Inside `app/`

| Part | What |
| --- | --- |
| `pages/` | One folder per sidebar section, registered in `pages/registry.ts` (lazily, through `lib/lazyNamed.ts`). Also library and showcase. |
| `modules/` | Features used across pages: `chat` (Night Eyes), `proposal`, `notification`, `lens`… |
| `components/` | Shared building blocks used by many pages (page header, beat input, drafting canvas…) |
| `ui/` | The visual kit (buttons, cards, inputs…). Styling lives here. |
| `sublists/`, `rightRail/` | The entity lists (characters, threads, braindumps) in the sidebar hover menu and the braindumps page, and the right-hand suggestions panel |
| `theme/` | Themes and the theme switcher |
| `ProjectShell.tsx` | The frame around every project page: sidebar, top bar, the page, rails |
| `nav.ts` | Sidebar sections, grouped by mode (imagine / plan / write) |
| `gateway.ts` | `callOp()`: the one function that calls the action door. Shows the receipt toast on success and the red problem toast when a write fails |
| `queries.ts`, `queryInvalidator.ts` | Fetching data (TanStack Query) and refreshing it when the backend says it changed |
| `extensions.ts` | The one place the app reads the extension slots |

**Where state lives:** data from the server → TanStack Query (`queries.ts`). Data many screens read (the outline, the gauge board) has ONE key and ONE loader there; read it with `useQuery({ ...queries.x(pid) })` (add `select` for another shape) instead of a second key or a direct call, or the same data is fetched several times per page. Static config the backend builds from files (the lens catalogue) has one global key with `staleTime: Infinity`, outside the project's keys, so a restale never refetches it. Screen-only state (open panels, the logged-in user, pending proposals) → small Zustand stores.

**After a write:** don't reload by hand. The write's response names the data it changed (the `X-Invalidates` header), and `queryInvalidator.ts` refetches just those keys, once. To show the change at once, edit the cached data with `setQueryData` before the write (the World page does this for edits and deletes).

**Loading, failed, empty:** a page's main loader (`pages/*/data.ts`) throws when a read of the author's content fails; it never returns empty data. The page passes its query to `lib/loadStatus.ts`, which says `loading`, `error` or `ready`. Until it is `ready`, the page renders `<LoadState>` from `components/LoadError.tsx` (a spinner, or "Couldn't load …" + Retry). Only a `ready` empty list may show the first-run screen. Otherwise a slow load or an outage looks like a brand-new project, and the author is told to start over on top of their real work.

**Calls that skip the gateway:** a few calls use plain `axios` (archiving a notification, the library, extension pages). They get no automatic toast, so each one reports its own failure: `problem()` from `modules/receipt/receiptStore.ts` inside the project shell, an inline message or `<LoadError>` outside it. No failed write or main load may be silent.

**Extensions:** the core needs no extension to work. Extra UI plugs in through slots typed in `app/extensions.ts`: `routes`, `topbarItems`, `userMenuItems`, `shellOverlays`, `libraryOverlays`, `useCostLabel` (read with `useActionCost` from `app/lib/actionCost.ts`), `handleApiError` (the gateway and chat stream ask it first; `true` = handled, no toast), `signupTerms` (sign-up shows a terms checkbox only when set) and `setup` (run once in `main.tsx`). All are optional. The build picks the module behind `@writerverse/extensions` in `frontend/extensions.config.ts`: `none.ts` by default (also `WRITERVERSE_EXTENSIONS=none`), or a path to another module (`WRITERVERSE_EXTENSIONS=<path>`). Extension code imports the core as `@wv/...` (= `src/`). Its server reads use keys under `['ai_usage', pid, …]`, which refetch when the backend bumps the `ai_usage` domain.

## Things that look odd (true today)

- The `actions` app keeps its old Django label `consistency` (DB tables, migrations) and its old URL prefix `/api/consistency/`.
- Some routes sit under another app's prefix: character, worldbuilding and braindump routes live under `/api/projects/<id>/`, and notification and chat routes under `/api/consistency/`. Each app still declares its own routes in its `urls.py`; `config/urls.py` mounts them all.
- The "older" `frontend/src/components/` folder still holds the live login and account pages.
