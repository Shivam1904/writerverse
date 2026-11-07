"""outline.tree: walking the outline dict."""
from django.test import SimpleTestCase

from outline.tree import find_node, iter_scenes, scene_crumb

OUTLINE = {"acts": [
    {"id": "ac-1", "text": "Act I", "chapters": [
        {"id": "ch-1", "text": "", "scenes": [
            {"id": "sc-1", "text": "Arrival", "beats": [{"id": "bt-1", "text": "x"}]},
            "junk",
            {"id": "sc-2", "text": "Storm", "beats": []},
        ]},
    ]},
    {"id": "ac-2", "text": "Act II", "chapters": [
        {"id": "ch-2", "text": "Two", "scenes": [{"id": "sc-3"}]},
    ]},
]}


class TreeTests(SimpleTestCase):
    def test_iter_scenes_in_book_order_with_indexes(self):
        places = list(iter_scenes(OUTLINE))
        self.assertEqual([p.scene["id"] for p in places], ["sc-1", "sc-2", "sc-3"])
        self.assertEqual((places[1].act_index, places[1].chapter_index, places[1].scene_index),
                         (0, 0, 2))
        self.assertEqual(places[2].chapter["id"], "ch-2")

    def test_iter_scenes_on_bad_input(self):
        for v in (None, {}, [], {"acts": None}):
            self.assertEqual(list(iter_scenes(v)), [])

    def test_find_node(self):
        self.assertEqual(find_node(OUTLINE, "scene", "sc-3"), {"id": "sc-3"})
        self.assertEqual(find_node(OUTLINE, "beat", "bt-1")["text"], "x")
        self.assertEqual(find_node(OUTLINE, "chapter", "ch-2")["text"], "Two")
        self.assertEqual(find_node(OUTLINE, "act", "ac-1")["text"], "Act I")
        self.assertIsNone(find_node(OUTLINE, "scene", "ch-1"))  # wrong type
        self.assertIsNone(find_node(OUTLINE, "scene", None))

    def test_scene_crumb(self):
        p = next(iter_scenes(OUTLINE))
        self.assertEqual(scene_crumb(p), "Act I → Chapter → Arrival")
