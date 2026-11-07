"""update_outline_item — the author-toggled `written` flag on a beat persists
into the grand-outline JSON (used by the scene-margin checkbox and surfaced on
the grand outline's beat marker)."""
from types import SimpleNamespace

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.test import TestCase


def _outline_data():
    return {"base_template": "three_act", "acts": [
        {"id": "ac1", "text": "Act I", "chapters": [
            {"id": "ch1", "text": "Ch 1", "scenes": [
                {"id": "sc1", "text": "S", "thread": None, "words": 0, "beats": [
                    {"id": "bt1", "text": "A beat", "kind": "text"},
                ]},
            ]},
        ]},
    ]}


class UpdateOutlineWrittenTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project

        from outline.store import save_outline
        self.user = get_user_model().objects.create_user(email="t@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline_data())

    def _beat(self, sess):
        from outline.store import load_outline
        return load_outline(sess)["acts"][0]["chapters"][0]["scenes"][0]["beats"][0]

    def test_written_flag_persists_and_clears(self):
        sess = ProjectScope(self.project.id)
        res = dispatch("update_outline_item",
                       {"item_type": "beat", "item_id": "bt1", "written": True},
                       Actor.USER_BUTTON, sess)
        self.assertEqual(res.status, "ran")
        self.assertIs(self._beat(sess)["written"], True)

        res = dispatch("update_outline_item",
                       {"item_type": "beat", "item_id": "bt1", "written": False},
                       Actor.USER_BUTTON, sess)
        self.assertEqual(res.status, "ran")
        self.assertIs(self._beat(sess)["written"], False)

    def test_text_edit_leaves_written_untouched(self):
        sess = ProjectScope(self.project.id)
        dispatch("update_outline_item",
                 {"item_type": "beat", "item_id": "bt1", "written": True},
                 Actor.USER_BUTTON, sess)
        dispatch("update_outline_item",
                 {"item_type": "beat", "item_id": "bt1", "text": "Reworded"},
                 Actor.USER_BUTTON, sess)
        beat = self._beat(sess)
        self.assertEqual(beat["text"], "Reworded")
        self.assertIs(beat["written"], True)
