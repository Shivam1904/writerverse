"""Keystone regression: Night Eyes' chat tool surface is a fixed closed set.

A capability is visible to the AI chat iff Actor.CHAT is in its actors. This test
pins the exact AI-facing tool names (tool_name override, else name) so any future
cap that defaults to CHAT — or any accidental removal — fails loudly here. See
docs/superpowers/specs/2026-06-09-night-eyes-tool-surface-redesign-design.md.
"""
from django.test import SimpleTestCase

import actions.capabilities  # noqa: F401 — triggers registration side-effects
from actions.capabilities.registry import all_capabilities
from actions.capabilities.spec import Actor

# AI-facing tool names (tool_name override, else name).
# Caps refactor (2026-07-03, caps/caps_ordered.md): Phase 0 prunes 5 caps from
# chat — get_scenes, get_scene_beats (whole-book beat dump; violates series scale),
# propose_scene_edits, update_braindump, get_lens_selections. Internal names below
# are still pre-rename; renames land in Phases 1–6.
EXPECTED = {
    # readers
    "get_plot_threads", "get_thread", "get_outline", "get_chapter",
    "get_chapter_prose", "search_prose", "get_world_entities", "get_characters",
    "get_character", "get_braindumps", "get_project_overview",
    # writers
    "add_plot_thread", "insert_thread_beat", "update_thread_beat",
    "add_scene", "insert_scene_paragraphs",
    "add_world_entity", "update_world_entity", "add_character",
    "update_character", "add_braindump",
    "update_project_overview",
    # toolbox tier (chat_exposure="toolbox") — chat-reachable but NOT pre-bound
    # once the find_tools exposure filter lands (agentic-core); see spec.py.
    "quick_add_thread", "quick_place_beats_in_outline",
    "place_thread_beat_in_outline", "get_lens_templates",
    "quick_invent_lens",
}


class ChatSurfaceTests(SimpleTestCase):
    def test_chat_tool_surface_is_exactly_the_closed_set(self):
        surface = {
            (c.tool_name or c.name)
            for c in all_capabilities() if Actor.CHAT in c.actors
        }
        self.assertEqual(
            surface, EXPECTED,
            f"\n  unexpected (remove CHAT): {sorted(surface - EXPECTED)}"
            f"\n  missing (add CHAT): {sorted(EXPECTED - surface)}",
        )
        self.assertEqual(len(EXPECTED), 27)
