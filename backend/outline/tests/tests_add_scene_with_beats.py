"""add_scene_with_beats — create a scene seeded with dropped beats, auto-titled.

The title comes from a billable LLM call (generate_title); these tests mock it so
nothing paid runs.
"""
from types import SimpleNamespace
from unittest.mock import patch

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.test import TestCase


def _outline_data():
    return {"base_template": "three_act", "acts": [
        {"id": "ac1", "text": "Act I", "chapters": [
            {"id": "ch1", "text": "Ch 1", "scenes": [
                {"id": "sc1", "text": "Existing", "beats": [], "thread": None, "words": 0},
            ]},
        ]},
    ]}


_TITLE_FN = "projects.capabilities.execute_titles.generate_title"


class AddSceneWithBeatsTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project

        from outline.store import save_outline
        self.user = get_user_model().objects.create_user(email="t@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline_data())

    def _scenes(self, sess):
        from outline.store import load_outline
        return load_outline(sess)["acts"][0]["chapters"][0]["scenes"]

    def test_creates_scene_with_beats_appended_and_titled(self):
        sess = ProjectScope(self.project.id)
        with patch(_TITLE_FN, return_value={"title": "Crossing The River"}) as m:
            res = dispatch(
                "add_scene_with_beats",
                {"chapter_id": "ch1", "beats": [
                    "They reach the river",
                    {"text": "The bridge is out", "kind": "text"},
                ]},
                Actor.USER_BUTTON, sess,
            )
        self.assertEqual(res.status, "ran")
        m.assert_called_once()
        scenes = self._scenes(sess)
        self.assertEqual(len(scenes), 2)  # appended after the existing scene
        new = scenes[-1]
        self.assertEqual(new["text"], "Crossing The River")
        self.assertEqual([b["text"] for b in new["beats"]],
                         ["They reach the river", "The bridge is out"])
        self.assertTrue(all(b["id"].startswith("bt-") for b in new["beats"]))
        self.assertIn("outline", res.invalidates)

    def test_explicit_title_skips_generation(self):
        sess = ProjectScope(self.project.id)
        with patch(_TITLE_FN) as m:
            res = dispatch(
                "add_scene_with_beats",
                {"chapter_id": "ch1", "beats": ["A beat"], "title": "My Title"},
                Actor.USER_BUTTON, sess,
            )
        self.assertEqual(res.status, "ran")
        m.assert_not_called()
        self.assertEqual(self._scenes(sess)[-1]["text"], "My Title")

    def test_blank_beats_dropped(self):
        sess = ProjectScope(self.project.id)
        with patch(_TITLE_FN, return_value={"title": "T"}):
            res = dispatch(
                "add_scene_with_beats",
                {"chapter_id": "ch1", "beats": ["  ", "real beat", {"text": ""}]},
                Actor.USER_BUTTON, sess,
            )
        self.assertEqual(res.status, "ran")
        self.assertEqual([b["text"] for b in self._scenes(sess)[-1]["beats"]],
                         ["real beat"])

    def test_empty_beats_errors(self):
        sess = ProjectScope(self.project.id)
        res = dispatch("add_scene_with_beats", {"chapter_id": "ch1", "beats": []},
                       Actor.USER_BUTTON, sess)
        self.assertEqual(res.status, "error")

    def test_unknown_chapter_errors(self):
        sess = ProjectScope(self.project.id)
        with patch(_TITLE_FN, return_value={"title": "T"}):
            res = dispatch("add_scene_with_beats",
                           {"chapter_id": "nope", "beats": ["x"]},
                           Actor.USER_BUTTON, sess)
        self.assertEqual(res.status, "error")
