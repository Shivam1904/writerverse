# System map: the big picture

> Covers: `backend/`, `frontend/src/`, `backend/config/urls.py`

WriterVerse is a web app with two halves that talk over HTTP:

- **Frontend:** the screens authors use (React, in `frontend/`). Runs in the browser.
- **Backend:** the server (Django, in `backend/`). Checks who you are, does the work, stores the data.
- **Database:** Postgres. Docker on your laptop; Neon in production.
- **AI providers:** the frontend never calls an AI directly. The backend does, through `backend/ai_engine/`.

```
 Browser (frontend/)                     Server (backend/)                      Outside
┌─────────────────────┐   HTTP/JSON   ┌──────────────────────────────┐
│ app pages           │ ────────────▶ │ actions/facade.py             │
│  (Ideas, Characters,│               │   └▶ capability dispatch ─────┼──▶ Postgres (+pgvector)
│   World, Outline,   │ ◀──────────── │ projects / accounts           │
│   Manuscript…)      │  X-Invalidates│ night_eyes (AI chat) ─────────┼──▶ ai_engine ──▶ OpenAI / Anthropic
│ Night Eyes chat     │ ◀── stream ── │ staleness_stream (live)       │                    (traced in LangSmith)
└─────────────────────┘               └──────────────────────────────┘
```

## The four ways the frontend talks to the backend

| Door | Address | Used for |
| --- | --- | --- |
| **1. The action door** | `POST /api/consistency/projects/<id>/op/<action>/` | Almost everything inside a project: read characters, save a scene, add a beat, run an analysis. The frontend calls it through `callOp()` in `frontend/src/app/gateway.ts`. |
| **2. Plain REST routes** | `/api/auth/`, `/api/projects/` | Login and accounts, the project list. |
| **3. The chat stream** | `POST /api/consistency/projects/<id>/chat/` | Night Eyes chat. The reply streams back word by word. |
| **4. The live-update stream** | `GET /api/consistency/projects/<id>/staleness/stream/` | The backend tells every open tab "these kinds of data changed, refresh them". |

All four start from one base address, `VITE_API_URL` (locally `/api`, which Vite forwards to Django; in production the full backend address). Only `frontend/src/config/api.ts` reads it. axios uses it as its base; the two streams use `fetch()` (axios can't read a stream as it arrives), through `apiFetch()` in `frontend/src/app/apiFetch.ts`, which adds the base and the login token. A hard-coded `"/api/..."` would only work locally, so ESLint blocks it.

The **action door** is the heart of the app. Behind it sits the **capability system**, a menu of every action with rules for who may run it (the author's button, the AI chat, a scheduled job) and whether it runs **directly** or becomes a **proposal** the author must accept.

Each action is declared by the story app it belongs to (for example `characters/capabilities/`). The `actions` app is only the engine that runs them: at startup it imports every app's `capabilities` module, and each one adds its actions to the menu.

## Three example trips

**A. The author clicks a button (e.g. edits a character)**

1. The page calls `callOp(projectId, "<action>", args)`.
2. `actions/facade.py` receives it and hands it to `dispatch()` in `actions/capabilities/dispatch.py`.
3. Dispatch finds the action in the registry, checks the args against the action's declared `args` (`actions/capabilities/args.py`: a wrong type is a **400**; a missing required arg is a 400 only for the AI, a logged warning otherwise; extra keys pass through), then runs its steps: **gather** (read what it needs) → **execute** (do the work, sometimes an AI call) → **commit** (write to the database).
4. The reply comes back as **200** ("done") or **202** ("this became a proposal, waiting for your OK"). It carries an `X-Invalidates` header listing what changed.
5. The frontend (`app/queryInvalidator.ts`) reads that header and refreshes just those parts of the screen. A refresh never overwrites a text field the author is typing in: list fields built on `useFieldList` hold the focused row locally until it loses focus. The Write page's prose (loaded one chapter at a time) skips any scene with unsaved typing or typed after the refresh was asked for.

**B. The author chats with Night Eyes**

1. The chat panel (`app/modules/chat/streamClient.ts`) posts the message to the chat stream, with a hidden `context` that says what the author has open (`modules/chat/pageContext.ts`). Example: on the Write page it sends the open `chapter_id` and the current `scene_id` (the scene the author last scrolled to or clicked, else `?sc`: one rule in `pages/write/currentScene.ts`, the same scene the page's margin highlights); the server then reads that one scene's saved prose (capped at about 3k tokens) and puts it in the prompt, so "who is in this scene?" is answered from the text (`night_eyes/context_blocks.py`). Only ids travel; never the whole manuscript.
2. `backend/night_eyes/` checks the project belongs to the logged-in author (404 if not, on every chat endpoint), asks the AI policy (`usage/policy.py`; the default allows everything), then runs the AI agent (a LangGraph graph).
3. When the AI wants to read or change the story, it uses **the same actions** as the buttons, through the same `dispatch()`. So the AI can't do anything the action menu doesn't allow.
4. Words, tool calls and "what changed" events stream back to the browser.
5. If the turn crashes (for example it runs out of steps), the author gets a plain "sorry, please try again" line. The real error goes to the server log, never to the chat.

**C. Another tab stays in sync**

1. Tab 1 saves something. In the same database transaction the backend records "outline changed now" (`ProjectDomainVersion`, via `actions/domain_versions.py`). Chat writes and background jobs go through the same dispatch, so they record it the same way. The plain REST routes (project update, and the character, braindump and world routes via `ProjectScopedMixin`) send the `domains_changed` signal (`projects/signals.py`); the actions app listens and records it.
2. Tab 2 has the live-update stream open (`app/stalenessStream.ts`). While it is open, the backend (`actions/staleness_stream.py`) re-reads the project's versions every ~1.5 s and sends the domains that moved. Tab 2 refreshes its outline.
3. Because the database is the source of truth, this works across server processes and Vercel function instances.
4. Each stream ends after 4 minutes (below Vercel's 5-minute limit). Every event carries the versions the tab has seen; the tab reconnects with them (`?since=`) and the backend replays anything it missed. Network drops reconnect with backoff.
5. Each open stream holds one database connection for its life and returns it when it ends. That is cheap in prod, where `DATABASE_URL` is Neon's pooled (pgbouncer) endpoint: an idle client there uses no real Postgres slot. Reconnecting every poll would cost a new handshake every 1.5 s per tab.

## Who decides which value (the trust rule)

Some values in a request belong to the server, never to the browser or the AI:

- **The project** comes from the URL (`projects/<id>/...`) and is checked against the logged-in user. Dispatch gets it as a `ProjectScope`, not as an arg.
- **A record id in the URL path** (e.g. `characters/<id>/`) wins over the body. A body that names a *different* id gets a **400** (`_route_args` in `actions/facade.py`).
- **Any record id in args** (from a button or the AI) is looked up *inside* that project, so another project's id is a **404**.
- The plain REST routes (characters, braindumps, world) use `ProjectScopedMixin` in `backend/projects/scoping.py`: rows are filtered to the URL project, and a body `project` field is ignored.
- A chat thread id from another project is a **404**, so a known id can't resume someone else's conversation.

Tests: `backend/projects/tests/tests_foreign_record_ids.py` and `tests_cross_tenant.py`.

## Where the AI sits

- All AI calls go through `backend/ai_engine/`. Code asks for a **role** (`small`, `draft`, `expert`), not a model name. The mapping lives in `backend/ai_engine/config/providers.yml`.
- Each role has an ordered list of backup models (`fallbacks:` in `providers.yml`): when the main model is down, refuses the key or rate-limits us, the call moves to the next one ([decision](../decisions/2026-10-ai-backup-provider.md)).
- AI config fails loudly, never quietly picks a default model. A startup check (`backend/projects/checks.py`) stops `runserver` / `migrate` / `check` if a role (or one of its backups) names an unknown or unpriced model, has no chat profile, or has no `timeout` or `max_tokens`. `create_llm` checks the same things again at call time, so an unknown role raises an error naming the role instead of quietly running a default model. Keys are read when a model is built, from the env var named by `api_key_env` in `providers.yml`. **Keys are optional:** a model without its key is left out of the role's chain, so one provider's key is enough; with no usable key, `create_llm` (and portraits) raise `AINotConfiguredError`, which the action door, the DRF error handler and the chat stream turn into HTTP 503 `ai_not_configured` ("AI is not configured on this server"). With `AI_ENABLED` the startup check only warns (`writerverse.W002`) about what can't run; `AI_ENABLED=False` and the test runner skip that warning. Every client gets the model's `timeout`, `max_tokens` (output cap) and one retry, so a stuck call ends after at most 2 × `timeout`.
- Every AI call is recorded in **LangSmith** (prompt, reply, tokens, time) when tracing is on. Tests never upload traces (the settings turn tracing off under the test runner).
- **Local AI call log** (dev only): with `AI_CALL_LOG=1` in `backend/.env`, every call's full prompt and reply goes to `db/logs/ai_calls.jsonl`, one JSON line per call with its `turn_id`, capability, model, tokens and time (`backend/ai_engine/call_log.py`). Read one turn from the terminal with `uv run python manage.py ai_calls <turn_id>` (no id = the latest turn, `--list` = recent turns). Always off on a deployed server and in tests, because the file holds the author's text.
- What AI work cost is recorded once, in **`AIUsage`** (`backend/usage/`), when the work ends (success or crash). Whether an author may run AI, and what happens after, is the **AI policy** (`settings.WRITERVERSE_AI_POLICY`): the default allows everything; an edition can add usage limits with its own policy, which refuses with a `Refusal` (402 by default). Each call is priced from its input, cached-input and output tokens by the `genai-prices` library (`ai_engine/usage_meter.py`). Pricing fails closed: `create_llm` refuses to build a model if `providers.yml` can't load or the library has no price for the model, so no unpriced AI call runs. Plain (non-AI) edits are not affected. An unreadable reply (`ask_json` gets bad JSON, or JSON of the wrong shape, twice and raises `UnreadableReply`) is free: those calls never reach the meter. It is never read as an empty result: the action fails, so the author sees "couldn't check" rather than a false "all clear".
- Every AI call must run inside an **AI unit** (a dispatch or a chat turn, `ai_engine/units.py`), so its usage is recorded. In dev and tests a call outside one raises an error; in prod it logs a warning.
- Every AI turn (a chat message, a ping answer, or a top-level dispatch) gets one **`turn_id`** (`backend/common/turns.py`). It is on every log line (`turn=<id>`, `-` outside a turn), in the error line next to the correlation id, in the turn's AI usage rows and activity rows (`metadata` / `details` key `turn_id`), and on its LangSmith runs (tag `turn:<id>`; a dispatch adds `capability:<name>`). To debug one turn, run `uv run python manage.py show_turn <id>` (`backend/actions/management/commands/show_turn.py`): one timeline, sorted by time, of its log lines (dispatch decisions, errors with their traceback), its AI calls (model, tokens, time, LangSmith run id, each tool call and its result), its AI usage and its activity rows. Read the full prompts with `manage.py ai_calls <id>`, or search LangSmith for the tag.

## Where to go next

- Folders and what each one holds: [`code-layout.md`](./code-layout.md)
