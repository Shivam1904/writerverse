"""Image generation — provider-agnostic, zero Django.

One job: turn a text description into a PNG of *just the character* on a
transparent background. We use OpenAI's `gpt-image-1`, which can return a
transparent PNG natively (`background="transparent"`), so the foreground
character comes back with no scenery and we don't need a separate
background-removal pass.

Callers get raw PNG bytes back and decide where to persist them (the Django
side saves to media). This module never touches the DB or the filesystem.
"""
from __future__ import annotations

import base64
import logging

from langsmith import traceable

logger = logging.getLogger("writerverse.ai_engine")


class ImageGenError(Exception):
    """Image generation failed (no key, provider error, empty response)."""


# Wrap the author's free-text description so the model renders a single isolated
# subject — no environment to leak past the transparent background.
_PROMPT = (
    "Full-length character illustration of: {desc}. "
    "Show the ENTIRE figure from the top of the head down to the feet, fully "
    "inside the frame with generous empty margin on every side — the head and "
    "the feet must not be cropped or touch any edge. Single isolated subject, "
    "centered, standing, facing forward. No background, no scenery, no floor, "
    "no shadow — plain transparent background, character only."
)


def _usage_tokens(resp) -> dict:
    """Token counts the image model reported on `resp` (zeros if absent)."""
    usage = getattr(resp, "usage", None)
    out = {}
    for src, dst in (
        ("input_tokens", "input_tokens"),
        ("output_tokens", "output_tokens"),
        ("total_tokens", "total_tokens"),
    ):
        try:
            out[dst] = int(getattr(usage, src, 0) or 0)
        except (TypeError, ValueError):
            out[dst] = 0
    return out


def _trace_outputs(resp) -> dict:
    """What LangSmith records for the image call: token usage only.

    Never the image itself — the base64 PNG is megabytes and useless in a trace.
    `usage_metadata` is the key LangSmith reads to show tokens and cost.
    """
    has_image = bool(getattr(resp, "data", None)) and bool(
        getattr(resp.data[0], "b64_json", None)
    )
    return {"has_image": has_image, "usage_metadata": _usage_tokens(resp)}


# The raw OpenAI SDK is not traced by LangChain, so this one call is wrapped by
# hand. LangSmith only records it when tracing is on (LANGSMITH_TRACING);
# otherwise `traceable` is a no-op. Inputs follow LANGSMITH_HIDE_INPUTS like
# every other trace.
@traceable(
    run_type="llm",
    name="image_gen.portrait",
    process_inputs=lambda inputs: {k: v for k, v in inputs.items() if k != "client"},
    process_outputs=_trace_outputs,
)
def _images_generate(client, **params):
    return client.images.generate(**params)


def generate_portrait_png(description: str) -> tuple[bytes, int]:
    """Generate a transparent-background PNG from `description`.

    Returns `(png_bytes, tokens_spent)` — the image model reports token usage on
    the response (0 if absent). This call runs outside the usage meter, so
    an AI policy may give portraits a fixed price per image (`has_own_price`).

    Raises ImageGenError on a provider error or an empty/invalid response so
    the caller can surface a clean message, and AINotConfiguredError when the
    image provider's API key is not set (the caller answers 503).
    """
    desc = (description or "").strip()
    if not desc:
        raise ImageGenError("a description is required")

    from ai_engine.config import AINotConfiguredError, get_ai_config  # zero Django

    ai_config = get_ai_config()
    cfg = ai_config.get_image_config()
    api_key = cfg.get("api_key")
    if not api_key:
        env = ai_config.api_key_env(cfg.get("provider") or "") or "an API key"
        raise AINotConfiguredError(f"image generation needs {env}, but it is not set")

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        resp = _images_generate(
            client,
            langsmith_extra={
                "metadata": {"ls_provider": "openai", "ls_model_name": cfg["model"]},
            },
            model=cfg["model"],  # required; the startup check validates it
            prompt=_PROMPT.format(desc=desc),
            size=cfg.get("size", "1024x1024"),
            quality=cfg.get("quality", "medium"),
            background=cfg.get("background", "transparent"),
            n=1,
        )
    except Exception as exc:  # provider/network/auth — caller maps to 502
        logger.exception("image generation request failed")
        raise ImageGenError(str(exc)) from exc

    b64 = None
    if getattr(resp, "data", None):
        b64 = getattr(resp.data[0], "b64_json", None)
    if not b64:
        raise ImageGenError("image generation returned no image data")

    try:
        png = base64.b64decode(b64)
    except Exception as exc:
        raise ImageGenError("image generation returned malformed data") from exc

    # gpt-image-1 reports token usage on the response — charge it like any LLM call.
    return png, _usage_tokens(resp)["total_tokens"]
