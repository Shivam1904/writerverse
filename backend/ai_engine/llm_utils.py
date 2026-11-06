from __future__ import annotations

import json
import logging
from typing import Any

from ai_engine import call_log
from ai_engine.config import AINotConfiguredError, get_ai_config
from ai_engine.usage_meter import check_billed, check_priced, free_if

logger = logging.getLogger("writerverse.ai_engine")

# Retries after a failed call (timeout, 429, 5xx). The SDK default is 2, so a
# stuck call could hold a request for 3 × timeout; one retry bounds the worst
# case at 2 × the role's providers.yml `timeout`. A model entry may set its own
# `max_retries`.
DEFAULT_MAX_RETRIES = 1

# (role, provider, model) already warned about a missing backup key: warn once
# per process, not on every call.
_WARNED_LEFT_OUT: set[tuple[str, str, str]] = set()


def _require_unit_handler(model: str) -> Any:
    """A callback that runs `check_billed` as each call on this model starts.
    The check runs per call, not at build time: the chat model is built before
    the turn's AI unit opens."""
    from langchain_core.callbacks import BaseCallbackHandler

    class _RequireUnit(BaseCallbackHandler):
        raise_error = True  # let UnbilledCallError stop the call
        run_inline = True   # async runs: check on the caller's context

        def on_chat_model_start(self, *args: Any, **kwargs: Any) -> None:
            check_billed(model)

        def on_llm_start(self, *args: Any, **kwargs: Any) -> None:
            check_billed(model)

    return _RequireUnit()


def _fallback_errors() -> tuple[type[BaseException], ...]:
    """Errors that move a call on to the role's next model: the provider is
    down or slow, our key is refused, or we hit its rate limit. A bad request
    (400) or a refused prompt is not here: the backup would fail the same way."""
    import anthropic
    import openai

    return tuple(
        getattr(sdk, name)
        for sdk in (openai, anthropic)
        for name in ("APIConnectionError", "AuthenticationError", "PermissionDeniedError",
                     "RateLimitError", "InternalServerError", "OverloadedError")
        if hasattr(sdk, name)
    )


def create_llm(role: str = "small", temperature: float | None = 0, **kwargs: Any) -> Any:
    """Single LLM factory — every chat-model instantiation goes through here.

    Provider comes from the role's entry in providers.yml, so pointing a role
    at an Anthropic model in config is all it takes to switch providers.
    `temperature=None` means "use the model's configured temperature"
    (providers.yml, default 0.7); the literal default stays 0 for the
    deterministic ask_json/extraction callers. Extra kwargs (stream_usage,
    model_kwargs, timeout, max_retries, ...) pass through to the client.

    Backups (wrt-71): a role may list `fallbacks:` in providers.yml. Then the
    model returned tries the main model first and, on an outage, a refused key
    or a rate limit (`_fallback_errors`), the next one in order. It is still a
    normal LangChain runnable: `bind_tools` / `with_structured_output` apply to
    every model in the chain. A backup whose API key is unset is left out
    (with a warning), so a dev machine with one key still works.

    Fails closed otherwise. Each of these raises before any chat client is
    built, so no call goes out:
    - unknown role, or a role (or fallback) whose provider/model isn't in
      providers.yml → AIConfigError naming the role (SA-256);
    - providers.yml can't load, or the price library doesn't know a model in
      the chain → PricingError (SA-125);
    - no model in the chain has its API key env var set → AINotConfiguredError
      (an AIConfigError; views answer HTTP 503 `ai_not_configured`, SA-236).

    Every call on the model also checks an AI unit is open (see
    `usage_meter.check_billed`): raises in dev/tests, warns in prod.

    Every client gets the model's providers.yml `timeout` (seconds),
    `max_tokens` (output cap) and `max_retries` (default
    DEFAULT_MAX_RETRIES), so no call can hang or run on without limit.
    A caller's own kwargs win.
    """
    chain = get_ai_config().get_models_for_role(role)
    for cfg in chain:
        check_priced(cfg["model"])
    usable = [cfg for cfg in chain if cfg.get("api_key")]
    if not usable:
        main = chain[0]
        raise AINotConfiguredError(
            f"AI role {role!r} needs {main.get('api_key_env') or 'an API key'} "
            f"(provider {main['provider']!r}), but it is not set"
        )
    for cfg in chain:
        left_out = (role, cfg["provider"], cfg["model"])
        if not cfg.get("api_key") and left_out not in _WARNED_LEFT_OUT:
            _WARNED_LEFT_OUT.add(left_out)
            logger.warning(
                "AI role %r: %s is not set, so %s/%s is left out of the chain",
                role, cfg.get("api_key_env") or "the API key", cfg["provider"], cfg["model"],
            )
    clients = [_build_client(cfg, temperature, dict(kwargs)) for cfg in usable]
    if len(clients) == 1:
        return clients[0]
    return clients[0].with_fallbacks(clients[1:], exceptions_to_handle=_fallback_errors())


def _build_client(cfg: dict[str, Any], temperature: float | None, kwargs: dict[str, Any]) -> Any:
    """One chat client for one provider/model entry (see create_llm)."""
    model = cfg["model"]
    if temperature is None:
        temperature = cfg.get("temperature", 0.7)
    is_anthropic = cfg["provider"] == "anthropic"
    if cfg.get("base_url"):
        kwargs.setdefault("base_url", cfg["base_url"])
    kwargs["callbacks"] = [*(kwargs.get("callbacks") or []), _require_unit_handler(model)]
    if call_log.enabled():  # dev only: full prompt + reply to db/logs (wrt-32)
        kwargs["callbacks"].append(call_log.call_log_handler(model))
    # validate() makes every role's model set timeout + max_tokens.
    kwargs.setdefault("timeout", cfg["timeout"])
    kwargs.setdefault("max_tokens", cfg["max_tokens"])
    kwargs.setdefault("max_retries", cfg.get("max_retries", DEFAULT_MAX_RETRIES))

    if is_anthropic:
        from langchain_anthropic import ChatAnthropic

        # OpenAI-only knobs — drop rather than error so callers stay
        # provider-agnostic. ChatAnthropic always reports stream usage, and
        # parallel_tool_calls is an OpenAI model_kwarg.
        kwargs.pop("stream_usage", None)
        kwargs.pop("model_kwargs", None)
        # Opus 4.7+/Fable removed sampling params — sending temperature 400s.
        # Haiku 4.5 / Sonnet 4.6 still accept it.
        if not model.startswith(("claude-opus-4-7", "claude-opus-4-8",
                                 "claude-fable", "claude-mythos")):
            kwargs["temperature"] = temperature
        return ChatAnthropic(api_key=cfg.get("api_key"), model=model, **kwargs)

    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        api_key=cfg.get("api_key"),
        model=model,
        temperature=temperature,
        **kwargs,
    )


class UnreadableReply(ValueError):
    """The model's reply could not be read (no valid JSON of the asked-for
    shape after the retry).
    Calls that end this way are free: `ask_json` drops their tokens from the
    bill (wrt-100). A ValueError, so existing `except ValueError` still works."""


def ask_json(prompt: str, role: str = "small", tag: str = "?", *,
             expect: type | tuple[type, ...] | None = None) -> Any:
    """Call LLM, strip markdown fences, parse JSON, one retry.

    `expect` (`list` or `dict`) is the reply's shape: a reply of another shape
    counts as unreadable, like broken JSON. When the second attempt is still
    unreadable it raises UnreadableReply (a ValueError), never an empty result,
    so a check can't report "found nothing" when it couldn't read the answer
    (wrt-20). Both attempts are then free: their tokens never reach the AI
    unit, so a run that fails only because of it records 0, while the
    rest of the run is still settled (wrt-100)."""
    with free_if(UnreadableReply):
        return _ask_json(prompt, role, tag, expect)


def _ask_json(prompt: str, role: str, tag: str, expect: type | tuple[type, ...] | None) -> Any:
    for attempt in (1, 2):
        raw = create_llm(role).invoke(prompt).content.strip()
        raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        logger.debug(
            "llm tag=%s role=%s attempt=%s req=%dc resp=%dc",
            tag, role, attempt, len(prompt), len(raw),
        )
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = _BAD
        if parsed is not _BAD and (expect is None or isinstance(parsed, expect)):
            return parsed
        if attempt == 1:
            prompt += "\n\nReturn ONLY valid JSON. No prose."
    logger.warning("llm json unreadable tag=%s role=%s head=%r", tag, role, raw[:120])
    raise UnreadableReply(f"LLM returned invalid JSON (tag={tag})")


_BAD = object()  # sentinel: the reply was not valid JSON
