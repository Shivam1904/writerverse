"""Gate and settle AI work: the two points where the AI policy is asked.

- `gate(user, feature)` runs BEFORE the model: a `Refusal` means don't run it.
- `settle(...)` runs AFTER the work (succeeded or crashed, SA-217): it records
  one `AIUsage` row and then hands the same usage to the policy's
  `after_ai_call`. It never raises: a finished result is never turned into an
  error by the bookkeeping after it.

Callers: `actions/capabilities/dispatch.py` and `night_eyes/stream.py`. They
bump the `ai_usage` domain when `settle` reports a change, so open tabs refresh.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from common.turns import current_turn_id

from .policy import Refusal, get_policy

logger = logging.getLogger("writerverse.usage")


@dataclass(frozen=True)
class Settled:
    """What `settle` did. `changed`: usage was recorded or the policy acted on
    it (refresh the usage views). `refusal`: the policy's answer after the call."""

    changed: bool = False
    refusal: Refusal | None = None


def owner_of(project_id: Any):
    """The user who owns the project (who the AI work is for), or None."""
    if not project_id:
        return None
    from django.contrib.auth import get_user_model
    from projects.models import Project

    user_id = (
        Project.objects.filter(pk=project_id)
        .values_list("user_id", flat=True)
        .first()
    )
    if not user_id:
        return None
    return get_user_model().objects.filter(pk=user_id).first()


def gate(user: Any, feature: str) -> Refusal | None:
    """Why `user` may not run AI `feature` now, or None. No user → allowed
    (there is nobody to settle with afterwards either)."""
    if user is None:
        return None
    return get_policy().check(user, feature)


def _spent(used: Any) -> bool:
    return bool(used.cost_usd > 0 or used.tokens_in > 0 or used.tokens_out > 0)


def _record(user: Any, feature: str, used: Any, key: str, label: str) -> None:
    """One AIUsage row per key: a retried settle records once."""
    from .models import AIUsage

    metadata: dict = {}
    turn_id = current_turn_id()
    if turn_id:
        metadata["turn_id"] = turn_id
    AIUsage.objects.get_or_create(
        idempotency_key=key,
        defaults={
            "user": user, "feature": feature, "label": label or "",
            "tokens_in": used.tokens_in, "tokens_out": used.tokens_out,
            "cost_usd": Decimal(str(used.cost_usd)), "metadata": metadata,
        },
    )


def settle(
    user: Any, feature: str, used: Any, key: str, *,
    succeeded: bool, label: str = "",
) -> Settled:
    """Record what one piece of AI work used, then tell the policy. Never raises.

    `used` is an `ai_engine.units.Usage`. `succeeded` is False when the work
    crashed or returned an error. Nothing spent and no own price → no-op."""
    if user is None:
        return Settled()
    spent = _spent(used)
    recorded = False
    if spent:
        try:
            _record(user, feature, used, key, label)
            recorded = True
        except Exception:  # noqa: BLE001 — bookkeeping never fails the work
            logger.exception("ai usage record failed feature=%s key=%s", feature, key)
    policy = get_policy()
    try:
        if not spent and not (succeeded and policy.has_own_price(feature)):
            return Settled(changed=recorded)
        refusal = policy.after_ai_call(
            user, used, feature, key, succeeded=succeeded, label=label,
        )
    except Exception:  # noqa: BLE001 — a policy hiccup never fails the work
        logger.exception("ai policy after_ai_call failed feature=%s key=%s", feature, key)
        return Settled(changed=recorded)
    return Settled(changed=True, refusal=refusal)
