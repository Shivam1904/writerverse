"""evaluate() — the awareness tick, run in SHADOW mode.

Computes signals and applies the starter rules under CONFIG, returning
{ran, suggest, gates, signals}. Nothing is shown to authors yet: the result is
written to the developer activity log (see run_shadow_nudges), so we can see
which nudges WOULD fire and why. CONFIG is the tunable table for the rules.

`page`/`focus` are accepted for a later page-aware pick; they're ignored today.
"""
import logging
from datetime import timedelta

from activity.models import ActivityEvent
from activity.store import last_event_at, log_nudge_check, prune_old_events
from django.utils import timezone

from .config import CONFIG
from .signals import compute_signals

# A project's nudges are checked at most this often (its page loads often).
SHADOW_EVERY = timedelta(minutes=30)

logger = logging.getLogger("writerverse.activity")


def _eval_wobble(signals):
    """#4 — offer 'see the shape' once there's enough to look at."""
    if signals["scene_count"] >= 3 and signals["people_count"] >= 2:
        return {
            "rule": "wobble_nudge",
            "capability": None,
            "label": "Want to see the shape so far?",
            "reason": f"{signals['scene_count']} scenes, {signals['people_count']} people",
        }
    return None


def _eval_verdict_gates(signals) -> dict:
    """#9 / #10 — withhold the verdict until there are enough scenes to call it."""
    sc = signals["scene_count"]
    if sc < CONFIG["withhold_verdict"]["threshold"]:
        return {"verdict_withheld": True}
    if sc >= CONFIG["show_verdict"]["threshold"]:
        return {"verdict_ready": True}
    return {}


def evaluate(ctx, page=None, focus=None, events=None) -> dict:
    signals = compute_signals(ctx, events)
    ran, suggest, gates = [], [], {}
    gates.update(_eval_verdict_gates(signals))
    wobble = _eval_wobble(signals)
    if wobble:
        suggest.append(wobble)
    public_signals = {k: v for k, v in signals.items() if k != "events"}
    return {"ran": ran, "suggest": suggest, "gates": gates, "signals": public_signals}


def run_shadow_nudges(ctx) -> None:
    """Evaluate the nudge rules and LOG the outcome (never shown to the author).
    Throttled to once per SHADOW_EVERY per project; also prunes old log rows.
    Must never break the caller, so all errors are swallowed (and logged)."""
    try:
        last = last_event_at(ctx, ActivityEvent.NUDGE)
        if last and timezone.now() - last < SHADOW_EVERY:
            return
        log_nudge_check(ctx, evaluate(ctx))
        prune_old_events(ctx.project_id)
    except Exception:
        logger.exception("shadow nudges failed project=%s", getattr(ctx, "project_id", None))
