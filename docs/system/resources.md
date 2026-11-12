# Outside resources (quick list)

> Covers: `backend/config/runtime.py`, `backend/config/storage.py`, `backend/ai_engine/config/providers.yml`, `.github/workflows/`, `docker-compose.yml`

A one-page list of the outside services WriterVerse can use. Details and env var names are in [`stack-and-services.md`](./stack-and-services.md). Only names here, never keys.

For local development you need none of the paid services: Docker Postgres is enough to run the app and the offline tests. Each service below switches on when its env vars are set.

## Runs the product

| Resource | What for | Env vars | Needed locally? |
| --- | --- | --- | --- |
| **Postgres** (with pgvector) | The database. Locally from `docker-compose.yml` (`make up`); the hosted app uses a managed Postgres (Neon). | `DATABASE_URL` | Yes (Docker) |
| **OpenAI** | Main model of every AI role (`small`, `draft`, `expert`) and portrait images | `OPENAI_API_KEY` | Only for AI features; paid per use |
| **Anthropic** | Backup model for every AI role when OpenAI fails | `ANTHROPIC_API_KEY` | No; paid per use |
| **SMTP email** (the hosted app uses Resend) | Account emails (verify, welcome, reset). Without `EMAIL_HOST`, emails print to the console. | `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | No |
| **LangSmith** | Traces AI calls for debugging | `LANGSMITH_API_KEY`, `LANGSMITH_TRACING`, `LANGSMITH_PROJECT` | No |
| **Cloudflare R2** (any S3-style store) | Stores character portrait files | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | No |
| **A host** (any; the runtime also detects Vercel) | Runs the frontend (`frontend/`, a static build) and the backend (`backend/`, a Django app). Deploy config for a particular host is not in this repo. | `VITE_API_URL` (frontend) | No |

## Builds and checks the code

| Resource | What for |
| --- | --- |
| **GitHub** | Code, issues, PRs and CI (`.github/workflows/ci.yml`) |
| **Docker** | Local Postgres with pgvector (`make up`) |
| **Playwright** | The browser smoke test (`scripts/e2e.sh`) |

Maintainers may also use private tools (nightly checks, production deploy jobs). They are not needed to build, test or contribute.
