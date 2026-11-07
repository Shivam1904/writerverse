"""Execute layer — outline / threads page."""
from __future__ import annotations

import logging
from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

logger = logging.getLogger("writerverse.consistency")


def execute_merge(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    """Run the merge engine — places rough outline items into grand outline scenes."""
    from outline.engine.generation import run_merge_rough_into_grand
    rough = gathered["rough"]
    grand = gathered["grand"]
    logger.info(
        "run/merge project=%s rough_id=%s items=%d",
        ctx.project_id, gathered["rough_id"], len(rough.get("items") or []),
    )
    try:
        result = run_merge_rough_into_grand(rough, grand)
    except Exception as exc:
        logger.exception(
            "run/merge FAILED project=%s rough_id=%s",
            ctx.project_id, gathered["rough_id"],
        )
        raise CapabilityError("merge failed", 502) from exc
    return {
        "rough_id": gathered["rough_id"],
        "rough": rough,
        "grand": grand,
        **result,  # proposed_grand, placements, ran_at, usage, records
    }
