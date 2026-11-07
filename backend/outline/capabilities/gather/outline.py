"""Gather layer — outline / threads page."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

from outline.store import load_outline


def gather_merge(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Load the source thread + grand outline from discovery for the merge.
    Caps refactor Phase 3: the source arg is `thread_id` (was `rough_id`) — the
    rough source IS a plot thread; internal key stays rough_id."""
    rough_id = args.get("thread_id") or args.get("rough_id")
    if not rough_id:
        raise CapabilityError("thread_id is required", 400)
    from outline.store import load_threads
    rough = next(
        (ro for ro in load_threads(ctx)
         if isinstance(ro, dict) and ro.get("id") == rough_id),
        None,
    )
    if not rough:
        raise CapabilityError(f"rough outline {rough_id} not found", 404)
    grand = load_outline(ctx)
    if not isinstance(grand, dict):
        raise CapabilityError("no grand outline — run init first", 400)
    return {
        "rough_id": rough_id,
        "rough": rough,
        "grand": grand,
    }
