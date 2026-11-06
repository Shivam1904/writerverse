.PHONY: \
	help install \
	local dev up down kill-dev-ports \
	migrate migrate-local migrate-dev \
	superuser test coverage night-eyes-smoke docs-check verify hooks clean

.DEFAULT_GOAL := help

# === Core Paths ===
# All Python commands use `uv run` — no requirements.txt, no manual venv activation.
# Single source of truth: pyproject.toml at repo root.
BACKEND_DIR := backend
FRONTEND_DIR := frontend

# backend/.env, backend/.env.dev -> subprocess os.environ. python-decouple reads .env on
# demand but does not export it; LangChain/LangSmith require env vars.
DOTENV_KEYS := '^(DATABASE_URL|DJANGO_|LANGSMITH_|OPENAI_API_KEY|ANTHROPIC_API_KEY)='
LOAD_ENV_LOCAL := export $$(grep -E $(DOTENV_KEYS) $(BACKEND_DIR)/.env 2>/dev/null | xargs)
LOAD_ENV_DEV := export $$(grep -E $(DOTENV_KEYS) $(BACKEND_DIR)/.env.dev 2>/dev/null | xargs)

# Fixed local dev ports (see frontend/vite.config.ts).
DEV_API_PORT := 8555
DEV_APP_PORT := 5555

# === Help ===
help:
	@echo "WriterVerse commands:"
	@echo "  make install         Install backend + frontend dependencies (uv sync + npm)"
	@echo "  make local           Start local stack (Postgres + Django + Vite)"
	@echo "  make dev             Alias for make local"
	@echo ""
	@echo "Database:"
	@echo "  make migrate-local   Migrate local Postgres (backend/.env)"
	@echo "  make migrate-dev     Migrate Neon Dev (backend/.env.dev)"
	@echo "  Production: maintainers only (not part of this repo)"
	@echo ""
	@echo "Utilities:"
	@echo "  make up/down         Start/stop Docker services"
	@echo "  make superuser       Create local Django admin"
	@echo "  make test            Run backend + frontend tests"
	@echo "  make verify          Lint + tests + typecheck + docs, short pass/fail summary"
	@echo "  make docs-check      Check docs for drift, broken paths, length (warn only)"
	@echo "  make hooks           Enable repo git hooks"
	@echo "  make clean           Remove caches and local build artifacts"

# === Installation ===
install:
	uv sync
	cd $(FRONTEND_DIR) && npm install

# === Local Development ===
up:
	@echo "Starting local Postgres..."
	docker compose up -d

down:
	@echo "Stopping local Postgres..."
	docker compose down

dev: local

kill-dev-ports:
	@echo "Clearing ports $(DEV_API_PORT) (API) and $(DEV_APP_PORT) (app)..."
	@-lsof -ti tcp:$(DEV_API_PORT) | xargs kill -9 2>/dev/null || true
	@-lsof -ti tcp:$(DEV_APP_PORT) | xargs kill -9 2>/dev/null || true

local: up kill-dev-ports
	@echo "WriterVerse (uv run)"
	@echo "   App -> http://127.0.0.1:$(DEV_APP_PORT)"
	@echo "   API -> http://127.0.0.1:$(DEV_API_PORT)"
	@(trap 'kill 0' SIGINT; \
		$(LOAD_ENV_LOCAL) && \
		cd $(BACKEND_DIR) && DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1 uv run python manage.py runserver 127.0.0.1:$(DEV_API_PORT) & \
		cd $(FRONTEND_DIR) && PORT=$(DEV_APP_PORT) VITE_DEV_API_PROXY=http://127.0.0.1:$(DEV_API_PORT) npm run dev)

# === Database Migrations ===
migrate: migrate-local

migrate-local: ENV_LOADER=$(LOAD_ENV_LOCAL)
migrate-local: ENV_DESC=Local Database
migrate-local: MIGRATE_ICON=...

migrate-dev: ENV_LOADER=$(LOAD_ENV_DEV)
migrate-dev: ENV_DESC=Dev Database (Neon)
migrate-dev: MIGRATE_ICON=...

migrate-local migrate-dev:
	@echo "$(MIGRATE_ICON) Migrating $(ENV_DESC)..."
	@$(ENV_LOADER) && cd $(BACKEND_DIR) && uv run python manage.py migrate

# === Other Utilities ===
superuser:
	cd $(BACKEND_DIR) && uv run python manage.py createsuperuser

# Night Eyes — re-runnable continuity + proposal-flow smoke test.
# Uses local Postgres + the same env loader as migrate-local so the OpenAI
# key + DATABASE_URL come from backend/.env (not the shell).
night-eyes-smoke:
	@echo "Running Night Eyes smoke test (Local Database + Live LLM)..."
	@$(LOAD_ENV_LOCAL) && cd $(BACKEND_DIR) && uv run python -m pytest -m smoke -v actions/tests/test_smoke_night_eyes.py

test:
	cd $(BACKEND_DIR) && uv run python manage.py test --parallel auto --noinput
	cd $(FRONTEND_DIR) && npm test -- --run

coverage:            ## backend unit-test coverage report (offline)
	cd $(BACKEND_DIR) && uv run coverage run --rcfile=../pyproject.toml manage.py test --noinput && uv run coverage report --rcfile=../pyproject.toml --sort=cover

verify:
	@scripts/verify.sh

docs-check:
	python3 scripts/docs_check.py

hooks:
	@git config core.hooksPath .githooks
	@echo "git hooks enabled (.githooks: commit-msg, pre-push). Paid AI commands never run here."

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type d -name ".ruff_cache" -exec rm -rf {} +
	rm -rf $(BACKEND_DIR)/db/logs/*.log
	rm -rf $(FRONTEND_DIR)/dist
