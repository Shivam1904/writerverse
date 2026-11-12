# Tech stack and outside services

> Covers: `pyproject.toml`, `frontend/package.json`, `backend/config/settings.py`, `backend/config/runtime.py`, `backend/config/storage.py`, `backend/ai_engine/config/`, `.github/workflows/`, `docker-compose.yml`

Only env var **names** here, never values. `DJANGO_SECRET_KEY` (or `SECRET_KEY`) must be a real random key everywhere except local dev: the server refuses to start when it is empty or a public example value (the one in `.env.example`, or any `django-insecure-…` key). Local dev may use the example key. Local secrets live in ignored files, one per app: `backend/.env` (plus `backend/.env.dev` for the Neon dev branch) and `frontend/.env`. Production settings live only in Vercel, never in a local file. Each has a committed `.env.example` listing every variable. Vercel does not read these files: set the same names in each Vercel project (frontend, backend).

## Where the backend runs (runtime)

`settings.RUNTIME` says where the server is running. It comes from `WRITERVERSE_ENV` when set, else from Vercel's own `VERCEL_ENV` (`backend/config/runtime.py`):

| Runtime | When | Missing settings |
| --- | --- | --- |
| `production` | Vercel production deploy, or any server with `WRITERVERSE_ENV=production` | Server refuses to start |
| `preview` | Any other Vercel deploy (also on Vercel with no `VERCEL_ENV`) | Server refuses to start |
| `local` | Laptop, tests, CI, `vercel dev` | Dev defaults (`localhost` URLs, SQLite, a throwaway key) |

Required in `production` and `preview`: `DJANGO_SECRET_KEY`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `DEFAULT_FROM_EMAIL`. The start-up error lists every missing name at once. To require another setting, add one line to `REQUIRED` in `runtime.py`.

**Self-hosting** (a VPS, Fly, Docker, not Vercel): set `WRITERVERSE_ENV=production`, otherwise the server counts as `local` and the required-settings check and email verification are off. Also set `DJANGO_DEBUG=False`, `DJANGO_ALLOWED_HOSTS` (your domain; `.vercel.app` is only force-added on Vercel) and `SECURE_PROD=True` behind HTTPS.

**Local dev** (`settings.LOCAL_DEV`) means all three: runtime `local`, `DEBUG` on, and `FRONTEND_URL` on localhost. Only then are dev conveniences on: `DEV_SHORTCUTS_ENABLED` (reset/verify links in the API answer, the API docs pages) and the `/api/consistency/dev/logs/` and `/api/consistency/dev/registry/` pages. So a public server that copied `.env.example` (DEBUG on) but points `FRONTEND_URL` at its real domain gets none of them.

**AI rate limit.** Requests that run AI (action routes for `uses_ai` actions, the chat) are limited per user by `common/throttling.py` (`AI_THROTTLES`): `AI_RATE_BURST` (default `60/min`) and `AI_RATE_DAILY` (default `1000/day`). Saving prose and other plain actions don't count. Over the limit the API answers 429.

**AI policy.** `WRITERVERSE_AI_POLICY` (a dotted path, `usage/policy.py`) decides who may run AI and what happens after each AI call. The default, `usage.policy.AIPolicy`, allows every AI call; an edition can add usage limits by pointing it at its own policy. `TERMS_VERSION` and `REQUIRE_TERMS_ACCEPTANCE` (both off by default: the app ships no terms) turn on a sign-up terms record.

Deployed runtimes also allow their own Vercel URLs (`VERCEL_URL`, `VERCEL_BRANCH_URL`) for CORS and the `.vercel.app` host, and log to the console only (Vercel's disk is read-only). `CSRF_TRUSTED_ORIGINS`, when unset, copies the CORS origins, so the two lists can't drift.

**Production database guard.** A `local` run (laptop, tests, CI) refuses to start when `DATABASE_URL` points at the production database: a host whose first label is one of the comma-separated ids in the `PRODUCTION_DB_ENDPOINTS` env var (e.g. a Neon endpoint id; direct and `-pooler` hosts both count). Unset = no guard, so set it in `backend/.env` on any machine that also has production credentials. Example: pasting the prod URL into `backend/.env` makes `manage.py` stop with a plain error instead of writing to live data. Local Postgres and the Neon dev branch are not affected. To touch production on purpose, set `ALLOW_PRODUCTION_DATABASE=true` for that one command. The only place that does this is the `migrate.yml` job, which is how production gets migrated (there is no `make migrate-prod`). If the production endpoint changes, update the env var.

## Tech stack

| Layer | What we use |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind, TanStack Query (server data), Zustand (screen state), TipTap (the prose editor) |
| Backend | Python 3.12, Django 5, Django REST Framework, JWT login (simplejwt) |
| Database | Postgres. No app creates the pgvector extension any more (the `ai_engine` migrations that did were deleted); meaning-search will need it again (SA-311) |
| AI | LangChain + LangGraph (the Night Eyes agent is a LangGraph graph); genai-prices for the real $ cost of each call |
| Tooling | `uv` (Python packages), npm, ruff (Python lint), import-linter (backend app layers), eslint, Vitest, Django tests, coverage (`make coverage`: backend test coverage report) |

## Services the app itself uses

If one of these breaks, the product breaks or loses a feature.

| Service | What for | Where it's set up | Env vars | Status today |
| --- | --- | --- | --- | --- |
| **OpenAI** | Every AI role (`small`, `draft`, `expert`: the `roles:` ladder in `providers.yml`, made official 2026-10-03) and portrait images (`gpt-image-1`). Optional: without it, text roles use the Anthropic backup, and portraits answer 503 `ai_not_configured`. | `backend/ai_engine/config/providers.yml`, `ai_engine/image_gen.py` | `OPENAI_API_KEY`, `OPENAI_BASE_URL` (optional) | ✅ Live |
| **Anthropic** | Backup for every AI role: when OpenAI is down, refuses the key or rate-limits us, calls move to the Claude model of the same tier ([decision](../decisions/2026-10-ai-backup-provider.md)) | `providers.yml` (`fallbacks:`), `ai_engine/llm_utils.py` | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` (optional) | ✅ Live as backup. Optional: with neither key, every AI feature answers 503 `ai_not_configured` and the rest of the app works. |
| **Postgres + pgvector** | All app data (tables: [`data-model.md`](./data-model.md)), plus rate-limit counters (the `throttle` cache in `CACHES`, so every Vercel process shares one count; its table comes from a migration in `backend/common/migrations/`) | Local: `docker-compose.yml`. Production: Neon | `DATABASE_URL`, `CONN_MAX_AGE` | ✅ Live |
| **Neon** | Hosted Postgres for production | Vercel env vars | `DATABASE_URL` | ✅ Live |
| **Vercel** (optional host) | Can host both halves: frontend (`frontend/`) and backend (`backend/`). The runtime detects it (`config/runtime.py`); the deploy config itself is not in this repo. The backend's production Python packages are about 150–160 MB unpacked (unused spacy, numpy, pgvector, markdown, python-docx and click were removed, and the silk profiler is dev-only), under Vercel's 250 MB function limit. boto3/botocore for R2 (~22 MB) is the biggest app-chosen one. | Vercel dashboard | `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL` (set by Vercel); `VITE_API_URL` (frontend → backend address) | ✅ Live |
| **LangSmith** | Records every AI call (prompt, reply, tokens, time) for debugging, including portrait images (`ai_engine/image_gen.py` traces the raw OpenAI call by hand; the PNG itself is never sent) | `backend/config/settings.py` passes the keys to LangChain | `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_ENDPOINT`; `LANGSMITH_PROJECT` (unset = `writerverse-prod` on Vercel production or with `SECURE_PROD`, else `writerverse-dev`); `LANGSMITH_HIDE_INPUTS` / `LANGSMITH_HIDE_OUTPUTS` (`true` = keep prompts / replies, i.e. author text, out of traces; unset = full traces) | ✅ Live when tracing is on |
| **Email (SMTP, Resend)** | Account emails: verify email, welcome, password reset, password changed, account deleted ([`account-emails.md`](../how-it-works/account-emails.md)) | `backend/config/settings.py`, `backend/accounts/emails.py` | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_TIMEOUT`, `DEFAULT_FROM_EMAIL`; `REQUIRE_EMAIL_VERIFICATION` (unset = on when deployed) | ✅ Live in prod through Resend SMTP. Without `EMAIL_HOST` (local, CI), emails are only printed to the server console. |
| **Cloudflare R2** | File storage for generated character portraits (S3-compatible bucket, via django-storages). Files are public-read at `R2_PUBLIC_URL`; keys hold a random id so URLs can't be guessed. A character's file is removed when it gets a new portrait or the row is really deleted (soft delete keeps it for Undo). Without the R2 vars (dev, tests, CI) files go to the local media folder (`MEDIA_ROOT`). | `backend/config/storage.py`, `backend/characters/portraits.py` | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (all or none) | ⚠️ Code ready; needs the bucket and the five vars in the backend Vercel project. Until then, portraits on Vercel are lost. |

## Services we build with

These don't affect users, but we depend on them to work.

| Service | What for |
| --- | --- |
| **GitHub** | Code, issues and CI in `.github/workflows/`: `ci.yml` (tests, lint, frontend build, and an end-to-end browser test of the core writing journey via `scripts/e2e.sh`). Maintainers may run extra private workflows (production migrations, nightly checks) that are not in the public repo. |
| **Docker** | Runs the local Postgres |
| **Claude Code** | AI coding agents (rules in `CLAUDE.md`) |

## Developer-only extras (local)

- **Silk** (`/silk/`): request profiler, a dev-only package (not installed in production). Off by default; set `SILK_ENABLED=True` (works only with `DEBUG` on). Left off because it can deadlock under parallel requests and cause random 500s.
- **Django admin**: at `/admin/` locally. With `DEBUG` off it is not served at all unless `DJANGO_ADMIN_PATH` is set, and then only at that path (pick a long, random one; set it in the Vercel backend project). Logins are locked for an hour after 5 failures (django-axes, admin only). Every model shows up in it only when `DEBUG` is on; in production only the hand-written admins appear.
- **API docs** (`/docs/`, `/redoc/`, `/api/schema/`): auto-generated by drf-spectacular. Routed only when `DEV_SHORTCUTS_ENABLED` is on (local dev only, see above). It only describes the plain REST routes; the action door shows up as one generic route.
