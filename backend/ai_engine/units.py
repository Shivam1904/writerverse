"""AI units: which piece of AI work owns the tokens it spends.

The rule (SA-211):

- The OUTERMOST piece of AI work is an **AI unit**: a chat turn
  (`night_eyes/stream.py`) or a top-level `dispatch()`. It is the only thing that
  settles its tokens (`usage/services.py` `settle`): once, under its own
  idempotency key, when it closes.
- Everything that runs inside it (chat tool calls, auto-apply, accepts,
  follow-ups) adds its tokens to the unit's meter and never settles them itself.
- One exception: a nested feature the AI policy says has its OWN price
  (`AIPolicy.has_own_price`) keeps that price wherever it runs. Its tokens are
  carved out of the unit's metered total and settled once under a key derived
  from the unit's key (`<unit key>:<feature>:<n>`).
- The unit's tokens are settled whether the work succeeded or failed
  (SA-217): a crash after 200k tokens still used those tokens.

The unit lives in a contextvar, so it follows the work into the threads LangChain
uses for sync tools (they copy the context). A plain `threading.Thread` starts with
an EMPTY context and would open a new unit; so far the only one is the chat
producer thread, which is exactly where the chat unit is opened.
"""
from __future__ import annotations

import contextvars
import itertools
import uuid
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

_CURRENT: contextvars.ContextVar[AIUnit | None] = contextvars.ContextVar(
    "ai_unit", default=None,
)


@dataclass(frozen=True)
class Usage:
    """Metered spend of one piece of AI work: real $ cost plus token counts."""

    cost_usd: Decimal = Decimal("0")
    tokens_in: int = 0
    tokens_out: int = 0


def usage_of(cb: Any) -> Usage:
    """Read a meter callback into a Usage."""
    from ai_engine.usage_meter import cost_usd, input_tokens, output_tokens
    return Usage(cost_usd(cb), input_tokens(cb), output_tokens(cb))


@dataclass
class AIUnit:
    """One unit of AI work. `feature` is the feature key its tokens are settled
    under; `key` is its idempotency key, fixed when the unit opens."""

    feature: str
    key: str
    cb: Any = None
    _carved: list[Any] = field(default_factory=list)
    _seq: Any = field(default_factory=lambda: itertools.count(1))

    def usage(self) -> Usage:
        """Tokens this unit pays for: everything metered, minus carve-outs."""
        total = usage_of(self.cb)
        for sub in self._carved:
            part = usage_of(sub)
            total = Usage(
                total.cost_usd - part.cost_usd,
                total.tokens_in - part.tokens_in,
                total.tokens_out - part.tokens_out,
            )
        return Usage(
            max(total.cost_usd, Decimal("0")),
            max(total.tokens_in, 0),
            max(total.tokens_out, 0),
        )

    def child_key(self, feature: str) -> str:
        """Idempotency key for a nested own-priced feature. `itertools.count`
        is thread-safe enough here (chat tools may run in parallel)."""
        return f"{self.key}:{feature}:{next(self._seq)}"

    @contextmanager
    def carve_out(self) -> Generator[Any, None, None]:
        """Meter a nested own-priced feature on its own and take its tokens out
        of this unit's metered total. Yields the sub-meter."""
        from ai_engine.usage_meter import meter
        with meter() as sub:
            try:
                yield sub
            finally:
                self._carved.append(sub)


def current() -> AIUnit | None:
    """The AI unit open on this context, or None at the outermost level."""
    return _CURRENT.get()


@contextmanager
def open_unit(feature: str, key: str | None = None) -> Generator[AIUnit, None, None]:
    """Open the outermost AI unit and meter every LLM call inside it.

    Never nested: check `current()` first. The caller settles `unit.usage()`
    under `unit.key` AFTER the block (see `dispatch()` and the chat stream)."""
    if _CURRENT.get() is not None:
        raise RuntimeError("an AI unit is already open; nested work must join it")
    from ai_engine.usage_meter import meter
    with meter(billed=True) as cb:
        unit = AIUnit(feature=feature, key=key or str(uuid.uuid4()), cb=cb)
        tok = _CURRENT.set(unit)
        try:
            yield unit
        finally:
            _CURRENT.reset(tok)
