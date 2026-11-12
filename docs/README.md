# WriterVerse docs: index

<!-- docs-check: ignore guides/ --> <!-- docs-check: ignore reference/ -->

The **code is the source of truth**. These docs explain what the code can't: what the product is for, how the pieces fit together, and why things were decided.

**How to use this index:** each line says which question a page answers. Open only the page you need.

| Folder | What goes there |
| --- | --- |
| `product/` | What WriterVerse is, who it's for, the words we use |
| `system/` | The big picture: map, code layout, data model, tech stack and services |
| `how-it-works/` | One short page per area (saving prose, AI chat, proposals…) |
| `guides/` | How to add things: a field, an AI action, a page, an endpoint |
| `decisions/` | What we chose and why |
| `reference/` | Generated from the code by a script. Never edit by hand. |

## Pages

| Question | Page | Covers |
| --- | --- | --- |
| What is WriterVerse, who is it for, what are its principles? | [`product/overview.md`](./product/overview.md) | `frontend/src/app/nav.ts`, signup/login copy |
| What can an author do in the app, feature by feature? | [`product/features.md`](./product/features.md) | the `capabilities/` folder of each story app (`backend/characters/`, `outline/`, …) |
| What words mean (both what authors see and what the code says)? | [`product/glossary.md`](./product/glossary.md) | `frontend/src/config/lexicon.ts`, `backend/actions/capabilities/spec.py` |
| How do the big pieces fit together? How does the frontend talk to the backend? | [`system/map.md`](./system/map.md) | `backend/`, `frontend/src/` |
| Which folder holds what? | [`system/code-layout.md`](./system/code-layout.md) | `backend/`, `frontend/src/`, repo root |
| Which tables exist, which app owns them, how do they link, what is still JSON? | [`system/data-model.md`](./system/data-model.md) | the models in each app, `outline/store.py`, `outline/outline_writes.py`, `scripts/models_map.py` |
| What tech do we use? Which outside services, and where are they set up? | [`system/stack-and-services.md`](./system/stack-and-services.md) | `pyproject.toml`, `frontend/package.json`, `backend/config/settings.py`, `backend/ai_engine/config/`, `.github/workflows/` |
| Quick list of every outside service the app can use (Postgres, OpenAI, email, R2, …), and which ones you need locally? | [`system/resources.md`](./system/resources.md) | `backend/config/`, `.github/workflows/`, `docker-compose.yml` |
| Which emails do we send about an account, when, and how does email verification work? How do I preview an email locally? | [`how-it-works/account-emails.md`](./how-it-works/account-emails.md) | `backend/accounts/emails.py`, `backend/accounts/templates/accounts/emails/`, `frontend/src/components/VerifyEmailPage.tsx` |
| What is a proposal, where does the author see it, and what happens on Accept (stale and double-click checks)? | [`how-it-works/proposals.md`](./how-it-works/proposals.md) | `backend/actions/capabilities/commit/_proposals.py`, `stamps.py`, `frontend/src/app/modules/proposal/` |
| What happens when OpenAI is down? Which backup model does each AI role use, and when does it switch? | [`decisions/2026-10-ai-backup-provider.md`](./decisions/2026-10-ai-backup-provider.md) | `backend/ai_engine/config/providers.yml`, `backend/ai_engine/llm_utils.py` |
| Why is the backend split into story-area apps plus a small `actions` kernel, and what may import what? | [`decisions/2026-10-backend-layout.md`](./decisions/2026-10-backend-layout.md) | `pyproject.toml` (import-linter layers), `backend/actions/` |
| Why is WriterVerse AGPL with a CLA? Where does the code live? | [`decisions/2026-11-open-source-license.md`](./decisions/2026-11-open-source-license.md) | `LICENSE`, `CLA.md`, `.github/workflows/cla.yml` |
