"""Print the full prompt and reply of logged AI calls (wrt-32).

Needs AI_CALL_LOG=1 in backend/.env while the calls run (see ai_engine/call_log.py).

    uv run python manage.py ai_calls <turn_id>   # every call of one turn
    uv run python manage.py ai_calls             # the latest turn
    uv run python manage.py ai_calls --list      # recent turns, one line each
    uv run python manage.py ai_calls <turn_id> --json
"""
import json

from ai_engine import call_log
from django.core.management.base import BaseCommand, CommandError


def _text(content):
    if isinstance(content, str):
        return content
    return json.dumps(content, ensure_ascii=False, indent=2)


class Command(BaseCommand):
    help = "Show the full prompt and reply of each AI call in a turn (needs AI_CALL_LOG=1)."

    def add_arguments(self, parser):
        parser.add_argument("turn_id", nargs="?", help="the turn's id (default: the latest turn)")
        parser.add_argument("--list", action="store_true", help="list recent turns instead")
        parser.add_argument("--json", action="store_true", help="print the raw JSON lines")

    def handle(self, *args, turn_id=None, **opts):
        calls = call_log.read_calls()
        if not calls:
            raise CommandError(
                f"No AI calls logged in {call_log.log_dir() / call_log.FILE_NAME}. "
                "Set AI_CALL_LOG=1 in backend/.env, restart the server and run the AI again."
            )
        if opts["list"]:
            self._list(calls)
            return
        turn_id = turn_id or calls[-1].get("turn_id")
        mine = [c for c in calls if c.get("turn_id") == turn_id]
        if not mine:
            raise CommandError(f"No logged AI calls for turn {turn_id!r}. Try --list.")
        for n, call in enumerate(mine, 1):
            if opts["json"]:
                self.stdout.write(json.dumps(call, ensure_ascii=False))
            else:
                self._show(n, len(mine), call)

    def _list(self, calls):
        turns = {}
        for c in calls:
            turns.setdefault(c.get("turn_id"), []).append(c)
        for tid, group in list(turns.items())[-20:]:
            caps = sorted({c.get("capability") or "chat" for c in group})
            self.stdout.write(f"{group[0].get('ts')}  turn={tid}  calls={len(group)}  {', '.join(caps)}")

    def _show(self, n, total, call):
        tokens = call.get("tokens") or {}
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"=== call {n}/{total}  turn={call.get('turn_id')}  "
            f"capability={call.get('capability') or '-'}  model={call.get('model')}  "
            f"tokens in={tokens.get('in')} out={tokens.get('out')}  {call.get('latency_ms')}ms"
        ))
        for msg in call.get("prompt") or []:
            self.stdout.write(self.style.HTTP_INFO(f"--- {msg.get('role')}"))
            self.stdout.write(_text(msg.get("content")))
            if msg.get("tool_calls"):
                self.stdout.write(_text(msg["tool_calls"]))
        if call.get("error"):
            self.stdout.write(self.style.ERROR(f"--- error\n{call['error']}"))
            return
        reply = call.get("response") or {}
        self.stdout.write(self.style.SUCCESS("--- reply"))
        self.stdout.write(_text(reply.get("content")))
        if reply.get("tool_calls"):
            self.stdout.write(_text(reply["tool_calls"]))
