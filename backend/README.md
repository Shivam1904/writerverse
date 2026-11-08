# WriterVerse Backend

Django REST API for WriterVerse, a story integrity engine for fiction authors. It takes scattered ideas, characters, world rules and plot notes and turns them into a coherent Story Bible and Outline.

Rules for agents: [`CLAUDE.md`](CLAUDE.md). The big picture: [`docs/system/map.md`](../docs/system/map.md); folders and layers: [`docs/system/code-layout.md`](../docs/system/code-layout.md); tables: [`docs/system/data-model.md`](../docs/system/data-model.md).

---

## Getting Started

### Prerequisites

- Python 3.12+
- Docker (for local Postgres)
- [uv](https://docs.astral.sh/uv/) for dependency management

### Environment Setup

Copy `backend/.env.example` to `backend/.env` (Neon dev: `backend/.env.dev`; production settings live only in Vercel). The example lists every variable the backend reads. Minimal local values:

```
DJANGO_SECRET_KEY=<any string for local dev>   # required when DEBUG is off
DJANGO_DEBUG=True
DATABASE_URL=postgres://writerverse_user:password@localhost:5432/writerverse
OPENAI_API_KEY=sk-xxxx        # optional, needed for AI features
ANTHROPIC_API_KEY=sk-ant-xxxx  # optional, needed for AI features
```

### Running Locally

```bash
# From repo root
make install        # Install deps (uv sync + npm)
make up             # Start Docker Postgres
make migrate-local  # Run migrations
make local          # Start Django :8555 + Vite :5555
```

### Testing

```bash
# From repo root
scripts/verify.sh   # ruff + import layers + eslint + tests + typecheck + docs (= CI)
make test           # Django tests + Vitest

# Backend only (from backend/)
uv run python manage.py test <app>
```

---

## Project Structure

The backend is split by story area. Each story app owns its tables, its reads (`readers.py`) and its actions (`capabilities/`). The `actions` app is a small kernel that runs those actions.

```
backend/
├── config/          Settings, root URL list, health check, file storage
├── accounts/        User model, JWT auth, registration, password reset
├── projects/        Project: the owner of all story data; project-detail actions
├── characters/      Characters and their relationships
├── worldbuilding/   World entries, World-page headings, story items and rules
├── braindumps/      Raw ideas and their AI annotation
├── outline/         Acts → chapters → scenes → beats, scene prose, plot threads
├── gauges/          Lenses (gauges): tables, analysis engine, lens YAML
├── actions/         The kernel: capability dispatch, proposals, staleness
├── night_eyes/      The AI chat assistant (LangGraph agent)
├── notifications/   The author's notification bell
├── activity/        Developer debug log
├── usage/           What AI work used (AIUsage) and the AI policy seam
├── common/          Pure shared helpers (ids, timestamps, TipTap text, errors, HTML cleaning)
├── ai_engine/       AI plumbing: model roles, create_llm, usage meter (not a Django app)
├── static/          Static assets
└── manage.py
```

**Layers** (checked by import-linter, config in the root `pyproject.toml`): `night_eyes` → story apps → `actions` → `accounts`/`notifications`/`activity` → `usage` → `common`/`ai_engine`. An app imports only from layers below it. Exceptions and why: [`docs/decisions/2026-10-backend-layout.md`](../docs/decisions/2026-10-backend-layout.md).

---

## Architecture

### Data Flow

```
Author action (UI button / chat message / cron)
  → Facade (actions/facade.py)
    → dispatch(): actor check → args check → AI policy → gather → execute → commit
      → READ: return data
      → WRITE: DB write under the project lock + staleness bump
      → PROPOSE: save a Proposal row → author accepts → apply
  → Response header X-Invalidates names the changed domains → frontend refetches
  → Cross-tab: a per-project stream tells other open tabs
```

### Key Patterns

**Capabilities** — Every action (button, chat tool, cron job) is a registered `Capability` with a `Route` (READ / WRITE / PROPOSE) and allowed `Actor`s. Each story app declares its own in `capabilities/`; `actions/apps.py` finds them at startup. One `dispatch()` runs them all. How to add one: [`CLAUDE.md`](CLAUDE.md).

**Proposals** — One `Proposal` model, sources chat / button / cron. The frontend shows them from one store (the bell, page cards, green inline values). See [`docs/how-it-works/proposals.md`](../docs/how-it-works/proposals.md).

**Rows, not blobs** — every per-project table is a normal table; new per-project data gets its own table. See [`docs/system/data-model.md`](../docs/system/data-model.md).

**Write lock** — every WRITE commit runs inside `transaction.atomic()` holding `SELECT FOR UPDATE` on the Project row, so two writes to one project run one after the other. LLM calls run outside the lock.

**AI cost** — what AI work used (tokens and $) is recorded once in `AIUsage` (`usage/`). Whether an author may run AI is the AI policy (`WRITERVERSE_AI_POLICY`, `usage/policy.py`); the default allows everything. Every LLM call must run inside an AI unit (a dispatch or a chat turn); outside one it raises in dev and tests.

**Meaning-search (RAG)** — removed (it was never wired in); to be rebuilt on the new tables, ticket SA-311. Postgres keeps the pgvector extension for it; the `pgvector` Python package was removed as unused and comes back with SA-311.

---

## API Overview

| Prefix | App | Description |
|--------|-----|-------------|
| `/api/auth/` | accounts | JWT login, register, logout, profile, password reset |
| `/api/projects/` | projects | Project CRUD, archive/restore |
| `/api/projects/<id>/characters/`, `braindumps/`, `worldbuildings/` | characters, braindumps, worldbuilding | REST routes each app declares in its own `urls.py` |
| `/api/consistency/` | actions, night_eyes, notifications | The action door (`op/<capability>/`), staleness stream, chat, notifications |

Auth: JWT via `rest_framework_simplejwt`, sent as `Authorization: Bearer <token>`.

API docs (`/docs/`, `/redoc/`, `/api/schema/`) are only routed when `DEV_SHORTCUTS_ENABLED` is on (defaults to `DEBUG`).

---

## Conventions

- **Dev phase**: ephemeral DB. No data migrations, no backfills (see the root `CLAUDE.md`).
- **Error handling**: every user-facing failure carries a `correlation_id`. The server logs the full traceback; the user sees a sanitized message. See [`common/errors.py`](common/errors.py).
- **Billable LLM commands are user-only**: never run `make night-eyes-smoke` automatically; they cost real money.
