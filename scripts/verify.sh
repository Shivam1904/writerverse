#!/usr/bin/env bash
# One offline check before review: lint (ruff + import layers + eslint), backend tests, typecheck, frontend tests, docs.
# Mirrors what CI runs, so "PASS here" means "green on GitHub".
# Prints ONE line per step; full logs go to $LOGDIR so agents don't pay for noise.
# Never calls a paid LLM. Needs local Postgres running (docker compose up -d).
#
#   scripts/verify.sh                       # everything
#   BACKEND_TESTS="outline characters" scripts/verify.sh   # only these backend apps
#   SKIP="frontend" scripts/verify.sh       # skip steps: lint imports eslint backend types frontend docs
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGDIR="${LOGDIR:-${TMPDIR:-/tmp}/wv-verify-$(basename "$ROOT")}"
mkdir -p "$LOGDIR"
fail=0

step() {  # step <name> <command...>
  local name="$1"; shift
  if [[ " ${SKIP:-} " == *" $name "* ]]; then echo "–  $name (skipped)"; return; fi
  local start=$SECONDS
  if (cd "$ROOT" && "$@") >"$LOGDIR/$name.log" 2>&1; then
    echo "✓  $name ($((SECONDS - start))s)"
  else
    fail=1
    echo "✗  $name ($((SECONDS - start))s) — last lines of $LOGDIR/$name.log:"
    tail -15 "$LOGDIR/$name.log" | sed 's/^/     /'
  fi
}

step lint     uv run ruff check backend/
step imports  bash -c "cd backend && uv run lint-imports --config ../pyproject.toml --no-logo"
step backend  bash -c "cd backend && uv run python manage.py test ${BACKEND_TESTS:-} --parallel auto --noinput"
step eslint   bash -c "cd frontend && npx eslint . --quiet"
step types    bash -c "cd frontend && npx tsc -b --noEmit"
step frontend bash -c "cd frontend && npm test -- --run"
step docs     python3 scripts/docs_check.py

if [[ $fail == 0 ]]; then echo "VERIFY: PASS"; else echo "VERIFY: FAIL (logs in $LOGDIR)"; fi
exit $fail
