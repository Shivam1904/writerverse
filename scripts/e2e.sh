#!/usr/bin/env bash
# End-to-end smoke test of the core author journey (write → save → reload → still there).
# Starts a private backend + frontend on their own ports and database, runs Playwright, stops them.
#
#   scripts/e2e.sh            # locally (needs Docker Postgres up: docker compose up -d)
#   CI=1 scripts/e2e.sh       # in GitHub Actions (DATABASE_URL points at the CI Postgres service)
#
# Never calls a paid LLM: the journey only saves prose, no AI features.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${E2E_API_PORT:-8700}"; APP_PORT="${E2E_APP_PORT:-5700}"
LOG="${TMPDIR:-/tmp}/wv-e2e"; mkdir -p "$LOG"
export E2E_EMAIL="e2e@writerverse.local" E2E_PASSWORD="e2e-pass-123"
export E2E_APP_URL="http://127.0.0.1:$APP_PORT" E2E_API_URL="http://127.0.0.1:$API_PORT"

# Local runs use a throwaway database next to the dev one; CI provides DATABASE_URL.
if [ -z "${CI:-}" ]; then
  BASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/backend/.env" | cut -d= -f2-)"
  docker exec writerverse-db dropdb -U writerverse_user --if-exists writerverse_e2e >/dev/null 2>&1
  docker exec writerverse-db createdb -U writerverse_user writerverse_e2e
  export DATABASE_URL="${BASE_URL%/*}/writerverse_e2e"
fi

# Safety: only ever touch the throwaway e2e database on this machine / the CI container.
case "${DATABASE_URL:-}" in
  *@localhost:*/writerverse_e2e|*@127.0.0.1:*/writerverse_e2e) ;;
  *) echo "refusing: DATABASE_URL must be a local .../writerverse_e2e database"; exit 1 ;;
esac
# Don't hijack ports another process is using (and don't let a stale server fake the health check).
if lsof -ti "tcp:$API_PORT" -ti "tcp:$APP_PORT" >/dev/null 2>&1; then
  echo "refusing: port $API_PORT or $APP_PORT is already in use"; exit 1
fi

cleanup() { kill "${API_PID:-}" "${APP_PID:-}" 2>/dev/null; lsof -ti "tcp:$API_PORT" -ti "tcp:$APP_PORT" 2>/dev/null | xargs kill 2>/dev/null; }
trap cleanup EXIT

cd "$ROOT/backend"
uv run python manage.py migrate --noinput >"$LOG/migrate.log" 2>&1 || { echo "migrate failed"; tail -20 "$LOG/migrate.log"; exit 1; }
uv run python manage.py shell -c "
from accounts.models import User
User.objects.filter(email='$E2E_EMAIL').exists() or User.objects.create_user(email='$E2E_EMAIL', password='$E2E_PASSWORD')
" >>"$LOG/migrate.log" 2>&1
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1 CORS_ALLOWED_ORIGINS="$E2E_APP_URL" \
  uv run python manage.py runserver "127.0.0.1:$API_PORT" --noreload >"$LOG/api.log" 2>&1 &
API_PID=$!

cd "$ROOT/frontend"
PORT=$APP_PORT VITE_DEV_API_PROXY="$E2E_API_URL" VITE_API_URL="$E2E_API_URL/api" \
  npx vite --host 127.0.0.1 --port "$APP_PORT" --strictPort >"$LOG/app.log" 2>&1 &
APP_PID=$!

for _ in $(seq 60); do
  curl -sf "$E2E_API_URL/health/" >/dev/null && curl -sf "$E2E_APP_URL/" >/dev/null && break
  sleep 1
done
curl -sf "$E2E_APP_URL/" >/dev/null || { echo "app didn't start — logs in $LOG"; tail -20 "$LOG/api.log" "$LOG/app.log"; exit 1; }

npx playwright test --config e2e/playwright.config.ts
