"""wrt-32: a developer can read a turn's full AI prompts and replies locally.

With AI_CALL_LOG on, every chat client gets a callback that writes one JSON
line per call to db/logs/ai_calls.jsonl; `manage.py ai_calls <turn_id>` prints
them. Fake chat models only; no paid API is called."""
import io
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from common.turns import trace_tag, turn
from django.core.management import CommandError, call_command
from django.test import SimpleTestCase, TestCase, override_settings
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from usage.tests.helpers import MODEL, _cap, _drop_caps, _setup, _Spend

from ai_engine import call_log
from ai_engine.llm_utils import _build_client


class _LogDirMixin:
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        p = patch.object(call_log, "log_dir", return_value=self.dir)
        p.start()
        self.addCleanup(p.stop)

    def lines(self):
        path = self.dir / call_log.FILE_NAME
        return [json.loads(x) for x in path.read_text().splitlines()] if path.exists() else []


class CallLogTests(_LogDirMixin, SimpleTestCase):
    def test_writes_full_prompt_reply_turn_and_capability(self):
        with turn("t-log"), trace_tag("capability:check_scene"):
            _Spend(tin=7, tout=3).invoke(
                "Is Mara in chapter 4?", config={"callbacks": [call_log.call_log_handler(MODEL)]})
        (line,) = self.lines()
        self.assertEqual(line["turn_id"], "t-log")
        self.assertEqual(line["capability"], "check_scene")
        self.assertEqual(line["model"], MODEL)
        self.assertEqual(line["prompt"], [{"role": "human", "content": "Is Mara in chapter 4?"}])
        self.assertEqual(line["response"]["content"], "ok")
        self.assertEqual(line["tokens"], {"in": 7, "out": 3})
        self.assertIsInstance(line["latency_ms"], int)

    def test_a_failed_call_is_logged_with_its_error(self):
        class _Boom(_Spend):
            def _generate(self, *a, **kw):
                raise RuntimeError("provider down")

        with turn("t-err"), self.assertRaises(RuntimeError):
            _Boom().invoke("x", config={"callbacks": [call_log.call_log_handler(MODEL)]})
        (line,) = self.lines()
        self.assertEqual(line["turn_id"], "t-err")
        self.assertEqual(line["error"], "RuntimeError: provider down")

    def test_trace_tag_keeps_the_turn_tag(self):
        from langsmith.run_helpers import get_tracing_context

        with turn("t-keep"), trace_tag("capability:x"):
            ctx = get_tracing_context()
        self.assertEqual(ctx["tags"], ["turn:t-keep", "capability:x"])
        self.assertEqual(ctx["metadata"], {"turn_id": "t-keep"})


class DispatchTagTests(_LogDirMixin, TestCase):
    def tearDown(self):
        _drop_caps()

    def test_each_call_names_the_innermost_capability(self):
        _, project = _setup()
        scope = ProjectScope(project.pk)

        def ask(ctx, args):
            _Spend(tin=1).invoke("x", config={"callbacks": [call_log.call_log_handler(MODEL)]})
            return {"ok": 1}

        def outer(ctx, args):
            ask(ctx, args)
            dispatch("_log_inner", {}, Actor.INTERNAL, scope)
            return {"ok": 1}

        _cap("_log_inner", ask)
        _cap("_log_outer", outer)
        dispatch("_log_outer", {}, Actor.USER_BUTTON, scope)
        first, second = self.lines()
        self.assertEqual([first["capability"], second["capability"]], ["_log_outer", "_log_inner"])
        self.assertEqual(first["turn_id"], second["turn_id"])
        self.assertTrue(first["turn_id"])


class ClientWiringTests(SimpleTestCase):
    CFG = {"provider": "openai", "model": "gpt-4.1-mini", "api_key": "sk-test",
           "timeout": 5, "max_tokens": 10}

    def _has_log(self):
        llm = _build_client(dict(self.CFG), 0, {})
        return any(type(cb).__name__ == "_CallLog" for cb in llm.callbacks)

    @override_settings(AI_CALL_LOG=True)
    def test_on_every_client_when_the_flag_is_on(self):
        self.assertTrue(self._has_log())

    @override_settings(AI_CALL_LOG=False)
    def test_off_by_default(self):
        self.assertFalse(self._has_log())

    def test_tests_never_upload_langsmith_traces(self):
        self.assertEqual(os.environ.get("LANGSMITH_TRACING"), "false")


class AiCallsCommandTests(_LogDirMixin, SimpleTestCase):
    def _run(self, *args):
        out = io.StringIO()
        call_command("ai_calls", *args, stdout=out)
        return out.getvalue()

    def _call(self, turn_id, prompt, reply):
        llm = FakeListChatModel(responses=[reply])
        with turn(turn_id):
            llm.invoke(prompt, config={"callbacks": [call_log.call_log_handler("fake")]})

    def test_prints_the_full_prompt_and_reply_of_one_turn(self):
        self._call("t-one", "Summarise chapter 1", "Mara leaves the harbor.")
        self._call("t-two", "Other prompt", "Other reply")
        out = self._run("t-one")
        self.assertIn("Summarise chapter 1", out)
        self.assertIn("Mara leaves the harbor.", out)
        self.assertNotIn("Other reply", out)
        self.assertIn("Other reply", self._run())  # no id = the latest turn
        self.assertIn("turn=t-two", self._run("--list"))

    def test_explains_how_to_turn_it_on_when_nothing_is_logged(self):
        with self.assertRaisesRegex(CommandError, "AI_CALL_LOG=1"):
            self._run("t-none")
