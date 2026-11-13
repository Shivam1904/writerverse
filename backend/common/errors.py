"""Shared exception reporting.

Pairs a server-side structured log (full traceback) with a user-safe message
and a short correlation id. Authors never see ORM/DB/stacktrace internals;
support/devs can map the friendly message back to the real exception via the
correlation id. Generalizes reviser P0-2 + Observability parts 1 & 2 across
every AI/persistence call site instead of one ad-hoc SSE path.

Only ids and the operation name are logged here — never user content.
"""

import logging
import sys
import uuid

from django.conf import settings
from rest_framework.response import Response

from common.turns import current_turn_id

# Tone-neutral default. Pass `message=` for a path-specific sentence
# (analysis vs. save) — but it must never contain exception text.
DEFAULT_MESSAGE = "Something went wrong on our side. Your work is safe — please try again."

logger = logging.getLogger("writerverse.errors")


def is_expected_failure(exc) -> bool:
    """True for an exception that is not a bug and carries its own public
    answer (`public_status`), e.g. ai_engine's AINotConfiguredError on a server
    with no AI key. Duck-typed, because `common` may not import `ai_engine`."""
    return bool(getattr(exc, "public_status", None))


def log_exception(log, msg, *args):
    """Call inside an ``except`` block in place of ``log.exception(msg, *args)``.

    A real error logs ERROR with its traceback, as before. An expected failure
    (see is_expected_failure) logs one WARNING line with the reason and no
    traceback, so a server without AI keys doesn't fill the log with stacks.
    """
    exc = sys.exc_info()[1]
    if exc is not None and is_expected_failure(exc):
        log.warning(msg + ": %s", *args, exc)
    else:
        log.exception(msg, *args)


def report_exception(exc, *, operation, project_id=None, user_action=None, log=None):
    """Log `exc` with structured context; return a short correlation id.

    An expected failure (see is_expected_failure) is one WARNING line with no
    traceback. Otherwise the traceback always goes to the ``writerverse.errors`` logger, which
    settings.LOGGING routes to the JSON error.log (SA-260). If the caller passes
    its own module logger as `log`, that logger also gets a one-line pointer
    (same correlation id, no traceback) so its module log shows the failure.
    """
    correlation_id = uuid.uuid4().hex[:12]
    if is_expected_failure(exc):
        (log or logger).warning(
            "operation=%s correlation_id=%s project_id=%s :: %s",
            operation, correlation_id, project_id, exc,
        )
        return correlation_id
    # turn_id (wrt-31) ties the error to the AI turn it happened in.
    logger.error(
        "operation=%s correlation_id=%s turn_id=%s project_id=%s user_action=%s :: %s",
        operation,
        correlation_id,
        current_turn_id(),
        project_id,
        user_action,
        exc,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    if log is not None and log is not logger:
        log.error("operation=%s failed, correlation_id=%s (traceback in error.log)",
                  operation, correlation_id)
    return correlation_id


def error_response(exc, *, operation, status, project_id=None, user_action=None,
                    message=None, log=None):
    """DRF Response with a user-safe message + correlation id; logs server-side.

    In local dev (settings.LOCAL_DEV) the response also includes `detail` with the raw exception string
    so developers can read it in the browser Network tab without grepping logs.
    """
    correlation_id = report_exception(
        exc, operation=operation, project_id=project_id,
        user_action=user_action, log=log,
    )
    payload = {"error": message or DEFAULT_MESSAGE, "correlation_id": correlation_id}
    if settings.LOCAL_DEV:
        payload["detail"] = str(exc)
    return Response(payload, status=status)


def sse_error_data(exc, *, operation, project_id=None, user_action=None,
                    message=None, log=None):
    """Payload for ``_sse("error", ...)`` — user-safe message + correlation id."""
    correlation_id = report_exception(
        exc, operation=operation, project_id=project_id,
        user_action=user_action, log=log,
    )
    return {"message": message or DEFAULT_MESSAGE, "correlation_id": correlation_id}


def custom_exception_handler(exc, context):
    """DRF EXCEPTION_HANDLER: sanitize unhandled 5xx, log full traceback.

    Handled DRF errors (4xx: validation, auth, not-found, throttle) pass
    through unchanged so clients still get actionable detail. Anything DRF
    didn't turn into a Response (an unhandled server error) is logged with a
    correlation id and returned as a generic 500 — no exception text leaks.

    An exception that carries its own public answer (`public_status`,
    `public_message`, `code` class attributes, e.g. ai_engine's
    AINotConfiguredError → 503 `ai_not_configured`) gets that answer instead.
    Duck-typed, because `common` may not import `ai_engine`.
    """
    from rest_framework.views import exception_handler

    response = exception_handler(exc, context)
    if response is not None:
        return response

    public_status = getattr(exc, "public_status", None)
    if public_status:
        logger.warning("%s: %s", type(exc).__name__, exc)
        return Response(
            {"error": exc.public_message, "code": exc.code}, status=public_status,
        )

    view = context.get("view")
    operation = type(view).__name__ if view is not None else "request"
    correlation_id = report_exception(exc, operation=operation)
    payload = {"error": DEFAULT_MESSAGE, "correlation_id": correlation_id}
    if settings.LOCAL_DEV:
        payload["detail"] = str(exc)
    return Response(payload, status=500)
