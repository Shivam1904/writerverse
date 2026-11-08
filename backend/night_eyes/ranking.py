"""Deterministic tool ranking for budget-adaptive binding (agentic core).

The frame decides what's in-budget FIRST (reads → actions → secondary); the
rest of the `bound` catalogue follows in stable registry order; the profile's
tool_budget cuts the list. Globals are budget-exempt — they are the escape
hatch and must never be cut. `toolbox`-exposure capabilities are never
pre-bound (find_tools loads them).

Frame YAML entries may name a capability by registry name OR ai_name — both
resolve; unknown names are skipped silently (frames drift, ranking must not
crash the chat).
"""
from actions.capabilities.registry import all_capabilities
from actions.capabilities.spec import Actor

from .frames import GLOBAL_TOOL_NAMES, get_frame


def chat_capabilities():
    """Everything the dispatch gate lets chat call, regardless of exposure."""
    return [c for c in all_capabilities() if Actor.CHAT in c.actors]


def bound_capabilities():
    return [c for c in chat_capabilities() if c.chat_exposure == "bound"]


def rank_bound_tools(page, budget):
    """The capabilities to pre-bind this turn, in priority order."""
    frame = get_frame(page)
    frame_names = (
        (frame.get("reads") or [])
        + (frame.get("actions") or [])
        + (frame.get("secondary") or [])
    )
    caps = bound_capabilities()
    by_key = {}
    for c in caps:
        by_key.setdefault(c.name, c)
        by_key.setdefault(c.ai_name, c)

    picked, seen = [], set()

    def _take(c, into):
        if c is not None and c.name not in seen:
            into.append(c)
            seen.add(c.name)

    globals_ = []
    for n in GLOBAL_TOOL_NAMES:
        _take(by_key.get(n), globals_)
    for n in frame_names:
        _take(by_key.get(n), picked)
    for c in caps:
        _take(c, picked)
    return globals_ + picked[: max(0, int(budget))]
