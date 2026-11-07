"""Execute layer — threads page (generate_thread, user_wishes_rough)."""
from __future__ import annotations

import logging
from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

from outline.engine.generation import run_generate_thread, run_user_wishes_rough

logger = logging.getLogger("writerverse.consistency")


def execute_generate_thread(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    logger.info(
        "run/generate_thread project=%s braindumps=%d",
        ctx.project_id, len(gathered["braindumps"]),
    )
    try:
        result = run_generate_thread(
            gathered["braindumps"],
            all_braindumps=gathered.get("all_braindumps"),
            synopsis=gathered["synopsis"],
            title=gathered["title"],
            existing_threads=gathered["existing_threads"],
            scope_type=gathered.get("scope_type"),
            scope_name=gathered.get("scope_name"),
        )
    except Exception as exc:
        logger.exception("run/generate_thread FAILED project=%s", ctx.project_id)
        raise CapabilityError("generate_thread failed", 502) from exc
    if not result or not result.get("plot_thread"):
        raise CapabilityError("engine returned no thread", 502)
    return result


def execute_generate_thread_from_description(
    ctx: DispatchContext, gathered: dict[str, Any],
) -> dict[str, Any]:
    """Same engine path as generate_thread — the gather already shaped the
    description into the braindumps slot, so this reuses run_generate_thread
    wholesale (no new prompt)."""
    logger.info("run/generate_thread_from_description project=%s", ctx.project_id)
    return execute_generate_thread(ctx, gathered)


def execute_user_wishes_rough(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    logger.info(
        "run/rough_user_wishes project=%s syn=%dc braindumps=%d",
        ctx.project_id, len(gathered["synopsis"]), len(gathered["braindumps"]),
    )
    try:
        wishes = run_user_wishes_rough(
            gathered["synopsis"], gathered["braindumps"],
            title=gathered["title"],
        )
    except Exception as exc:
        logger.exception("run/rough_user_wishes FAILED project=%s", ctx.project_id)
        raise CapabilityError("user_wishes failed", 502) from exc
    if not wishes or not wishes.get("rough_outline"):
        raise CapabilityError("engine returned no outline", 502)
    return wishes
