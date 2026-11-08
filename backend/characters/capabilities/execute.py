"""Execute layer — characters page."""
from __future__ import annotations

import logging
from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

logger = logging.getLogger("writerverse.consistency")


def execute_generate_portrait(ctx: DispatchContext, gathered: dict[str, Any]) -> dict[str, Any]:
    """Generate a transparent-background PNG and save it to file storage. Returns its URL.

    Either step failing is a clean 502 with no result, so a policy that gives
    portraits their own price only sees a finished portrait (see dispatch)."""
    from ai_engine.config import AINotConfiguredError
    from ai_engine.image_gen import ImageGenError, generate_portrait_png

    from characters.portraits import save_portrait

    try:
        png, tokens = generate_portrait_png(gathered["description"])
    except AINotConfiguredError:
        raise  # no image key on this server: the dispatcher answers 503
    except ImageGenError as exc:
        logger.warning("generate_portrait failed project=%s: %s", ctx.project_id, exc)
        raise CapabilityError(f"portrait generation failed: {exc}", 502) from exc
    except Exception as exc:
        logger.exception("generate_portrait crashed project=%s", ctx.project_id)
        raise CapabilityError("portrait generation failed", 502) from exc

    try:
        url = save_portrait(ctx.project_id, gathered["character_id"], png)
    except Exception as exc:
        logger.exception("generate_portrait save failed project=%s", ctx.project_id)
        raise CapabilityError(
            "The portrait was made but couldn't be saved. You were not charged. "
            "Please try again.",
            502,
        ) from exc
    # The image API runs outside the LangChain usage meter, so the AI policy
    # may give this feature its own fixed price (AIPolicy.has_own_price), not tokens.
    # `_ai_tokens` is informational only.
    return {
        "character_id": gathered["character_id"],
        "portrait_url": url,
        "_ai_tokens": tokens,
    }
