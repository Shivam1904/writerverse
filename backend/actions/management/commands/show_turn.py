"""Print everything one AI turn did, as one timeline (wrt-34).

    uv run python manage.py show_turn <turn_id>     # from backend/

A turn's id (`common/turns.py`) is on everything it touched; this command
gathers it from each place, sorted by time:

- LOG / DISPATCH / ERROR: lines from `db/logs/django.log` and `actions.log`
  (and their rotated copies) tagged `turn=<id>`. Dispatch decisions (route,
  actor, deny) are DISPATCH; an ERROR line carries its traceback. (`error.log`
  is not read: `writerverse.errors` writes the same lines to `django.log`.)
- AI: each call in `db/logs/ai_calls.jsonl` (model, tokens, time, LangSmith
  run id), with the tools it asked for and what each tool returned. Needs
  `AI_CALL_LOG=1`; read the full prompt and reply with `manage.py ai_calls <id>`.
- USAGE: the turn's AIUsage rows (`metadata.turn_id`): tokens and $ cost.
- ACTIVITY: its ActivityEvent rows (`details.turn_id`).
"""
import json
import os
import re
from datetime import UTC, datetime

from activity.models import ActivityEvent
from ai_engine import call_log
from django.core.management.base import BaseCommand, CommandError
from usage.models import AIUsage

LOG_FILES = ("django.log", "actions.log")
# settings.LOGGING 'verbose': `{levelname} {asctime} {module} {process} {thread} turn={turn_id} {message}`
_LINE = re.compile(
    r"^(?P<level>[A-Z]+) (?P<ts>\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3}) (?P<module>\S+) "
    r"\d+ \d+ turn=(?P<turn>\S+) (?P<msg>.*)$"
)
# Any record's start, even one without `turn=` (written before wrt-31).
_START = re.compile(r"^[A-Z]+ \d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3} ")
_SHORT = 300  # tool args/results are cut to this many characters


def _short(value):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    text = " ".join(text.split())
    return text if len(text) <= _SHORT else text[:_SHORT] + "…"


def _log_paths(name):
    """`name` and its rotated copies (`name.1` …), oldest first."""
    folder = call_log.log_dir()
    rotated = [p for p in folder.glob(name + ".*") if p.suffix[1:].isdigit()]
    rotated.sort(key=lambda p: int(p.suffix[1:]), reverse=True)
    return [*rotated, folder / name]


def log_entries(turn_id):
    """The turn's log lines. Lines that don't start a record (a traceback) go
    with the record above them."""
    entries = []
    for name in LOG_FILES:
        for path in _log_paths(name):
            if not path.exists():
                continue
            current = None
            with path.open(encoding="utf-8", errors="replace") as f:
                for raw in f:
                    line = raw.rstrip("\n")
                    m = _LINE.match(line)
                    if m is None and _START.match(line):
                        current = None
                        continue
                    if m is None:
                        if current is not None and line:
                            current["more"].append(line)
                        continue
                    current = None
                    if m["turn"] != turn_id:
                        continue
                    level, module = m["level"], m["module"]
                    kind = ("ERROR" if level in ("ERROR", "CRITICAL")
                            else "DISPATCH" if module == "dispatch" else "LOG")
                    when = datetime.strptime(m["ts"], "%Y-%m-%d %H:%M:%S,%f").astimezone(UTC)
                    current = {"ts": when, "kind": kind,
                               "text": f"{level} [{module}] {m['msg']}", "more": []}
                    entries.append(current)
    return entries


def ai_entries(turn_id):
    """One entry per logged AI call, with its tool calls and their results."""
    calls = call_log.read_calls(turn_id)
    results = {}  # tool_call_id -> what the tool returned (seen in a later prompt)
    for call in calls:
        for msg in call.get("prompt") or []:
            if msg.get("role") == "tool" and msg.get("tool_call_id"):
                results[msg["tool_call_id"]] = msg.get("content")
    entries = []
    for call in calls:
        tokens = call.get("tokens") or {}
        text = (f"model={call.get('model')} capability={call.get('capability') or '-'} "
                f"tokens in={tokens.get('in')} out={tokens.get('out')} {call.get('latency_ms')}ms "
                f"langsmith run={call.get('run_id') or '-'}")
        more = []
        if call.get("error"):
            more.append(f"failed: {call['error']}")
        for tc in (call.get("response") or {}).get("tool_calls") or []:
            more.append(f"tool {tc.get('name')}({_short(tc.get('args'))})")
            if tc.get("id") in results:
                more.append(f"  -> {_short(results[tc['id']])}")
            else:
                more.append("  -> (no result logged)")
        entries.append({"ts": datetime.fromisoformat(call["ts"]), "kind": "AI",
                        "text": text, "more": more})
    return entries


def usage_entries(turn_id):
    return [
        {"ts": row.created_at, "kind": "USAGE",
         "text": (f"{row.feature}: model={row.model or '-'} "
                  f"tokens in={row.tokens_in} out={row.tokens_out} cost=${row.cost_usd}"),
         "more": []}
        for row in AIUsage.objects.filter(metadata__turn_id=turn_id)
    ]


def activity_entries(turn_id):
    return [
        {"ts": row.created_at, "kind": "ACTIVITY",
         "text": f"{row.kind} {row.name}", "more": [_short(row.details)]}
        for row in ActivityEvent.objects.filter(details__turn_id=turn_id)
    ]


def timeline(turn_id):
    """Every entry of the turn, oldest first."""
    entries = (log_entries(turn_id) + ai_entries(turn_id)
               + usage_entries(turn_id) + activity_entries(turn_id))
    return sorted(entries, key=lambda e: e["ts"])


class Command(BaseCommand):
    help = "Show one AI turn's whole timeline: dispatch, AI and tool calls, usage, errors."

    def add_arguments(self, parser):
        parser.add_argument("turn_id", help="the turn's id (the `turn=` value in the logs)")

    def handle(self, *args, turn_id, **opts):
        entries = timeline(turn_id)
        if not entries:
            raise CommandError(
                f"Nothing found for turn {turn_id!r} in {call_log.log_dir()} or the database. "
                "Find ids with `grep turn= db/logs/django.log` or `manage.py ai_calls --list`."
            )
        self.stdout.write(self.style.MIGRATE_HEADING(f"=== turn {turn_id}: {len(entries)} entries"))
        if not any(e["kind"] == "AI" for e in entries):
            self.stdout.write("(no AI calls logged: set AI_CALL_LOG=1 in backend/.env to see them)")
        project = os.environ.get("LANGSMITH_PROJECT") or "your project"
        self.stdout.write(f"LangSmith: search {project} for tag turn:{turn_id}")
        style = {"ERROR": self.style.ERROR, "AI": self.style.HTTP_INFO,
                 "USAGE": self.style.SUCCESS, "DISPATCH": self.style.WARNING}
        for e in entries:
            stamp = e["ts"].astimezone(UTC).strftime("%H:%M:%S.%f")[:-3]
            paint = style.get(e["kind"], str)
            self.stdout.write(paint(f"{stamp} {e['kind']:<8} {e['text']}"))
            for line in e["more"]:
                self.stdout.write(f"{'':22}{line}")
