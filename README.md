# WriterVerse

**A story integrity engine for fiction authors.** Not a prose generator — its job is to take scattered ideas, characters, world rules, and plot notes and turn them into a coherent, validated Story Bible and Outline with no contradictions and no gaps.

---

## Quick start for contributors

You need: **Docker** (for the local Postgres), **[uv](https://docs.astral.sh/uv/)** (Python 3.12+ and its packages) and **Node.js 20.19 or newer** with npm (CI uses Node 20).

```bash
cp backend/.env.example backend/.env      # local defaults work as they are
cp frontend/.env.example frontend/.env
make install                               # uv sync + npm install
make up && make migrate-local              # start Postgres (127.0.0.1:5432) and create the tables
make local                                 # Postgres + Django :8555 + Vite :5555
```

Open http://127.0.0.1:5555 and sign up. Emails (e.g. password reset) print in the terminal that runs `make local`.

**No AI keys needed to start.** Writing, ideas, characters, world, outline and threads all work without them. AI buttons and the chat answer "AI is not configured on this server" until you set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` in `backend/.env`. One key is enough for every text feature (each model role falls back to the other provider); character portraits need the OpenAI key. AI calls cost real money on your own key.

Checks before a pull request: `scripts/verify.sh` (lint, import layers, tests, typecheck, docs). `make help` lists every command.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite (port 5555), TailwindCSS, TanStack Query, Zustand, TipTap |
| Backend | Django 5.2, Django REST Framework (port 8555) |
| AI Orchestration | LangChain + LangGraph (`ai_engine/`) |
| Database | PostgreSQL with pgvector (Docker locally) |
| Hosting | Any host that runs a Django app, a static Vite build and Postgres. The hosted instance uses Vercel + Neon: see [`docs/system/stack-and-services.md`](./docs/system/stack-and-services.md) |

---

## Architecture

### Backend — Django domain apps

| App | Owns |
|-----|------|
| `projects` | Project (central hub) |
| `outline` | Outline tree (acts/chapters/scenes + prose and its history), plot threads |
| `braindumps` | Braindumps |
| `worldbuilding` | World entries, World-page headings, accepted story items and rules |
| `characters` | Characters |
| `gauges` | Lens tables (presets, bindings, candidates, analyses, data points) |
| `actions` | Capabilities, proposals, staleness, facade |
| `night_eyes` | The AI chat (Night Eyes) and saved chats |
| `notifications` | The notification bell |
| `usage` | What AI work used (`AIUsage`) and the AI policy (`WRITERVERSE_AI_POLICY`) |
| `activity` | Developer debug log (step runs, AI calls) |
| `accounts` | CustomUser (email-based auth, JWT) |
| `ai_engine` | Provider-agnostic AI layer — no Django imports |

Tables and how they link: [`docs/system/data-model.md`](./docs/system/data-model.md).

`ai_engine` has a hard boundary: domain apps import it, never the reverse.

### Frontend — active shell

All current UI work lives in `frontend/src/app/` — mounted at `/project/:projectId`. The older `frontend/src/components/` and `frontend/src/stores/` directories are legacy and not extended.

### Night Eyes — AI chat

The AI chat is at `backend/night_eyes/`. It is capability-driven and page-aware: every action (button, chat, cron) is a registered Capability with a Route (READ / WRITE / PROPOSE) dispatched through a single pipeline.

### Proposal system

A `Proposal` row is created for any AI action that needs human acceptance. One model, three rendering surfaces (chat inline, toast, page-surface), all subscribing to a single store — accept on any surface dismisses all three in lockstep.

---

## Everyday commands

```bash
make local          # Postgres + Django :8555 + Vite :5555  (make dev is an alias)
make migrate-local  # Run migrations against local Postgres
make test           # Django tests + Vitest (offline, needs `make up`)
make down           # Stop local Postgres
```

**Python deps**: managed by `uv` — single source of truth is `pyproject.toml` (`uv run python manage.py ...` from `backend/`, `uv add <package>`).

**Env vars:** the backend reads `backend/.env`, the frontend reads `frontend/.env`; each `.env.example` explains every variable. A hosted server sets the same names in its host's settings.

Local URLs: app http://127.0.0.1:5555, API http://127.0.0.1:8555 (the browser calls `/api`, Vite proxies it).

---

## Key design decisions

**Capability dispatch** — every AI action goes through `actions/capabilities/dispatch.py`. Actor + route type determines whether it runs directly (WRITE), returns read-only data (READ), or creates a Proposal the author must accept (PROPOSE).

**AI edit tiers** — surgical CRUD (update a field, add an entry) applies directly; generative/structural/prose changes always go through a Proposal.

**Model roles, not model names** — agents request `small`/`draft`/`expert`. The router resolves to actual models from `backend/ai_engine/config/providers.yml`.

---

## Where to find things

Start at [`docs/README.md`](./docs/README.md), the documentation index. Rules for AI agents are in [`CLAUDE.md`](./CLAUDE.md).
