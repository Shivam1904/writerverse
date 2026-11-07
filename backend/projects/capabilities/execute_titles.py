"""Execute layer — title generation (global utility; calls ai_engine)."""
from __future__ import annotations

import logging
from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext
from outline.engine.generation import generate_title

logger = logging.getLogger("writerverse.consistency")


def execute_generate_title(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    """Few-word title from a free-text `description`. Reads nothing else.

    Returns the clean caller contract {title, alternatives} — the engine's
    usage/records bookkeeping is dropped here; callers only want the names.
    """
    description = (gathered.get("description") or "").strip()
    if not description:
        raise CapabilityError("description required", 400)
    case = gathered.get("case") or "title"
    if case not in ("title", "sentence"):
        raise CapabilityError('case must be "title" or "sentence"', 400)
    logger.info("run/generate-title project=%s desc_len=%d",
                ctx.project_id, len(description))
    try:
        result = generate_title(description, case=case)
    except Exception as exc:
        logger.exception("run/generate-title FAILED project=%s", ctx.project_id)
        raise CapabilityError("title generation failed", 502) from exc
    return {
        "title": result.get("title", ""),
        "alternatives": result.get("alternatives", []),
    }
