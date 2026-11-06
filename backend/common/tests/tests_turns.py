"""One id per AI turn (wrt-31): given a turn_id you can find the turn's log lines,
AI usage rows, activity rows, errors and LangSmith runs. No paid API is called."""
import io
import json
import logging

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from activity.models import ActivityEvent
from activity.store import log_step
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from langchain_core.callbacks import BaseCallbackHandler
from usage.models import AIUsage
from usage.tests.helpers import _cap, _drop_caps, _setup, _Spend, spend

from common.errors import report_exception
from common.turns import TurnIdFilter, current_turn_id, turn


class _SeeTags(BaseCallbackHandler):
    """Records the tags/metadata LangChain hands to callbacks (the LangSmith
    tracer gets the same ones)."""

    def __init__(self):
        self.seen = []

    def on_chat_model_start(self, serialized, messages, *, tags=None, metadata=None, **kw):
        self.seen.append((tags or [], metadata or {}))


class TurnContextTests(SimpleTestCase):
    def test_turn_binds_an_id_and_clears_it_after(self):
        self.assertIsNone(current_turn_id())
        with turn() as tid:
            self.assertTrue(tid)
            self.assertEqual(current_turn_id(), tid)
        self.assertIsNone(current_turn_id())

    def test_nested_turn_joins_the_open_one_unless_given_an_id(self):
        with turn("outer") as outer:
            with turn() as inner:
                self.assertEqual(inner, outer)
            with turn("other") as other:
                self.assertEqual(current_turn_id(), "other")
                self.assertEqual(other, "other")
            self.assertEqual(current_turn_id(), "outer")

    def test_log_lines_carry_the_turn_id(self):
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.addFilter(TurnIdFilter())
        handler.setFormatter(logging.Formatter("turn=%(turn_id)s %(message)s"))
        log = logging.getLogger("wrt31.test")
        log.addHandler(handler)
        try:
            log.warning("outside")
            with turn("t-log"):
                log.warning("inside")
        finally:
            log.removeHandler(handler)
        self.assertEqual(buf.getvalue().splitlines(), ["turn=- outside", "turn=t-log inside"])

    def test_report_exception_logs_the_turn_id(self):
        with self.assertLogs("writerverse.errors", level="ERROR") as logs, turn("t-err"):
            report_exception(ValueError("boom"), operation="op")
        self.assertIn("turn_id=t-err", logs.output[0])

    def test_llm_runs_are_tagged_with_the_turn_for_langsmith(self):
        from langsmith.run_helpers import get_tracing_context

        seen = _SeeTags()
        with turn("t-ls"):
            # LangChain gives this metadata to the LangSmith tracer only.
            self.assertEqual(get_tracing_context()["metadata"], {"turn_id": "t-ls"})
            _Spend(tin=1).invoke("x", config={"callbacks": [seen]})
        tags, _metadata = seen.seen[0]
        self.assertIn("turn:t-ls", tags)


class DispatchTurnTests(TestCase):
    def setUp(self):
        self.user, self.project = _setup()
        self.scope = ProjectScope(self.project.pk)

    def tearDown(self):
        _drop_caps()

    def test_a_button_action_is_one_turn_across_usage_activity_and_nested_work(self):
        seen = {}

        def inner(ctx, args):
            seen["inner"] = current_turn_id()
            spend(500)
            return {"ok": 1}

        def outer(ctx, args):
            seen["outer"] = current_turn_id()
            spend(1000)
            log_step(ctx, "_turn_step", {})
            dispatch("_turn_inner", {}, Actor.INTERNAL, self.scope)
            return {"ok": 1}

        _cap("_turn_inner", inner)
        _cap("_turn_outer", outer)

        dispatch("_turn_outer", {}, Actor.USER_BUTTON, self.scope)

        tid = seen["outer"]
        self.assertTrue(tid)
        self.assertEqual(seen["inner"], tid)  # nested dispatch joins the turn
        self.assertIsNone(current_turn_id())
        rows = AIUsage.objects.filter(user=self.user, metadata__turn_id=tid)
        self.assertEqual(rows.count(), 1)
        event = ActivityEvent.objects.get(project=self.project, name="_turn_step")
        self.assertEqual(event.details["turn_id"], tid)

    def test_two_button_actions_get_two_turn_ids(self):
        ids = []

        def work(ctx, args):
            ids.append(current_turn_id())
            return {"ok": 1}

        _cap("_turn_twice", work)
        dispatch("_turn_twice", {}, Actor.USER_BUTTON, self.scope)
        dispatch("_turn_twice", {}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(len(set(ids)), 2)


class ChatTurnIdTests(TransactionTestCase):
    """The chat producer thread starts with an empty context: it must bind the
    turn id the view made, so the agent's work and the charge carry it."""

    def test_chat_turn_work_and_charge_carry_the_given_turn_id(self):
        from langsmith.run_helpers import get_tracing_context
        from night_eyes.stream import stream_chat_sse

        user, project = _setup()
        seen = {}

        class _Chat:
            session = None

            async def stream(self, message, thread_id, resume=None):
                seen["turn"] = current_turn_id()
                seen["tags"] = get_tracing_context()["tags"]
                await _Spend(tin=1000).ainvoke("x")
                yield {"event": "on_tool_end", "name": "t", "data": {"output": "ok"}}

        class _Thread:
            project_id = project.pk

        out = "".join(stream_chat_sse(_Chat(), _Thread(), None, message="hi",
                                      turn_id="t-chat"))
        events = [json.loads(line[6:]) for line in out.split("\n") if line.startswith("data: ")]
        self.assertEqual(events[-1]["type"], "done")

        self.assertEqual(seen["turn"], "t-chat")
        self.assertIn("turn:t-chat", seen["tags"])
        row = AIUsage.objects.get(user=user)
        self.assertEqual(row.metadata["turn_id"], "t-chat")
