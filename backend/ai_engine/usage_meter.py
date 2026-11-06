"""Token usage meter — the single chokepoint that counts every LLM call.

Zero Django imports (this is `ai_engine`). It is a thin wrapper over
a LangChain usage handler on a *global* configure hook (registered once): every
chat-model `.invoke()/.ainvoke()/.stream()/.astream()` that runs inside the
`meter()` block is tracked automatically — no matter where the model
was constructed — using the real `AIMessage.usage_metadata` token counts
(works for OpenAI and Anthropic alike).

Usage (the Django side reads the total and settles it, `usage/services.py`):

    from ai_engine.usage_meter import meter, total_tokens, cost_usd

    with meter() as cb:
        ...run any AI work...
    spent = total_tokens(cb)        # real total tokens across every model used
    usd   = cost_usd(cb)            # Decimal real $ cost, priced call by call

Prices come from the `genai-prices` library (Pydantic's maintained price list),
not from numbers we keep ourselves. Each call is priced on its own from its
input, cached-input and output tokens, so per-call rate bands (e.g. gpt-5.4's
long-prompt rate) apply to the right call. The library's built-in prices are
used as shipped: new prices arrive by upgrading the package, never downloaded
at runtime. Which provider a model belongs to comes from providers.yml.

NOTE for streaming callers: OpenAI only emits usage on a streamed response when
the model is built with `stream_usage=True` (see night_eyes/graph.py).
Non-streaming `.invoke()` always reports usage.
"""
from __future__ import annotations

import contextvars
import functools
import logging
import threading
from collections.abc import Generator
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from typing import Any

logger = logging.getLogger("writerverse.ai_engine")

# Set from Django config at startup (usage/apps.py): True in DEBUG and under
# tests. Then an LLM call made outside a billed meter raises UnbilledCallError;
# otherwise it only logs a warning. Module flag, so ai_engine stays Django-free.
STRICT = False

# >0 while a BILLED meter is open (an AI unit, see ai_engine/units.py).
# An engine's own local `meter()` does not count: it measures, nobody settles it.
_BILLED: contextvars.ContextVar[int] = contextvars.ContextVar("usage_meter_billed", default=0)


# LangChain's `get_usage_metadata_callback()` registers a NEW global configure
# hook on every call and never removes it (a leak, one hook per meter). So we
# register one ContextVar once and set/reset it per `meter()` block instead.
_USAGE_VAR: contextvars.ContextVar[Any] = contextvars.ContextVar("usage_meter_handler", default=None)
_hook_lock = threading.Lock()
_hook_registered = False


def _ensure_hook() -> None:
    """Register the usage ContextVar with LangChain, once per process."""
    global _hook_registered
    if _hook_registered:
        return
    with _hook_lock:
        if not _hook_registered:
            from langchain_core.tracers.context import register_configure_hook

            register_configure_hook(_USAGE_VAR, inheritable=True)
            _hook_registered = True


@functools.lru_cache(maxsize=1)
def _usage_handler_class() -> type:
    """LangChain's usage handler, extended so a nested meter also feeds the meter
    it sits inside (the outer one still sees every call, as AI units expect).

    LangChain only keeps one running total per model. We also keep each call's
    own usage in `calls`, because a price can depend on the size of one call."""
    from langchain_core.callbacks import UsageMetadataCallbackHandler

    class _NestedUsageHandler(UsageMetadataCallbackHandler):
        def __init__(self, parent: Any = None, *, hold: bool = False) -> None:
            super().__init__()
            self._parent = parent
            self.calls: list[tuple[str, dict]] = []
            # hold=True: keep calls here and pass them up only on release()
            # (see `free_if`).
            self._held: list[tuple[Any, dict]] | None = [] if hold else None

        def on_llm_end(self, response: Any, **kwargs: Any) -> None:
            super().on_llm_end(response, **kwargs)
            call = _call_usage(response)
            if call is not None:
                with self._lock:
                    self.calls.append(call)
            if self._held is not None:
                with self._lock:
                    self._held.append((response, kwargs))
            elif self._parent is not None:
                self._parent.on_llm_end(response, **kwargs)

        def release(self) -> None:
            """Pass the held calls up to the meter around this one."""
            held, self._held = self._held or [], None
            if self._parent is not None:
                for response, kwargs in held:
                    self._parent.on_llm_end(response, **kwargs)

    return _NestedUsageHandler


def _call_usage(response: Any) -> tuple[str, dict] | None:
    """(model name, usage_metadata) of one LLM response, read the same way
    LangChain's handler reads it. None when the response reports no usage."""
    try:
        message = response.generations[0][0].message
        usage = message.usage_metadata
        model_name = message.response_metadata.get("model_name")
    except (AttributeError, IndexError):
        return None
    if not usage:
        return None
    if not model_name:
        # LangChain's own handler drops these too, so nobody would pay for it.
        logger.warning("LLM response reported usage but no model name; it can't be priced")
        return None
    return model_name, dict(usage)


class UnbilledCallError(RuntimeError):
    """An LLM call ran with no AI unit open, so its usage would go unrecorded."""


class PricingError(RuntimeError):
    """We can't price AI work: providers.yml can't load, a model isn't
    listed there, or the price library doesn't know it. We refuse rather than
    silently record $0."""


@contextmanager
def meter(*, billed: bool = False) -> Generator[Any, None, None]:
    """Context manager yielding a usage callback handler. Every chat-model call
    made inside the block accumulates onto `cb.usage_metadata`.

    `billed=True` marks it as the meter whose usage is settled (only
    `ai_engine.units.open_unit` passes it); `check_billed()` looks for one.

    No price check here: dispatch wraps EVERY capability (plain edits too) in
    a meter. The fail-closed check lives in `create_llm` via `check_priced`."""
    _ensure_hook()
    cb = _usage_handler_class()(parent=_USAGE_VAR.get())
    tok = _BILLED.set(_BILLED.get() + 1) if billed else None
    var_tok = _USAGE_VAR.set(cb)
    try:
        yield cb
    finally:
        _USAGE_VAR.reset(var_tok)
        if tok is not None:
            _BILLED.reset(tok)


@contextmanager
def free_if(exc_type: type[BaseException]) -> Generator[Any, None, None]:
    """Run the block on its own meter and pass its calls up to the meters
    around it only when the block ends. If it raises `exc_type`, the calls are
    dropped: they are never settled. Any other ending (success, or another
    error: SA-217) passes them up and they are settled as usual.

    `ask_json` uses it so an unreadable model reply is free (wrt-100)."""
    _ensure_hook()
    cb = _usage_handler_class()(parent=_USAGE_VAR.get(), hold=True)
    var_tok = _USAGE_VAR.set(cb)
    free = False
    try:
        yield cb
    except exc_type:
        free = True
        raise
    finally:
        _USAGE_VAR.reset(var_tok)
        if free:
            logger.info("dropped %d unpaid LLM call(s): %s", len(cb.calls), exc_type.__name__)
        else:
            cb.release()


def is_billed() -> bool:
    """True when a billed meter (an AI unit) is open on this context."""
    return _BILLED.get() > 0


def check_billed(model_name: str = "?") -> None:
    """Called as every LLM call starts (`create_llm` attaches it). No AI
    unit open → raise in STRICT mode (dev/tests), else log a warning."""
    if is_billed():
        return
    msg = (f"LLM call to {model_name!r} with no AI unit open: its usage is "
           "never recorded. Run AI work through dispatch() or a chat turn.")
    if STRICT:
        raise UnbilledCallError(msg)
    logger.warning(msg)


def total_tokens(cb: Any) -> int:
    """Sum `total_tokens` across every model the meter saw. 0 if nothing ran."""
    usage = getattr(cb, "usage_metadata", None) or {}
    return sum(int((v or {}).get("total_tokens", 0)) for v in usage.values())


def input_tokens(cb: Any) -> int:
    """Sum `input_tokens` (prompt tokens) across every model the meter saw."""
    usage = getattr(cb, "usage_metadata", None) or {}
    return sum(int((v or {}).get("input_tokens", 0)) for v in usage.values())


def output_tokens(cb: Any) -> int:
    """Sum `output_tokens` (completion tokens) across every model the meter saw."""
    usage = getattr(cb, "usage_metadata", None) or {}
    return sum(int((v or {}).get("output_tokens", 0)) for v in usage.values())


_PROVIDERS_PATH = Path(__file__).resolve().parent / "config" / "providers.yml"


@functools.lru_cache(maxsize=1)
def _model_providers() -> dict[str, str]:
    """{model name: provider id} for every model listed in providers.yml.
    Cached for the process lifetime (call `_model_providers.cache_clear()` to
    reload). Raises PricingError if the file is missing, broken or lists no
    models. lru_cache does not cache exceptions, so the next call retries."""
    import yaml  # PyYAML is a LangChain dependency, always present

    try:
        with _PROVIDERS_PATH.open() as f:
            data = yaml.safe_load(f) or {}
        providers = {
            model_name: provider_id
            for provider_id, provider_data in (data.get("providers") or {}).items()
            for model_name in ((provider_data or {}).get("models") or {})
        }
    except Exception as exc:
        raise PricingError(f"AI is off: can't load {_PROVIDERS_PATH.name}: {exc}") from exc
    if not providers:
        raise PricingError(f"AI is off: {_PROVIDERS_PATH.name} lists no models")
    return providers


_DATE_SUFFIX = None


def _strip_date_suffix(name: str) -> str:
    """Strip a provider's versioned date suffix:
    OpenAI "gpt-4o-mini-2024-07-18" → "gpt-4o-mini",
    Anthropic "claude-haiku-4-5-20251001" → "claude-haiku-4-5".
    No-op for names that don't end with -YYYY-MM-DD or -YYYYMMDD."""
    global _DATE_SUFFIX
    if _DATE_SUFFIX is None:
        import re
        _DATE_SUFFIX = re.compile(r"-\d{4}-?\d{2}-?\d{2}$")
    return _DATE_SUFFIX.sub("", name)


def _call_cost(model_name: str, usage: dict) -> Decimal:
    """Real $ cost of ONE call. API responses carry versioned names
    ("gpt-5.4-mini-2026-03-17"); providers.yml lists the base name, so the
    provider is looked up by either. The library is asked for the exact
    version first, since an old snapshot can have its own price.
    Raises PricingError for a model we can't price — never a silent $0."""
    from genai_prices import Usage, calc_price

    base = _strip_date_suffix(model_name)
    providers = _model_providers()
    provider = providers.get(model_name) or providers.get(base)
    if provider is None:
        raise PricingError(f"No price for model {model_name!r}: it is not listed in providers.yml")
    details = usage.get("input_token_details") or {}
    # Anthropic splits cache writes by how long they're kept (1h costs more);
    # LangChain then zeroes the plain `cache_creation` count. The library wants
    # the total plus the split.
    write_5m = int(details.get("ephemeral_5m_input_tokens") or 0)
    write_1h = int(details.get("ephemeral_1h_input_tokens") or 0)
    tokens = Usage(
        # input_tokens already includes the cached ones; the library prices
        # cached reads and writes at their own rates and the rest at full rate.
        input_tokens=int(usage.get("input_tokens") or 0),
        cache_read_tokens=int(details.get("cache_read") or 0),
        cache_write_tokens=int(details.get("cache_creation") or 0) + write_5m + write_1h,
        cache_write_5m_tokens=write_5m,
        cache_write_1h_tokens=write_1h,
        output_tokens=int(usage.get("output_tokens") or 0),
    )
    for ref in dict.fromkeys((model_name, base)):
        try:
            return calc_price(tokens, model_ref=ref, provider_id=provider).total_price
        except LookupError:
            continue
    raise PricingError(f"No price for model {model_name!r}: the genai-prices library doesn't know it")


def check_priced(model_name: str) -> None:
    """Raise PricingError unless we can price `model_name`. `create_llm` and the
    startup check call this before any model is built, so no unpriced API call runs."""
    _call_cost(model_name, {})


def cost_usd(cb: Any) -> Decimal:
    """Real $ cost the meter saw: the sum of every call's own price.
    A model we can't price → PricingError (never a silent $0)."""
    total = Decimal("0")
    for model_name, usage in getattr(cb, "calls", None) or []:
        total += _call_cost(model_name, usage)
    return total
