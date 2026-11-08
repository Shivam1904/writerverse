"""Hidden-context channel — renderer registry + live-replaces-static rule.

Pure-function tests (no DB): `render_context_blocks` / `has_live_hints` and the
`build_system_prompt` wiring that swaps the static page hint block for the live
one when a turn carries `live_hints`.
"""
import unittest
from types import SimpleNamespace

from django.test import TestCase

from night_eyes.context_blocks import (
    enrich_context,
    has_live_hints,
    render_context_blocks,
)
from night_eyes.prompts import build_system_prompt

# Distinctive header phrases — used to assert which hint block is present.
STATIC_PHRASE = "the nudge cards the author can see in the rail"
LIVE_PHRASE = "the exact nudge cards on the author's screen"


class RenderContextBlocksTests(unittest.TestCase):
    def test_empty_context_renders_nothing(self):
        self.assertEqual(render_context_blocks(None), [])
        self.assertEqual(render_context_blocks({}), [])
        self.assertFalse(has_live_hints(None))

    def test_unknown_keys_ignored(self):
        self.assertEqual(render_context_blocks({"nope": ["x"]}), [])
        self.assertFalse(has_live_hints({"nope": ["x"]}))

    def test_live_hints_rendered_as_one_block(self):
        ctx = {"live_hints": ["Roster is empty — add the first character.",
                              "Map out every subplot → plot-threads."]}
        blocks = render_context_blocks(ctx)
        self.assertEqual(len(blocks), 1)
        block = blocks[0]
        self.assertIn(LIVE_PHRASE, block)
        self.assertIn("- Roster is empty — add the first character.", block)
        self.assertIn("- Map out every subplot → plot-threads.", block)
        self.assertTrue(has_live_hints(ctx))

    def test_empty_and_blank_items_drop_to_no_block(self):
        # all-blank / wrong-type payload yields no block and reads as "no live hints"
        for payload in ([], ["", "   "], [None, 3], "not-a-list"):
            ctx = {"live_hints": payload}
            self.assertEqual(render_context_blocks(ctx), [])
            self.assertFalse(has_live_hints(ctx))


class BuildSystemPromptHintRuleTests(unittest.TestCase):
    # 'characters' is a page that declares static side-rail hints in chat_frames.yml.
    PAGE = "characters"

    def test_no_context_keeps_static_block(self):
        prompt = build_system_prompt(self.PAGE, None, [])
        self.assertIn(STATIC_PHRASE, prompt)
        self.assertNotIn(LIVE_PHRASE, prompt)

    def test_live_hints_replace_static_block(self):
        prompt = build_system_prompt(
            self.PAGE, {"live_hints": ["Roster is empty — add the first character."]}, [],
        )
        self.assertIn(LIVE_PHRASE, prompt)
        self.assertIn("- Roster is empty — add the first character.", prompt)
        # live REPLACES static — the static guess must be gone
        self.assertNotIn(STATIC_PHRASE, prompt)

    def test_empty_live_hints_falls_back_to_static(self):
        # a client that sends the key but with nothing visible keeps the static block
        prompt = build_system_prompt(self.PAGE, {"live_hints": []}, [])
        self.assertIn(STATIC_PHRASE, prompt)
        self.assertNotIn(LIVE_PHRASE, prompt)


class RenderActiveSceneTests(unittest.TestCase):
    """The active-scene block puts the current scene's prose in front of the model
    so a "check this scene" request is grounded, not answered hypothetically."""

    ACTIVE_PHRASE = "THE SCENE THE AUTHOR IS EDITING RIGHT NOW"

    def test_active_scene_prose_rendered(self):
        ctx = {"active_scene": {"title": "The Dive", "paragraphs": [
            {"index": 0, "text": "She dove into the churning sea."},
            {"index": 1, "text": "   "},   # blank paragraph dropped
            {"index": 2, "text": "Salt stung her eyes."},
        ]}}
        blocks = render_context_blocks(ctx)
        self.assertEqual(len(blocks), 1)
        block = blocks[0]
        self.assertIn(self.ACTIVE_PHRASE, block)
        self.assertIn("The Dive", block)
        self.assertIn("She dove into the churning sea.", block)
        self.assertIn("Salt stung her eyes.", block)

    def test_active_scene_is_bounded(self):
        from night_eyes.context_blocks import ACTIVE_SCENE_MAX_CHARS
        para = "x" * 1000
        n = ACTIVE_SCENE_MAX_CHARS // 1000 + 5
        ctx = {"active_scene": {"title": "Long", "paragraphs": [
            {"index": i, "text": para} for i in range(n)]}}
        block = render_context_blocks(ctx)[0]
        self.assertLess(len(block), ACTIVE_SCENE_MAX_CHARS + 1000)
        self.assertIn("Cut here", block)
        self.assertIn("get_chapter_prose", block)

    def test_one_giant_paragraph_is_cut_with_the_note(self):
        from night_eyes.context_blocks import ACTIVE_SCENE_MAX_CHARS
        ctx = {"active_scene": {"title": "Wall", "paragraphs": [
            {"index": 0, "text": "y" * (ACTIVE_SCENE_MAX_CHARS * 2)}]}}
        block = render_context_blocks(ctx)[0]
        self.assertLess(len(block), ACTIVE_SCENE_MAX_CHARS + 1000)
        self.assertIn("Cut here", block)
        self.assertIn("get_chapter_prose", block)

    def test_scene_that_fits_has_no_cut_note(self):
        ctx = {"active_scene": {"title": "Short", "paragraphs": [
            {"index": 0, "text": "A short line."}]}}
        self.assertNotIn("Cut here", render_context_blocks(ctx)[0])

    def test_active_scene_empty_prose_yields_no_block(self):
        for payload in ({"paragraphs": []}, {"paragraphs": [{"text": "  "}]},
                        "not-a-dict", {}):
            self.assertEqual(render_context_blocks({"active_scene": payload}), [])


class EnrichContextTests(TestCase):
    """enrich_context resolves the active scene's SAVED prose from
    context['scene_id'] (server-authoritative — the frontend sends only the id)."""

    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from outline.store import save_outline
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="enrich-scene@test.com", password="test")
        cls.project = Project.objects.create(title="T", user=user)
        save_outline(SimpleNamespace(project_id=cls.project.pk), {
            "acts": [{"id": "ac_1", "chapters": [{"id": "ch_1", "scenes": [
                {"id": "sc_9", "text": "The Dive", "content": {
                    "type": "doc", "content": [{"type": "paragraph", "content": [
                        {"type": "text",
                         "text": "She dove without a second thought."}]}]}}]}]}],
        })

    def _session(self):
        return SimpleNamespace(project_id=self.project.id)

    def test_enrich_adds_active_scene_prose(self):
        out = enrich_context({"scene_id": "sc_9"}, self._session())
        self.assertIn("active_scene", out)
        self.assertEqual(out["active_scene"]["title"], "The Dive")
        self.assertEqual(out["active_scene"]["paragraphs"][0]["text"],
                         "She dove without a second thought.")

    def test_enrich_is_noop_without_scene_id(self):
        self.assertEqual(enrich_context({}, self._session()), {})

    def test_enrich_is_noop_for_missing_scene(self):
        out = enrich_context({"scene_id": "nope"}, self._session())
        self.assertNotIn("active_scene", out)


if __name__ == "__main__":
    unittest.main()


class WritePagePromptTests(TestCase):
    """The live bug (2026-10-03): on the Write page Night Eyes answered "who is
    in this scene?" with "I can't tell" because the turn carried no scene id.
    With the ids the frontend now sends (modules/chat/pageContext.ts), the
    chapters prompt names the open chapter + scene AND carries its prose."""

    PROSE = "The lighthouse keeper counted the ships that never came back."

    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from outline.store import save_outline
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="write-page-prompt@test.com", password="test")
        cls.project = Project.objects.create(title="T", user=user)
        save_outline(SimpleNamespace(project_id=cls.project.pk), {
            "acts": [{"id": "ac_1", "chapters": [{
                "id": "ch_keeper", "title": "The Keeper", "scenes": [{
                    "id": "sc_watch", "text": "Night watch", "content": {
                        "type": "doc", "content": [{"type": "paragraph", "content": [
                            {"type": "text", "text": cls.PROSE}]}]}}]}]}],
        })

    def _prompt(self, context):
        ctx = enrich_context(context, SimpleNamespace(project_id=self.project.id))
        return build_system_prompt("chapters", ctx, [])

    def test_open_scene_prose_and_ids_reach_the_prompt(self):
        prompt = self._prompt({"chapter_id": "ch_keeper", "scene_id": "sc_watch"})
        self.assertIn("Open chapter id: ch_keeper", prompt)
        self.assertIn("Open scene id: sc_watch", prompt)
        self.assertIn("THE SCENE THE AUTHOR IS EDITING RIGHT NOW", prompt)
        self.assertIn("Night watch", prompt)
        self.assertIn(self.PROSE, prompt)

    def test_unknown_chapter_id_is_dropped(self):
        prompt = self._prompt({"chapter_id": "ch_not_mine", "scene_id": "sc_watch"})
        self.assertNotIn("ch_not_mine", prompt)
        self.assertIn(self.PROSE, prompt)

    def test_without_ids_no_scene_block(self):
        # What the old frontend sent: no ids, so no prose (the bug).
        self.assertNotIn(self.PROSE, self._prompt({}))
