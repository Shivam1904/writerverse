"""One id per AI turn (wrt-31).

A turn is one chat message (or ping answer) or one button action: the same
outermost piece of work that is one AI unit (`ai_engine/units.py`). Its
`turn_id` lives in a contextvar, so everything that runs inside the turn sees it:

- every log line (`TurnIdFilter`, wired in settings.LOGGING: `turn=<id>`),
- the AIUsage rows it settles (`metadata["turn_id"]`),
- ActivityEvent rows (`details["turn_id"]`),
- `report_exception` error lines (next to the correlation id),
- LangSmith traces (tag `turn:<id>` and metadata `turn_id`).

So "this turn went wrong" becomes: grep the logs for `turn=<id>`, filter the
usage/activity rows on the id, and search LangSmith for the tag.

Like the AI unit, the id follows the work into the threads LangChain uses
for sync tools (they copy the context). A plain `threading.Thread` starts with an
EMPTY context, so the chat producer thread binds the id it was handed.
"""
from __future__ import annotations

import contextvars
import logging
import uuid
from collections.abc import Generator
from contextlib import contextmanager

_TURN: contextvars.ContextVar[str | None] = contextvars.ContextVar("turn_id", default=None)


def new_turn_id() -> str:
    return uuid.uuid4().hex[:12]


def current_turn_id() -> str | None:
    """The turn id bound on this context, or None outside any turn."""
    return _TURN.get()


@contextmanager
def turn(turn_id: str | None = None) -> Generator[str, None, None]:
    """Bind a turn id for the block and tag LangSmith traces with it.

    Called without an id inside an open turn, it joins that turn (a nested
    dispatch is part of the chat turn that called it). Otherwise it binds
    `turn_id`, or a new id."""
    open_id = _TURN.get()
    if turn_id is None and open_id is not None:
        yield open_id
        return
    tid = turn_id or new_turn_id()
    from langsmith.run_helpers import tracing_context
    tok = _TURN.set(tid)
    try:
        with tracing_context(tags=[f"turn:{tid}"], metadata={"turn_id": tid}):
            yield tid
    finally:
        _TURN.reset(tok)


@contextmanager
def trace_tag(tag: str) -> Generator[None, None, None]:
    """Add `tag` to the block's LangSmith traces and AI call log lines
    (`ai_engine/call_log.py`), keeping the turn's tags. LangSmith's
    tracing_context replaces tags and metadata, so pass the open ones on."""
    from langsmith.run_helpers import get_tracing_context, tracing_context
    open_ctx = get_tracing_context()
    with tracing_context(tags=[*(open_ctx["tags"] or []), tag], metadata=open_ctx["metadata"]):
        yield


class TurnIdFilter(logging.Filter):
    """Adds `record.turn_id` (`-` outside a turn) so formatters can print it."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.turn_id = _TURN.get() or "-"
        return True
