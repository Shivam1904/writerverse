"""wrt-34: `manage.py show_turn <id>` prints one AI turn's whole timeline:
dispatch decisions, AI calls with their tool calls and results, the AI usage,
activity rows and errors with their traceback. No AI is called."""
import io
import json
import logging
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

from activity.models import ActivityEvent
from ai_engine import call_log
from common.turns import TurnIdFilter, turn
from django.conf import settings
from django.core.management import CommandError, call_command
from django.test import TestCase
from langchain_core.messages import ToolMessage
from usage.models import AIUsage
from usage.tests.helpers import _setup


class ShowTurnTests(TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        p = patch.object(call_log, "log_dir", return_value=self.dir)
        p.start()
        self.addCleanup(p.stop)

    def _log(self, file_name, level, msg, *, module="views", turn_id="t-show", exc=None):
        """Write one line the way settings.LOGGING's 'verbose' formatter does,
        as if logged from `<module>.py`."""
        fmt = settings.LOGGING["formatters"]["verbose"]
        handler = logging.FileHandler(self.dir / file_name, encoding="utf-8")
        handler.setFormatter(logging.Formatter(fmt["format"], style=fmt["style"]))
        handler.addFilter(TurnIdFilter())
        exc_info = (type(exc), exc, exc.__traceback__) if exc else None
        try:
            with turn(turn_id):
                handler.handle(logging.LogRecord(
                    "test", level, f"{module}.py", 1, msg, None, exc_info))
        finally:
            handler.close()

    def _ai_call(self, **fields):
        record = {"ts": datetime.now(UTC).isoformat(timespec="seconds"), "turn_id": "t-show",
                  "capability": None, "model": "gpt-test", "run_id": "run-1",
                  "tokens": {"in": 11, "out": 4}, "latency_ms": 120, **fields}
        with (self.dir / call_log.FILE_NAME).open("a") as f:
            f.write(json.dumps(record) + "\n")

    def _run(self, *args):
        out = io.StringIO()
        call_command("show_turn", *args, stdout=out)
        return out.getvalue()

    def test_prints_the_whole_turn_in_one_place(self):
        user, project = _setup()
        self._log("django.log", logging.INFO, "dispatch DENY capability=add_scene actor=chat",
                  module="dispatch")
        self._log("django.log", logging.INFO, "other turn line", turn_id="t-other")
        try:
            raise ValueError("scene not found")
        except ValueError as e:
            self._log("django.log", logging.ERROR, "operation=chat correlation_id=abc", exc=e)
        with (self.dir / "django.log").open("a") as f:  # a line from before turn ids
            f.write("INFO 2026-10-01 10:00:00,000 views 1 2 old line\n  old continuation\n")
        self._log("actions.log", logging.INFO, "consistency check ran")
        self._ai_call(prompt=[{"role": "human", "content": "Where is Mara?"}],
                      response={"role": "ai", "content": "",
                                "tool_calls": [{"name": "find_character", "id": "c1",
                                                "args": {"name": "Mara"}}]})
        self._ai_call(prompt=[{"role": "tool", "content": "Mara is in chapter 4",
                               "tool_call_id": "c1"}],
                      response={"role": "ai", "content": "Chapter 4."})
        self._ai_call(turn_id="t-other", prompt=[], response={"content": "no"})
        AIUsage.objects.create(user=user, feature="chat", model="gpt-test",
                               tokens_in=22, tokens_out=8, cost_usd="0.0012",
                               idempotency_key="k-show", metadata={"turn_id": "t-show"})
        ActivityEvent.objects.create(project=project, kind=ActivityEvent.STEP, name="extract",
                                     details={"turn_id": "t-show"})

        out = self._run("t-show")

        self.assertIn("DISPATCH INFO [dispatch] dispatch DENY capability=add_scene", out)
        self.assertIn("ERROR    ERROR [views] operation=chat correlation_id=abc", out)
        self.assertIn("ValueError: scene not found", out)  # the traceback travels with its line
        self.assertIn("LOG      INFO [views] consistency check ran", out)
        self.assertIn("model=gpt-test", out)
        self.assertIn("tokens in=11 out=4 120ms langsmith run=run-1", out)
        self.assertIn('tool find_character({"name": "Mara"})', out)
        self.assertIn("-> Mara is in chapter 4", out)
        self.assertIn("USAGE    chat: model=gpt-test tokens in=22 out=8 cost=$0.0012", out)
        self.assertIn("ACTIVITY step extract", out)
        self.assertIn("tag turn:t-show", out)
        self.assertNotIn("other turn line", out)
        self.assertNotIn("old continuation", out)
        self.assertEqual(out.count(" AI "), 2)  # the other turn's call is left out

    def test_an_unknown_turn_says_where_to_find_ids(self):
        with self.assertRaisesMessage(CommandError, "ai_calls --list"):
            self._run("nope")

    def test_the_call_log_keeps_which_tool_call_a_result_answers(self):
        msg = call_log._message(ToolMessage("Mara is in chapter 4", tool_call_id="c1"))
        self.assertEqual(msg["tool_call_id"], "c1")
