"""Startup system checks.

Registered from ProjectsConfig.ready(). These run on every manage.py command
(including `runserver`). Warnings print at boot; Errors stop the command.
"""

from django.conf import settings
from django.core.checks import Error, Warning, register


@register()
def ai_config_valid(app_configs, **kwargs):
    """Fail at startup on a broken providers.yml, not at the first AI call
    (SA-236, SA-256), and say at startup which AI can't run for lack of a key.

    providers.yml problems (a role naming an unlisted or unpriced model, a
    missing chat profile) are Errors: the server doesn't start. Missing API
    keys are only Warnings: the app runs with no AI keys, or with one
    provider's key (each role falls back to a model whose key is set), and an
    AI feature that can't run answers HTTP 503 `ai_not_configured`. The key
    warnings are skipped with AI_ENABLED=False and under the test runner.
    """
    from ai_engine.config import AIConfigError, get_ai_config

    try:
        ai_config = get_ai_config()
        problems = ai_config.validate()
    except AIConfigError as exc:
        return [_config_error(str(exc))]
    found = [_config_error(problem) for problem in problems]
    if settings.AI_ENABLED and not settings.RUNNING_TESTS and not problems:
        found += [
            Warning(
                warning,
                hint=(
                    "Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY in backend/.env "
                    "to turn AI on, or AI_ENABLED=False to hide this warning."
                ),
                id="writerverse.W002",
            )
            for warning in ai_config.key_warnings()
        ]
    return found


def _config_error(problem: str) -> Error:
    return Error(
        problem,
        hint="Fix backend/ai_engine/config/providers.yml, then restart.",
        id="writerverse.E001",
    )


@register()
def ai_requires_postgres(app_configs, **kwargs):
    """Hard-warn when the AI stack is active on a non-Postgres backend.

    The app is built for PostgreSQL: per-project write locks (SELECT … FOR
    UPDATE), JSON queries, and the pgvector extension kept for meaning-search
    (SA-311). The test suite also runs on SQLite, but a real server should not.
    """
    if not getattr(settings, "AI_ENABLED", False):
        return []

    engine = settings.DATABASES.get("default", {}).get("ENGINE", "")
    if "postgresql" in engine:
        return []

    return [
        Warning(
            "AI_ENABLED is true but the database backend is not PostgreSQL "
            f"(ENGINE={engine!r}). The app is built for PostgreSQL (write locks, "
            "JSON queries); run the server on Postgres.",
            hint=(
                "Point DATABASE_URL in backend/.env at local Postgres and run "
                "`make up && make migrate-local`, or set AI_ENABLED=False if "
                "you intentionally want a no-AI run."
            ),
            id="writerverse.W001",
        )
    ]
