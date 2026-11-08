"""Keystone regression: everything Night Eyes is TOLD about its tools must match
the tools it really has.

What the AI reads about its tools is written by hand in three places, apart from
the capability registry that decides what really exists:

  - night_eyes/prompts.py           — the always-on system prompt
  - night_eyes/frames.py            — GLOBAL_TOOL_NAMES, bound on every page
  - night_eyes/config/chat_frames.yml — per-page tool lists, prompts, suffixes

Each time those drifted from the registry, the model was told to call a tool it
could not call (or one that did nothing), wasted steps the author pays for, and
improvised or gave up:

  - 2026-07 → 09: eight renamed/dropped names still in the prompt
    (add_plot_thread_beat, get_scenes, update_braindump, …)
  - SA-222: three placeholder tools (get_health, get_pages_info,
    suggest_navigate) returned "NOT IMPLEMENTED YET" but were bound every turn
  - the prompt named registry names the model never sees (get_project_meta,
    get_world, update_project_meta, invent_lens_from_ask) instead of their
    AI-facing names (get_project_overview, get_world_entities,
    update_project_overview, quick_invent_lens)

So this suite checks, against the live registry, using the AI-FACING name
(`Capability.ai_name` — the only name the model is ever shown):

  1. every tool named in prompts.py and in any frame's text is chat-callable;
  2. every name in a frame's reads/actions/secondary and GLOBAL_TOOL_NAMES is a
     BOUND chat tool (ranking.py silently skips anything else, so a wrong name
     there just vanishes from the page);
  3. no chat-callable capability is a stub (`Capability.stub`), and register()
     refuses to make one.
"""
import re

import actions.capabilities  # noqa: F401 — triggers registration side-effects
from actions.capabilities import registry
from actions.capabilities.registry import all_capabilities
from actions.capabilities.spec import Actor, Capability, Route
from django.test import SimpleTestCase

from night_eyes import frames, prompts

# Verbs that start a tool name. Matches the snake_case tool tokens the prompt
# and frames write, e.g. `update_character`, get_chapter_prose, quick_invent_lens.
_TOOL_RE = re.compile(
    r"\b((?:get|add|update|delete|propose|insert|search|generate|analyse|analyze"
    r"|merge|accept|reject|list|set|create|remove|quick|place|suggest|invent"
    r"|bind|unbind)_[a-z_]+)\b"
)

# Named in the prompt but never dispatched as capabilities — the agent runtime
# provides these, so they are legitimately absent from the registry.
_NOT_CAPABILITIES = {"find_tools", "ask_user"}


def _prompt_text() -> str:
    """Every prompt constant defined in night_eyes.prompts, concatenated."""
    return "\n".join(
        v for k, v in vars(prompts).items()
        if isinstance(v, str) and not k.startswith("__")
    )


def _chat_caps() -> list[Capability]:
    return [c for c in all_capabilities() if Actor.CHAT in c.actors]


def _chat_ai_names() -> set[str]:
    """AI-facing names of every chat-callable capability (bound or toolbox)."""
    return {c.ai_name for c in _chat_caps()}


def _bound_ai_names() -> set[str]:
    return {c.ai_name for c in _chat_caps() if c.chat_exposure == "bound"}


def _mentioned(text: str) -> set[str]:
    return set(_TOOL_RE.findall(text or "")) - _NOT_CAPABILITIES


def _frame_text(frame: dict) -> str:
    """The prose a frame shows the AI: its prompt + its tool suffixes."""
    return "\n".join([frame.get("prompt") or "",
                      *((frame.get("suffixes") or {}).values())])


class PromptToolNameTests(SimpleTestCase):
    def test_every_tool_named_in_the_prompt_is_chat_callable(self):
        unreachable = sorted(_mentioned(_prompt_text()) - _chat_ai_names())
        self.assertEqual(
            unreachable, [],
            "\n  These tool names appear in night_eyes/prompts.py but are NOT "
            "the AI-facing name of any chat-callable tool, so the model is told "
            f"to call tools it cannot see:\n    {unreachable}\n"
            "  Fix by (a) using the capability's ai_name (tool_name, else name), "
            "or (b) adding Actor.CHAT to the capability — and update "
            "test_chat_surface.py's EXPECTED set if you choose (b).",
        )

    def test_the_prompt_actually_names_some_tools(self):
        """Guard the guard: if the regex or prompt structure changes such that
        nothing is matched, the test above would pass vacuously."""
        mentioned = _mentioned(_prompt_text())
        self.assertGreater(
            len(mentioned), 15,
            f"Only matched {len(mentioned)} tool names in the prompt — the prompt "
            "or the matching regex probably changed shape, so this suite is no "
            "longer really checking anything.",
        )


class FrameToolNameTests(SimpleTestCase):
    def test_global_tools_are_bound_chat_tools(self):
        bad = sorted(set(frames.GLOBAL_TOOL_NAMES) - _bound_ai_names())
        self.assertEqual(bad, [], f"GLOBAL_TOOL_NAMES lists non-bound tools: {bad}")

    def test_frame_tool_lists_name_only_bound_chat_tools(self):
        bound = _bound_ai_names()
        problems = {}
        for page, frame in frames._load().items():
            listed = ((frame.get("reads") or []) + (frame.get("actions") or [])
                      + (frame.get("secondary") or []))
            bad = sorted(set(listed) - bound)
            if bad:
                problems[page] = bad
        self.assertEqual(
            problems, {},
            "\n  chat_frames.yml lists tools that are not bound chat tools (use "
            "the AI-facing name; toolbox tools load via find_tools, not frames):"
            f"\n    {problems}",
        )

    def test_frame_text_names_only_chat_tools(self):
        chat = _chat_ai_names()
        problems = {}
        for page, frame in frames._load().items():
            bad = sorted((_mentioned(_frame_text(frame))
                          | set((frame.get("suffixes") or {}).keys())) - chat)
            if bad:
                problems[page] = bad
        self.assertEqual(
            problems, {},
            "\n  chat_frames.yml prompts/suffixes name tools the AI cannot "
            f"call:\n    {problems}",
        )

    def test_frames_actually_name_some_tools(self):
        """Guard the guard for the frame-text check."""
        names = set()
        for frame in frames._load().values():
            names |= _mentioned(_frame_text(frame))
        self.assertGreater(len(names), 10)


class NoStubToolsForChatTests(SimpleTestCase):
    def test_no_chat_callable_capability_is_a_stub(self):
        stubs = sorted(c.name for c in _chat_caps() if c.stub)
        self.assertEqual(stubs, [], f"stub capabilities reachable by chat: {stubs}")

    def test_register_refuses_a_chat_callable_stub(self):
        snap = registry.snapshot()
        try:
            with self.assertRaises(ValueError):
                registry.register(Capability(
                    name="_test_stub_for_chat", description="x",
                    route=Route.READ, stub=True,
                ))
            # Without Actor.CHAT a stub may still be registered (e.g. for a page).
            registry.register(Capability(
                name="_test_stub_no_chat", description="x", route=Route.READ,
                stub=True, actors=(Actor.USER_BUTTON,),
            ))
        finally:
            registry.restore(snap)
