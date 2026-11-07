"""Dev-only log viewer endpoint — backs the `/dev/logs` page.

Reads `db/logs/consistency.log` (the `writerverse.consistency` logger — the whole
Night Eyes / capability stack), parses each entry from the verbose format
    {levelname} {asctime} {module} {pid} {thread} {message}
into a structured event, and serves a tail (plus cursor-based incremental polling).

Not an audit trail and not production-facing: read-only and dev-only (404 unless
DEBUG and LOCAL_DEV, same gate as `RegistryView`), because the log is shared across
projects. The log file is the source of truth — this only reshapes it for display.
"""
from __future__ import annotations

import re
from pathlib import Path

from django.conf import settings
from django.http import HttpResponseNotFound, JsonResponse
from django.views import View

# Filter key (what the frontend's ?filter= maps to) → log filename under db/logs/.
# Only `nighteyes` is wired; the dict is the seam for adding django/persistence later.
SOURCES = {
    "nighteyes": "consistency.log",
}

# A log line that STARTS a new entry: LEVEL  date  time,ms  module  pid  thread  message
# Anything that doesn't match is a continuation (traceback / wrapped SQL) of the
# previous entry.
_ENTRY = re.compile(
    r"^(?P<level>DEBUG|INFO|WARNING|ERROR|CRITICAL)\s+"
    r"(?P<date>\d{4}-\d{2}-\d{2})\s+"
    r"(?P<time>\d{2}:\d{2}:\d{2},\d{3})\s+"
    r"(?P<module>\S+)\s+"
    r"(?P<pid>\d+)\s+"
    r"(?P<thread>\d+)\s+"
    r"(?P<msg>.*)$"
)

# Generic `key=value` scrape (value runs to whitespace). Catches capability=, actor=,
# tag=, role=, attempt=, req=, resp=, spent=, remaining=, project=, scene=, words= …
_KV = re.compile(r"(\w+)=([^\s]+)")
_ROUTE = re.compile(r"\bdispatch\s+(READ|WRITE|WROTE|PROPOSE|REJECT|RUN|RAN)\b")

# How much of the file tail to scan on a first (cursorless) load, in bytes.
_TAIL_BYTES = 600 * 1024
# Max entries returned on a first load after filtering.
_DEFAULT_LIMIT = 800


def _classify(module: str, msg: str, level: str, fields: dict) -> str:
    """Bucket an entry into a display kind."""
    if module == "story_consistency" and msg.startswith("llm"):
        return "llm"
    if level in ("ERROR", "CRITICAL", "WARNING"):
        return "error"
    if module == "dispatch":
        return "dispatch"
    if "capability=" in msg or "/" in msg.split(" ", 1)[0]:
        return "commit"
    return "other"


def _parse(text: str, start_seq: int = 0) -> list[dict]:
    """Parse raw log text into structured entries. Continuation lines fold into
    the preceding entry's `extra` (and `raw`)."""
    entries: list[dict] = []
    seq = start_seq
    for line in text.splitlines():
        m = _ENTRY.match(line)
        if not m:
            # Continuation of the previous entry (traceback / SQL).
            if entries:
                entries[-1]["extra"].append(line)
                entries[-1]["raw"] += "\n" + line
            continue
        msg = m.group("msg")
        module = m.group("module")
        level = m.group("level")
        fields = dict(_KV.findall(msg))
        route_m = _ROUTE.search(msg)
        if route_m:
            fields["route"] = route_m.group(1)
        seq += 1
        entries.append({
            "seq": seq,
            "level": level,
            "ts": f"{m.group('date')} {m.group('time')}",
            "time": m.group("time")[:8],  # HH:MM:SS
            "module": module,
            "thread": m.group("thread"),
            "msg": msg,
            "raw": line,
            "extra": [],
            "fields": fields,
            "kind": _classify(module, msg, level, fields),
        })
    return entries


def _is_read_spam(e: dict) -> bool:
    f = e["fields"]
    return f.get("actor") == "user_button" and f.get("route") == "READ"


def _read_tail(path: Path) -> tuple[str, int]:
    """Return (text, eof_offset) for the last _TAIL_BYTES of the file, dropping a
    partial first line."""
    size = path.stat().st_size
    start = max(0, size - _TAIL_BYTES)
    with path.open("rb") as f:
        f.seek(start)
        data = f.read()
    if start > 0 and b"\n" in data:
        data = data.split(b"\n", 1)[1]
    return data.decode("utf-8", "replace"), size


def _read_since(path: Path, cursor: int) -> tuple[str, int]:
    """Return (text, eof_offset) for bytes appended since `cursor`."""
    size = path.stat().st_size
    if cursor > size:  # rotation / truncation — start fresh from the tail
        return _read_tail(path)
    with path.open("rb") as f:
        f.seek(cursor)
        data = f.read()
    return data.decode("utf-8", "replace"), size


class DevLogsView(View):
    """GET /api/consistency/dev/logs/?source=nighteyes&mode=ai&cursor=<n>

    Returns {entries, cursor, dropped, eof, source}. `cursor` is a byte offset to
    pass back on the next poll for incremental tailing.
    """

    def get(self, request):
        # DEBUG alone is not enough: a public server that copied .env.example
        # has DEBUG on too. LOCAL_DEV also needs the local runtime + a localhost frontend.
        if not (settings.DEBUG and settings.LOCAL_DEV):
            return HttpResponseNotFound()
        source = request.GET.get("source", "nighteyes")
        mode = request.GET.get("mode", "ai")  # ai | all
        cursor_raw = request.GET.get("cursor")

        filename = SOURCES.get(source)
        if not filename:
            return JsonResponse(
                {"error": f"unknown source '{source}'", "sources": list(SOURCES)},
                status=400,
            )

        path = Path(settings.BASE_DIR).parent / "db" / "logs" / filename
        if not path.exists():
            return JsonResponse(
                {"entries": [], "cursor": 0, "dropped": 0, "eof": 0,
                 "source": source, "note": f"no log file at {path}"},
            )

        try:
            cursor = int(cursor_raw) if cursor_raw not in (None, "") else None
        except ValueError:
            cursor = None

        if cursor is None:
            text, eof = _read_tail(path)
            initial = True
        else:
            text, eof = _read_since(path, cursor)
            initial = False

        entries = _parse(text)

        dropped = 0
        if mode == "ai":
            kept = []
            for e in entries:
                if _is_read_spam(e):
                    dropped += 1
                    continue
                kept.append(e)
            entries = kept

        # First load can surface a lot — keep only the last N after filtering.
        if initial and len(entries) > _DEFAULT_LIMIT:
            entries = entries[-_DEFAULT_LIMIT:]

        return JsonResponse({
            "entries": entries,
            "cursor": eof,
            "dropped": dropped,
            "eof": eof,
            "source": source,
            "mode": mode,
        })
