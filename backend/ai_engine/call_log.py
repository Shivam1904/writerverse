"""Local log of every AI call's full prompt and reply (wrt-32).

LangSmith holds the full text in the cloud. This writes the same thing to a
local file, so a developer (or an AI worker) can read "what did the model see
and say" from the terminal:

    uv run python manage.py ai_calls <turn_id>     # from backend/

One JSON line per call in `db/logs/ai_calls.jsonl`:
`{ts, turn_id, capability, model, run_id, prompt, response, tokens, latency_ms}`
(`run_id` is the LangSmith run id when tracing is on)
(`error` instead of `response` when the call failed). `turn_id` and
`capability` come from the run's LangChain tags (`turn:<id>` from
`common/turns.py`, `capability:<name>` from dispatch), so this module needs no
imports from the layers above it.

Off unless `settings.AI_CALL_LOG` (env `AI_CALL_LOG=1`), and always off on a
deployed server: the file holds the author's text. Rotates daily, keeps ~2
days, like `common/persistence_audit.py`.
"""
from __future__ import annotations

import json
import logging
import logging.handlers
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

FILE_NAME = "ai_calls.jsonl"

_logger = logging.getLogger("writerverse.ai_calls")
_logger.propagate = False  # the author's text goes to this file only, never the console
_handler_lock = threading.Lock()
_handler_path: Path | None = None


def enabled() -> bool:
    from django.conf import settings

    return bool(getattr(settings, "AI_CALL_LOG", False))


def log_dir() -> Path:
    """Beside django.log / persistence.log, so `.gitignore` (logs/) covers it."""
    from django.conf import settings

    return Path(settings.BASE_DIR).parent / "db" / "logs"


def _ensure_handler() -> None:
    """Open the file on first use (rebuilt if `log_dir()` moved, as in tests)."""
    global _handler_path
    path = log_dir() / FILE_NAME
    if _handler_path == path:
        return
    with _handler_lock:
        if _handler_path == path:
            return
        for old in list(_logger.handlers):
            _logger.removeHandler(old)
            old.close()
        _handler_path = path
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            handler = logging.handlers.TimedRotatingFileHandler(
                path, when="midnight", backupCount=2, encoding="utf-8",
            )
        except OSError:
            return  # read-only disk: this is a dev aid, never break the call
        handler.setFormatter(logging.Formatter("%(message)s"))
        _logger.addHandler(handler)
        _logger.setLevel(logging.INFO)


def _from_tags(tags: list[str] | None, prefix: str) -> str | None:
    """The value of the last `<prefix><value>` tag (the innermost one)."""
    found = [t[len(prefix):] for t in tags or [] if t.startswith(prefix)]
    return found[-1] if found else None


def _message(m: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"role": getattr(m, "type", "?"), "content": getattr(m, "content", m)}
    if getattr(m, "tool_calls", None):
        out["tool_calls"] = m.tool_calls
    if getattr(m, "tool_call_id", None):  # a tool's result: which call it answers
        out["tool_call_id"] = m.tool_call_id
    return out


def _write(record: dict[str, Any]) -> None:
    _ensure_handler()
    _logger.info(json.dumps(record, ensure_ascii=False, default=str))


def call_log_handler(model: str) -> Any:
    """A callback that writes one line per call on `model` (see module doc)."""
    from langchain_core.callbacks import BaseCallbackHandler

    class _CallLog(BaseCallbackHandler):
        run_inline = True  # async runs: read the tags on the caller's context

        def __init__(self) -> None:
            self._open: dict[Any, dict[str, Any]] = {}
            self._lock = threading.Lock()

        def on_chat_model_start(self, serialized: Any, messages: Any, *, run_id: Any,
                                tags: list[str] | None = None, **kwargs: Any) -> None:
            record = {
                "ts": datetime.now(UTC).isoformat(timespec="milliseconds"),
                "turn_id": _from_tags(tags, "turn:"),
                "capability": _from_tags(tags, "capability:"),
                "model": model,
                "run_id": str(run_id),
                "prompt": [_message(m) for batch in messages for m in batch],
                "_t0": time.monotonic(),
            }
            with self._lock:
                self._open[run_id] = record

        def _finish(self, run_id: Any, **fields: Any) -> None:
            with self._lock:
                record = self._open.pop(run_id, None)
            if record is None:
                return
            record["latency_ms"] = round((time.monotonic() - record.pop("_t0")) * 1000)
            record.update(fields)
            _write(record)

        def on_llm_end(self, response: Any, *, run_id: Any, **kwargs: Any) -> None:
            try:
                message = response.generations[0][0].message
            except (AttributeError, IndexError):
                self._finish(run_id, response=None, tokens=None)
                return
            usage = getattr(message, "usage_metadata", None) or {}
            self._finish(
                run_id,
                response=_message(message),
                tokens={"in": usage.get("input_tokens"), "out": usage.get("output_tokens")},
            )

        def on_llm_error(self, error: BaseException, *, run_id: Any, **kwargs: Any) -> None:
            self._finish(run_id, error=f"{type(error).__name__}: {error}")

    return _CallLog()


def read_calls(turn_id: str | None = None) -> list[dict[str, Any]]:
    """Every logged call (oldest first), or only the calls of `turn_id`.
    Reads the rotated files too."""
    files = sorted(log_dir().glob(FILE_NAME + ".*")) + [log_dir() / FILE_NAME]
    calls = []
    for path in files:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                call = json.loads(line)
            except json.JSONDecodeError:
                continue
            if turn_id is None or call.get("turn_id") == turn_id:
                calls.append(call)
    return calls
