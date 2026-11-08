"""Caps refactor Phase 7 — page frames group each page's set (new tool names) in
lifecycle order, with the orientation globals budget-exempt on every page.

Fresh suite (the old night_eyes ranking tests were deleted 2026-07-03 to start
testing anew). Exercises night_eyes.ranking.rank_bound_tools against the live
capability registry.
"""
import actions.capabilities  # noqa: F401 — triggers registration side-effects
from django.test import SimpleTestCase

from night_eyes.ranking import rank_bound_tools

GLOBALS = ["get_project_overview"]

PAGES = [
    "characters", "character-studio", "world", "braindumps", "plot-threads",
    "outline", "lenses", "chapters", "charts-view", "story-so-far", "default",
]

# The bound (pre-bindable) own-set each page must surface. Toolbox-tier caps
# (quick_*, place_*, get_lens_templates) are find_tools-only, so they are NOT
# expected in the pre-bound frame.
OWN_SET = {
    "characters": {"get_characters", "get_character", "add_character", "update_character"},
    "world": {"get_world_entities", "add_world_entity", "update_world_entity"},
    "plot-threads": {"get_plot_threads", "get_thread", "add_plot_thread",
                     "insert_thread_beat", "update_thread_beat"},
    "outline": {"get_outline", "get_chapter", "add_scene"},
    "chapters": {"get_chapter_prose", "insert_scene_paragraphs"},
    "braindumps": {"get_braindumps", "add_braindump"},
}

# AI-facing names that no longer exist — a frame must never bind one.
STALE = {
    "get_scenes", "get_scene_beats", "get_scene_paragraphs", "propose_scene_edits",
    "update_braindump", "get_world", "get_project_meta", "get_grand_outline",
    "add_plot_thread_beat", "update_plot_thread_beat", "merge_thread_into_outline",
    "place_thread_beat", "invent_lens_from_ask", "get_lens_selections",
    # SA-222: placeholders removed — never bind them again.
    "get_health", "get_pages_info", "suggest_navigate",
}


class PageFrameTests(SimpleTestCase):
    def _names(self, page, budget=99):
        return [c.ai_name for c in rank_bound_tools(page, budget=budget)]

    def test_globals_on_every_page(self):
        for page in PAGES:
            names = set(self._names(page))
            self.assertTrue(set(GLOBALS) <= names, f"{page} missing globals")

    def test_globals_budget_exempt_and_first(self):
        # Budget 0 → only the globals survive, in declared order.
        self.assertEqual(self._names("characters", budget=0), GLOBALS)

    def test_each_page_binds_its_own_set(self):
        for page, expected in OWN_SET.items():
            names = set(self._names(page))
            self.assertTrue(expected <= names,
                            f"{page} missing {expected - names}")

    def test_no_stale_names_bound_anywhere(self):
        for page in PAGES:
            leaked = set(self._names(page)) & STALE
            self.assertFalse(leaked, f"{page} binds stale caps: {leaked}")

    def test_characters_frame_orders_own_set_after_globals(self):
        # Small budget → only frame-listed caps make the cut, in YAML order.
        names = self._names("characters", budget=4)
        self.assertEqual(names[:1], GLOBALS)
        self.assertEqual(names[1:5],
                         ["get_characters", "get_character",
                          "add_character", "update_character"])

    def test_threads_frame_orders_own_set_after_globals(self):
        names = self._names("plot-threads", budget=5)
        self.assertEqual(names[:1], GLOBALS)
        self.assertEqual(names[1:6],
                         ["get_plot_threads", "get_thread", "add_plot_thread",
                          "update_thread_beat", "insert_thread_beat"])
