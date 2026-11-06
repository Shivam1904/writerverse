"""Where the backend is running, and which settings it must have there.

Three runtimes:

- **production**: the live Vercel deployment (Vercel sets ``VERCEL_ENV=production``).
- **preview**: any other Vercel deployment (``VERCEL_ENV=preview``).
- **local**: everything else: a laptop, the test suite, CI, ``vercel dev``.

A server that is not on Vercel (a VPS, Fly, Docker) declares itself with
``WRITERVERSE_ENV=production`` (or ``preview``). Without it, it counts as local
and gets the dev defaults, which are unsafe on a public server.

Locally, a missing setting falls back to a dev default (``localhost`` URLs,
a throwaway key) so ``make local`` just works. In a deployed runtime those
defaults are wrong (e.g. a password-reset email linking to localhost), so a
missing setting stops the server at startup with one message that names
every missing variable.

The other way round, a laptop must never talk to the production database by
accident (one wrong ``DATABASE_URL`` in ``backend/.env``). Locally, a production
database host stops startup unless ``ALLOW_PRODUCTION_DATABASE=true`` is set on
purpose (the GitHub Actions migrate job does this).
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import NamedTuple
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

PRODUCTION = "production"
PREVIEW = "preview"
LOCAL = "local"
DEPLOYED = (PRODUCTION, PREVIEW)


class Required(NamedTuple):
    """One env var that must be set in the given runtimes."""

    name: str
    runtimes: tuple[str, ...] = DEPLOYED
    # Other names that count as setting it (older spellings).
    also_accepts: tuple[str, ...] = ()


# Add a line here to make another setting required.
REQUIRED = (
    Required("DJANGO_SECRET_KEY", also_accepts=("SECRET_KEY",)),
    Required("DATABASE_URL"),
    Required("CORS_ALLOWED_ORIGINS"),
    Required("FRONTEND_URL"),
    Required("DEFAULT_FROM_EMAIL"),
)


# Env var a non-Vercel deployment sets to say what it is.
RUNTIME_OVERRIDE = "WRITERVERSE_ENV"


def detect_runtime(env: Mapping[str, str]) -> str:
    """production, preview or local: WRITERVERSE_ENV first, then Vercel's env vars."""
    declared = (env.get(RUNTIME_OVERRIDE) or "").strip().lower()
    if declared in DEPLOYED:
        return declared
    if declared and declared != LOCAL:
        raise ImproperlyConfigured(
            f"{RUNTIME_OVERRIDE}={declared!r} is not a runtime. Use production, preview or local."
        )
    vercel_env = env.get("VERCEL_ENV", "")
    if vercel_env in (PRODUCTION, PREVIEW):
        return vercel_env
    if vercel_env == "development":  # `vercel dev` on a laptop
        return LOCAL
    if env.get("VERCEL") == "1":
        # On Vercel but the stage is unknown: treat it as deployed, never as local.
        return PREVIEW
    return LOCAL


def all_names(required: tuple[Required, ...] = REQUIRED) -> list[str]:
    """Every env var name the check reads (main names and accepted aliases)."""
    return [n for r in required for n in (r.name, *r.also_accepts)]


def missing_settings(
    runtime: str, env: Mapping[str, str], required: tuple[Required, ...] = REQUIRED
) -> list[str]:
    """Names required in this runtime that are unset or blank in ``env``."""
    return [
        r.name
        for r in required
        if runtime in r.runtimes
        and not any((env.get(n) or "").strip() for n in (r.name, *r.also_accepts))
    ]


def check_required_settings(
    runtime: str, env: Mapping[str, str], required: tuple[Required, ...] = REQUIRED
) -> None:
    """Stop startup if this runtime is missing any required setting."""
    missing = missing_settings(runtime, env, required)
    if missing:
        raise ImproperlyConfigured(
            f"Missing required settings for the {runtime} runtime: "
            + ", ".join(missing)
            + ". Set them in this deployment's environment variables "
            "(see docs/system/stack-and-services.md)."
        )


# Secret keys that are public (in .env.example, in this file, or Django's
# startproject prefix). Anyone could sign JWTs with them, so only a local dev
# run may use them.
INSECURE_SECRET_KEYS = ("local-dev-only-change-me", "insecure-local-dev-key")
INSECURE_SECRET_PREFIX = "django-insecure-"
LOOPBACK_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "::1")


def is_loopback_url(url: str) -> bool:
    """True when the URL points at this machine (localhost, 127.0.0.1, ...)."""
    return (urlsplit((url or "").strip()).hostname or "") in LOOPBACK_HOSTS


def is_local_dev(runtime: str, debug: bool, frontend_url: str) -> bool:
    """A developer's own machine: local runtime, DEBUG on, frontend on localhost.

    Dev conveniences (the reset link in the API answer, the log viewer) need
    all three, so a public server that copied .env.example (DEBUG=True) but
    points FRONTEND_URL at its real domain does not get them.
    """
    return runtime == LOCAL and debug and is_loopback_url(frontend_url)


def is_insecure_secret_key(secret_key: str) -> bool:
    key = (secret_key or "").strip()
    return not key or key in INSECURE_SECRET_KEYS or key.startswith(INSECURE_SECRET_PREFIX)


def check_secret_key(secret_key: str, local_dev: bool) -> None:
    """Stop startup when a non-dev server would sign tokens with a public key."""
    if local_dev or not is_insecure_secret_key(secret_key):
        return
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY is empty or a known example value. Outside local dev "
        "(DEBUG on, local runtime, FRONTEND_URL on localhost) set a long random "
        "key, e.g. `python -c \"import secrets; print(secrets.token_urlsafe(50))\"`."
    )


# Env var: comma-separated first labels of the production database host(s),
# e.g. "ep-example-123456" for ep-example-123456.us-east-1.aws.neon.tech (the
# "-pooler" host counts too). Not a secret. Unset = no guard (e.g. a fork with
# no production database). Set it in backend/.env on any machine that has
# production credentials around.
PRODUCTION_DB_ENDPOINTS = "PRODUCTION_DB_ENDPOINTS"
ALLOW_PRODUCTION_DATABASE = "ALLOW_PRODUCTION_DATABASE"


def production_db_endpoints(env: Mapping[str, str]) -> tuple[str, ...]:
    """The production endpoint ids named in ``PRODUCTION_DB_ENDPOINTS``."""
    raw = env.get(PRODUCTION_DB_ENDPOINTS) or ""
    return tuple(ep.strip() for ep in raw.split(",") if ep.strip())


def is_production_database(database_url: str, endpoints: tuple[str, ...]) -> bool:
    """True when the URL's host is a production endpoint (direct or -pooler)."""
    host = urlsplit((database_url or "").strip()).hostname or ""
    first_label = host.split(".", 1)[0]
    return any(first_label in (ep, f"{ep}-pooler") for ep in endpoints)


def check_database_runtime(
    runtime: str,
    env: Mapping[str, str],
    endpoints: tuple[str, ...] | None = None,
) -> None:
    """Stop a local run that points at the production database, unless allowed.
    ``endpoints`` defaults to ``PRODUCTION_DB_ENDPOINTS`` from ``env``."""
    if runtime != LOCAL:
        return
    if endpoints is None:
        endpoints = production_db_endpoints(env)
    if not is_production_database(env.get("DATABASE_URL", ""), endpoints):
        return
    allowed = (env.get(ALLOW_PRODUCTION_DATABASE) or "").strip().lower()
    if allowed in ("1", "true", "yes"):
        return
    raise ImproperlyConfigured(
        "DATABASE_URL points at the PRODUCTION database, but this is a local run "
        "(laptop, tests or CI). Use local Postgres (make up) instead. If you really "
        f"mean to touch production, set {ALLOW_PRODUCTION_DATABASE}=true for that one "
        "command (see docs/system/stack-and-services.md)."
    )
