"""place_thread_beat — placing a beat into an UNTITLED scene auto-titles it.

The title comes from a billable LLM call (generate_title); these tests mock it so
nothing paid runs.
"""
from types import SimpleNamespace
from unittest.mock import patch

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.test import TestCase

from outline.store import save_outline

_TITLE_FN = "projects.capabilities.execute_titles.generate_title"


def _outline(scene_text=""):
    return {"base_template": "three_act", "acts": [
        {"id": "ac1", "text": "Act I", "chapters": [
            {"id": "ch1", "text": "Ch 1", "scenes": [
                {"id": "sc1", "text": scene_text, "beats": [], "thread": None, "words": 0},
            ]},
        ]},
    ]}


def _threads():
    return [
        {"id": "ro1", "title": "Romance", "items": [
            {"id": "ri1", "kind": "text", "text": "They meet on the train"},
            {"id": "ri2", "kind": "text", "text": "A second beat"},
        ]},
    ]


class PlaceThreadBeatTitleTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project

        from outline.store import save_threads
        self.user = get_user_model().objects.create_user(email="t@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline())
        self.sess = ProjectScope(self.project.id)
        save_threads(self.sess, _threads())

    def _scene(self):
        from outline.store import load_outline
        return load_outline(self.sess)["acts"][0]["chapters"][0]["scenes"][0]

    def test_placing_into_untitled_scene_generates_title(self):
        with patch(_TITLE_FN, return_value={"title": "Meeting On The Train"}) as m:
            res = dispatch(
                "place_thread_beat",
                {"thread_id": "ro1", "item_id": "ri1", "scene_id": "sc1"},
                Actor.USER_BUTTON, self.sess,
            )
        self.assertEqual(res.status, "ran")
        m.assert_called_once()
        scene = self._scene()
        self.assertEqual(scene["text"], "Meeting On The Train")
        self.assertEqual([b["text"] for b in scene["beats"]], ["They meet on the train"])

    def test_titled_scene_is_left_alone(self):
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline("Kept Title"))
        with patch(_TITLE_FN) as m:
            res = dispatch(
                "place_thread_beat",
                {"thread_id": "ro1", "item_id": "ri1", "scene_id": "sc1"},
                Actor.USER_BUTTON, self.sess,
            )
        self.assertEqual(res.status, "ran")
        m.assert_not_called()
        self.assertEqual(self._scene()["text"], "Kept Title")

    def test_second_beat_does_not_retitle(self):
        # first placement titles the scene; the second sees a titled scene → skip
        with patch(_TITLE_FN, return_value={"title": "First Title"}) as m:
            dispatch("place_thread_beat",
                     {"thread_id": "ro1", "item_id": "ri1", "scene_id": "sc1"},
                     Actor.USER_BUTTON, self.sess)
            dispatch("place_thread_beat",
                     {"thread_id": "ro1", "item_id": "ri2", "scene_id": "sc1"},
                     Actor.USER_BUTTON, self.sess)
        m.assert_called_once()  # only the first generated
        scene = self._scene()
        self.assertEqual(scene["text"], "First Title")
        self.assertEqual(len(scene["beats"]), 2)
