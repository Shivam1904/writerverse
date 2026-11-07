"""Activity log — the developer debug log (ActivityEvent rows).

Writers: log_step (an AI step finished), log_nudge_check (a shadow nudge
evaluation). AI cost (tokens, $) is NOT recorded here: `usage.AIUsage`
(written by `usage.services.settle`) is the one record.
Nothing here is shown to authors; read it in the Django admin. Logging must never break the
action being logged, so writers swallow and log their own errors.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from common.turns import current_turn_id
from django.utils import timezone

from activity.models import ActivityEvent

logger = logging.getLogger("writerverse.activity")

RETENTION_DAYS = 30


def _project_id(ctx):
    return getattr(ctx, "project_id", None)


def _with_turn(details: dict) -> dict:
    """Stamp the AI turn the event happened in (common/turns.py, wrt-31)."""
    turn_id = current_turn_id()
    return {**details, "turn_id": turn_id} if turn_id else details


def log_step(ctx, step: str, result: dict, **extra) -> None:
    """One AI pipeline step finished. `result` may carry `ran_at`; `extra` is
    step-specific detail (counts)."""
    project_id = _project_id(ctx)
    if not project_id:
        return
    try:
        ActivityEvent.objects.create(
            project_id=project_id, kind=ActivityEvent.STEP, name=step[:64],
            details=_with_turn({"ran_at": (result or {}).get("ran_at"), **extra}),
        )
    except Exception:
        logger.exception("activity/log_step failed project=%s step=%s", project_id, step)


def last_event_at(ctx, kind: str):
    """When this project last logged an event of `kind` (None if never)."""
    project_id = _project_id(ctx)
    if not project_id:
        return None
    return (ActivityEvent.objects.filter(project_id=project_id, kind=kind)
            .order_by("-created_at").values_list("created_at", flat=True).first())


def log_nudge_check(ctx, outcome: dict) -> None:
    """A shadow nudge evaluation: the signals seen and what WOULD have fired."""
    project_id = _project_id(ctx)
    if not project_id:
        return
    try:
        fired = [s.get("rule") for s in outcome.get("suggest") or []]
        ActivityEvent.objects.create(
            project_id=project_id, kind=ActivityEvent.NUDGE,
            name=(",".join(fired) or "none")[:64], details=_with_turn(outcome),
        )
    except Exception:
        logger.exception("activity/log_nudge_check failed project=%s", project_id)


def prune_old_events(project_id) -> int:
    """Delete this project's events older than RETENTION_DAYS."""
    cutoff = timezone.now() - timedelta(days=RETENTION_DAYS)
    deleted, _ = ActivityEvent.objects.filter(
        project_id=project_id, created_at__lt=cutoff,
    ).delete()
    return deleted
