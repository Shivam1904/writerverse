"""SA-181: a crashed chat turn never shows framework text to the author, and
the step budget still fits the tool calls each profile was tuned for.

Pure tests — no DB, no LLM: a fake `chat` whose `stream()` raises, and a real
`create_react_agent` (same shape as graph.py, with a pre_model_hook) driven by
a scripted fake model.
"""
import json
import unittest

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.errors import GraphRecursionError
from langgraph.prebuilt import create_react_agent

from night_eyes.graph import graph_step_limit
from night_eyes.stream import stream_chat_sse

_RAW = (
    "Recursion limit of 16 reached without hitting a stop condition. You can "
    "increase the limit by setting the recursion_limit config key. For "
    "troubleshooting, visit: https://docs.langchain.com/oss/python/langgraph/"
    "errors/GRAPH_RECURSION_LIMIT"
)


class _FakeThread:
    # project_id None → _settle_chat_turn no-ops (no ORM).
    project_id = None


class _FailingChat:
    session = None

    def __init__(self, exc):
        self._exc = exc

    async def stream(self, message, thread_id, resume=None):
        raise self._exc
        yield  # pragma: no cover — makes this an async generator


def _events(chat):
    out = "".join(stream_chat_sse(chat, _FakeThread(), thread_id="t1", message="hi"))
    return [json.loads(line[6:]) for line in out.split("\n") if line.startswith("data: ")]


def _errors(chat):
    return [e["data"] for e in _events(chat) if e.get("type") == "error"]


class ChatErrorTextTests(unittest.TestCase):
    def test_recursion_limit_shows_apology_not_framework_text(self):
        with self.assertLogs("writerverse.consistency", level="ERROR"):
            errors = _errors(_FailingChat(GraphRecursionError(_RAW)))
        self.assertEqual(len(errors), 1)
        text = errors[0]
        self.assertIn("Sorry", text)
        self.assertIn("try again", text)
        for leak in ("recursion", "config key", "langchain", "langgraph", "GRAPH_"):
            self.assertNotIn(leak.lower(), text.lower())

    def test_other_exception_shows_generic_apology(self):
        with self.assertLogs("writerverse.consistency", level="ERROR"):
            errors = _errors(_FailingChat(ValueError("INVALID_CHAT_HISTORY: tool_call_id x")))
        self.assertEqual(len(errors), 1)
        self.assertIn("Sorry", errors[0])
        self.assertNotIn("INVALID_CHAT_HISTORY", errors[0])

    def test_turn_still_ends_with_done(self):
        with self.assertLogs("writerverse.consistency", level="ERROR"):
            events = _events(_FailingChat(GraphRecursionError(_RAW)))
        self.assertEqual(events[-1]["type"], "done")


@tool
def read_story(query: str = "") -> str:
    """Read part of the story."""
    return "ok"


class _ScriptedModel(GenericFakeChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


def _fits(n_tool_calls, profile_limit):
    """Does a turn of `n_tool_calls` sequential tool calls + a final answer
    finish under this profile's limit, on the graph shape graph.py builds?"""
    replies = [
        AIMessage(content="", tool_calls=[{"name": "read_story", "args": {}, "id": f"c{i}"}])
        for i in range(n_tool_calls)
    ] + [AIMessage(content="done")]
    graph = create_react_agent(
        _ScriptedModel(messages=iter(replies)), [read_story],
        pre_model_hook=lambda state: {},
    )
    try:
        out = graph.invoke(
            {"messages": [("user", "hi")]},
            {"recursion_limit": graph_step_limit(profile_limit)},
        )
    except GraphRecursionError:
        return False
    # Near the limit LangGraph may stop early with "need more steps" instead
    # of raising — that also means the turn didn't fit.
    return out["messages"][-1].content == "done"


class StepBudgetTests(unittest.TestCase):
    def test_profiles_get_the_tool_calls_they_were_tuned_for(self):
        # profile limit L was tuned for 2 steps per tool call → (L - 1) // 2 calls
        for profile_limit, calls in ((8, 3), (12, 5), (16, 7)):
            with self.subTest(profile_limit=profile_limit):
                self.assertTrue(_fits(calls, profile_limit))
                self.assertFalse(_fits(calls + 1, profile_limit))


if __name__ == "__main__":
    unittest.main()
