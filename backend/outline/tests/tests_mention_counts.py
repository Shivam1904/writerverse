"""Each scene stores how often each entity is @mentioned in its prose
(`Scene.mention_counts`, SA-138). The character page's presence chart reads it
from the lean outline, so it lights up without the paid noun-resolver and
without ever loading prose. These check every prose writer keeps it current.
"""
from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.test import SimpleTestCase

from outline import outline_rows as rows
from outline import outline_writes as ow
from outline.models import Chapter, Scene
from outline.store import load_outline, save_outline
from outline.tests.tests_outline_tables import OutlineTablesBase


def _mention(entity_id, entity_type="character", label="Mara"):
    return {"type": "mention", "attrs": {"id": entity_id, "label": label, "entityType": entity_type}}


def _doc_with(*inline):
    """One paragraph holding the given inline nodes (text and mention nodes)."""
    return {"type": "doc", "content": [{"type": "paragraph", "content": list(inline)}]}


def _text(t):
    return {"type": "text", "text": t}


class MentionCountsTests(SimpleTestCase):
    def test_counts_every_mention_node_by_type_and_id(self):
        doc = {"type": "doc", "content": [
            {"type": "paragraph", "content": [_mention("51"), _text(" met "), _mention(52)]},
            {"type": "blockquote", "content": [
                {"type": "paragraph", "content": [_mention("51"), _mention("7", "world", "Keep")]}]},
        ]}
        self.assertEqual(rows.mention_counts(doc),
                         {"character": {"51": 2, "52": 1}, "world": {"7": 1}})

    def test_no_mentions_is_none(self):
        self.assertIsNone(rows.mention_counts(_doc_with(_text("Plain prose."))))
        self.assertIsNone(rows.mention_counts(None))

    def test_broken_mention_nodes_are_skipped(self):
        doc = _doc_with({"type": "mention", "attrs": {"label": "no id", "entityType": "character"}},
                        {"type": "mention", "attrs": {"id": "3"}},  # no type
                        {"type": "mention"})
        self.assertIsNone(rows.mention_counts(doc))


class MentionCountsStoredTests(OutlineTablesBase):
    def setUp(self):
        super().setUp()
        save_outline(self.ctx, self.outline())
        self.sess = ProjectScope(self.project.pk)

    def _save(self, scene_id, doc):
        # A title is passed so no (paid) auto-title runs; auto_analyze off too.
        res = dispatch("save_scene_content", {"scene_id": scene_id, "text": "T", "content": doc,
                                              "auto_analyze": False},
                       Actor.USER_BUTTON, self.sess)
        self.assertEqual(res.status, "ran", res)
        return res

    def _lean_scene(self, uid):
        go = load_outline(self.ctx, include_prose=False)
        return next(s for a in go["acts"] for c in a["chapters"] for s in c["scenes"]
                    if s["id"] == uid)

    def test_prose_save_stores_counts_and_lean_outline_shows_them(self):
        pk = str(self.mara.pk)
        res = self._save("sc-1", _doc_with(_mention(pk), _text(" waits for "), _mention(pk)))
        self.assertEqual(Scene.objects.get(uid="sc-1").mention_counts, {"character": {pk: 2}})
        self.assertEqual(res.result["scene"]["mention_counts"], {"character": {pk: 2}})
        self.assertEqual(self._lean_scene("sc-1")["mention_counts"], {"character": {pk: 2}})

    def test_removing_the_last_mention_clears_the_counts(self):
        self._save("sc-1", _doc_with(_mention(self.mara.pk), _text(" waits.")))
        self._save("sc-1", _doc_with(_text("She waits.")))
        self.assertIsNone(Scene.objects.get(uid="sc-1").mention_counts)
        self.assertNotIn("mention_counts", self._lean_scene("sc-1"))

    def test_whole_outline_save_counts_prose_and_lean_save_keeps_them(self):
        go = load_outline(self.ctx)
        go["acts"][0]["chapters"][0]["scenes"][0]["content"] = _doc_with(_mention(9), _text(" ran."))
        save_outline(self.ctx, go)
        self.assertEqual(Scene.objects.get(uid="sc-1").mention_counts, {"character": {"9": 1}})
        # A lean dict (no prose) saved back must not wipe the counts, and a
        # stale `mention_counts` sent by a client is ignored (never stored in extra).
        lean = load_outline(self.ctx, include_prose=False)
        lean["acts"][0]["chapters"][0]["scenes"][0]["mention_counts"] = {"character": {"1": 99}}
        save_outline(self.ctx, lean)
        scene = Scene.objects.get(uid="sc-1")
        self.assertEqual(scene.mention_counts, {"character": {"9": 1}})
        self.assertNotIn("mention_counts", scene.extra)

    def test_new_scene_with_prose_gets_counts(self):
        chapter = Chapter.objects.get(uid="ch-1")
        ow.insert_item(self.project.pk, "scene", chapter,
                       {"id": "sc-new", "text": "New",
                        "content": _doc_with(_mention(4), _mention(4))})
        self.assertEqual(Scene.objects.get(uid="sc-new").mention_counts, {"character": {"4": 2}})
