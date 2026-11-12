# WriterVerse — rules for AI agents

<!-- docs-check: ignore docs/decisions/ -->

## 1. What this is

WriterVerse is a **story integrity engine** for fiction authors: it turns scattered ideas, characters, world rules and plot notes into a coherent Story Bible + Outline with no contradictions. It is not a prose generator.

**Working principles** (the code is built this way):

- **Series scale.** One project can hold a whole book series: hundreds of world entries, thousands of scenes, 1M+ words. So "just load the whole project into the LLM / into memory" is wrong by default. Load either a small bounded map (ids + names) or retrieved slices, never the whole corpus.
- **Product filter.** AI removes friction the author hates; it never takes a creative decision the author should own.

## 2. Where things are

<!-- docs-check: ignore archive/ -->

- **Docs:** start at [`docs/README.md`](./docs/README.md), the index. The code is the source of truth; docs explain what the code can't.
- **Folder rules:** some folders have their own `CLAUDE.md` (e.g. `frontend/src/app/`, `backend/`). Follow them when working there.
- **Issues:** GitHub Issues. Never put tickets or plans in docs. Old `SA-n` / `WRT-n` / `wrt-n` numbers in code comments are retired ticket ids.
- **`archive/`** (if present): old, local-only docs that may be wrong. Don't read it unless asked. If you use a fact from it, check it against the code first.

## 3. Run and verify

```
make install                         # uv sync + npm install
make local                           # Docker Postgres + Django :8555 + Vite :5555
make up / make down                  # start / stop local Postgres only
scripts/verify.sh                    # THE check before review: ruff + import layers + eslint + tests + typecheck + docs (= CI)
scripts/e2e.sh                       # browser smoke test: type prose → save → reload → still there (also in CI)
make test                            # all backend + frontend tests (offline)
make coverage                        # backend unit-test coverage report (offline)
uv run python manage.py test <app>   # targeted backend tests (from backend/)
ruff check backend/                  # lint: run from the REPO ROOT
cd frontend && npm run build         # typecheck + build (what Vercel and CI run)
```

- Python deps: `uv` only (`pyproject.toml`). No `requirements.txt`.
- Backend tests need local Postgres (Docker) running.
- AI code asks for model **roles** (`small`, `draft`, `expert`), not model names. Config: `backend/ai_engine/config/providers.yml`.

## 4. Hard rules

- **Paid AI commands are user-only.** `make night-eyes-smoke` calls real, paid LLM APIs. Never run it unless the user asks for that run in this session. Default verification is offline: targeted tests, ruff, typecheck.
- **No browser testing unless asked.** Don't drive a browser or take screenshots on your own. Offer it if it seems worth it.
- **Pre-launch: stay proportional.** The database is still treated as throw-away. Don't spend effort on data migrations, backfills or backward compatibility unless asked. For small bugs, lead with the simplest fix.
- **Stay in scope.** Flag nearby breakage in one line; don't fix it inline.
- **Plans and access: code checks features, never plan names.** Ask "does this user have `ai_chat`?", never "is this user Pro?". Plan contents are data, so they can change without code changes.

## 5. Doc rules

- **Change the code, update its doc in the same commit.** If you change how an area works, update that area's page in `docs/`.
- **Wrong doc? Fix it or delete it.** Never leave a "correction" or "verified on" note next to wrong text.
- **No plans in `docs/`.** Plans live in the issue or the PR description. When the work ships, record the result in `docs/` (and the decision in `docs/decisions/`).
- **Keep pages short:** ≤150 lines per doc page, and this file ≤80 lines.
- **Check before you finish:** `make docs-check` (or `python3 scripts/docs_check.py`). It warns when a page is behind its code, points to missing paths, is too long, or isn't in the index. If a page is flagged "behind" but is still correct, run `python3 scripts/docs_check.py --ack <page>` and commit the new marker file in the docs acks folder (the page itself is not edited, so PRs don't conflict).
- **Don't copy what the code says.** No line numbers, no endpoint shapes by hand. Link the folder or generate the reference.

## 6. Working with the user

- **Plain, easy language.** Short sentences. Explain any jargon in a line. Use examples to show how things work. Explain what something *is* before what's wrong with it.
- **Ask with choices.** At every real fork, ask a multiple-choice question instead of guessing. Recommend one option and say why.
