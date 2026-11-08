"""Heal an orphaned proposal interrupt before a fresh chat turn.

A chat-source proposal pauses the LangGraph agent on `interrupt()`, leaving an
AIMessage whose tool_call has no matching ToolMessage. The LIVE accept/reject
path resolves the Proposal row through the capability facade
(`accept_proposal`/`reject_proposal`) and never resumes this graph — so the
dangling tool_call survives. The next fresh turn would then hand the model an
unmatched tool_call and crash with INVALID_CHAT_HISTORY.

`graph._heal_messages` closes each dangling tool_call with a synthetic
ToolMessage tagged with the proposal's current status; writing it back via
`update_state` also clears the stale interrupt. These tests cover:

  1. `_dangling_tool_calls` — the detector (pure, no DB).
  2. `_proposal_outcome` — Proposal status → resume marker (DB-backed).
  3. End-to-end mechanic against a real `create_react_agent` + MemorySaver +
     a scripted (no-API) model: interrupt → heal → next turn runs clean.
"""
from actions.models import Proposal
from django.contrib.auth import get_user_model
from django.test import TestCase
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
from langgraph.types import interrupt
from projects.models import Project

from night_eyes.graph import (
    _dangling_tool_calls,
    _heal_messages,
    _proposal_outcome,
)
from night_eyes.models import ChatThread

User = get_user_model()

_THREAD = "11111111-1111-1111-1111-111111111111"
_CAP = "update_project_meta"


@tool
def update_project_meta(synopsis: str = "", perspective: str = "") -> str:
    """Update project meta. Proposes (pauses the graph)."""
    answer = interrupt({"kind": "proposal", "capability": _CAP})
    return f"[PROPOSAL_RESULT] {answer}"


class _ScriptedModel(BaseChatModel):
    """Fake chat model that replays a fixed list of AIMessages — no API key,
    deterministic. Supports `bind_tools` (create_react_agent binds tools)."""

    responses: list[AIMessage] = []
    i: int = 0

    @property
    def _llm_type(self):  # pragma: no cover - identity only
        return "scripted"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        msg = self.responses[self.i]
        self.i += 1
        return ChatResult(generations=[ChatGeneration(message=msg)])


def _tool_call_ai():
    return AIMessage(
        content="",
        tool_calls=[{
            "name": _CAP,
            "args": {"synopsis": "", "perspective": "Third-person"},
            "id": "call_ABC",
            "type": "tool_call",
        }],
    )


class DanglingDetectorTests(TestCase):
    def test_detects_unmatched_tool_call(self):
        msgs = [HumanMessage(content="set meta"), _tool_call_ai()]
        dangling = _dangling_tool_calls(msgs)
        self.assertEqual([tc["id"] for tc in dangling], ["call_ABC"])

    def test_answered_tool_call_is_not_dangling(self):
        msgs = [
            HumanMessage(content="set meta"),
            _tool_call_ai(),
            ToolMessage(content="done", tool_call_id="call_ABC"),
        ]
        self.assertEqual(_dangling_tool_calls(msgs), [])

    def test_no_tool_calls_is_empty(self):
        msgs = [HumanMessage(content="hi"), AIMessage(content="hello")]
        self.assertEqual(_dangling_tool_calls(msgs), [])


class ProposalOutcomeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        user = User.objects.create_user(email="h@e.com", password="x")
        cls.project = Project.objects.create(title="Heal", user=user)
        cls.thread = ChatThread.objects.create(
            project=cls.project, thread_id=_THREAD, page="world",
        )

    def _make(self, status):
        return Proposal.objects.create(
            project=self.project, thread_id=_THREAD, source="chat",
            page="world", capability=_CAP, args={}, proposal={}, status=status,
        )

    def test_no_row_is_superseded(self):
        self.assertIn("[SUPERSEDED]", _proposal_outcome(_THREAD, "no_such_cap"))

    def test_applied_maps_to_accepted_marker(self):
        self._make(Proposal.STATUS_APPLIED)
        self.assertIn("[PROPOSAL_ACCEPTED]", _proposal_outcome(_THREAD, _CAP))

    def test_rejected_maps_to_rejected_marker(self):
        self._make(Proposal.STATUS_REJECTED)
        self.assertIn("[PROPOSAL_REJECTED]", _proposal_outcome(_THREAD, _CAP))

    def test_proposed_maps_to_pending_marker(self):
        self._make(Proposal.STATUS_PROPOSED)
        out = _proposal_outcome(_THREAD, _CAP)
        self.assertIn("[PROPOSAL_PENDING]", out)
        self.assertIn("do NOT re-issue", out)

    def test_most_recent_row_wins(self):
        self._make(Proposal.STATUS_REJECTED)
        self._make(Proposal.STATUS_APPLIED)  # newer
        self.assertIn("[PROPOSAL_ACCEPTED]", _proposal_outcome(_THREAD, _CAP))


class HealMechanicTests(TestCase):
    """The real LangGraph round-trip: a dangling interrupt would crash the next
    turn; healing first lets it run."""

    @classmethod
    def setUpTestData(cls):
        user = User.objects.create_user(email="m@e.com", password="x")
        cls.project = Project.objects.create(title="Mech", user=user)
        ChatThread.objects.create(
            project=cls.project, thread_id=_THREAD, page="world",
        )
        Proposal.objects.create(
            project=cls.project, thread_id=_THREAD, source="chat",
            page="world", capability=_CAP, args={}, proposal={},
            status=Proposal.STATUS_APPLIED,
        )

    def _graph(self):
        model = _ScriptedModel(responses=[
            _tool_call_ai(),                               # turn 1: propose
            AIMessage(content="Applied — now, your villain…"),  # turn 2: reply
        ])
        saver = MemorySaver()
        return create_react_agent(
            model, [update_project_meta], checkpointer=saver,
        )

    def test_unhealed_next_turn_raises(self):
        # Sync graph API (MemorySaver supports it) so the DB-backed heal path
        # runs in the test thread — no async/sync-ORM bridge needed.
        graph = self._graph()
        config = {"configurable": {"thread_id": _THREAD}, "recursion_limit": 12}

        list(graph.stream(
            {"messages": [HumanMessage(content="set my synopsis")]}, config=config,
        ))
        # A new message without healing the dangling tool_call must blow up.
        with self.assertRaises(ValueError):
            list(graph.stream(
                {"messages": [HumanMessage(content="what about my villain?")]},
                config=config,
            ))

    def test_healed_next_turn_runs_clean(self):
        graph = self._graph()
        config = {"configurable": {"thread_id": _THREAD}, "recursion_limit": 12}

        list(graph.stream(
            {"messages": [HumanMessage(content="set my synopsis")]}, config=config,
        ))
        messages = graph.get_state(config).values["messages"]
        self.assertTrue(_dangling_tool_calls(messages))  # precondition

        healed = _heal_messages(messages, _THREAD)
        self.assertEqual(len(healed), 1)
        self.assertIn("[PROPOSAL_ACCEPTED]", healed[0].content)

        graph.update_state(config, {"messages": healed})
        after = graph.get_state(config).values["messages"]
        self.assertEqual(_dangling_tool_calls(after), [])

        # The new turn now runs without INVALID_CHAT_HISTORY.
        list(graph.stream(
            {"messages": [HumanMessage(content="what about my villain?")]},
            config=config,
        ))
        final = graph.get_state(config).values["messages"]
        self.assertEqual(final[-1].content, "Applied — now, your villain…")
