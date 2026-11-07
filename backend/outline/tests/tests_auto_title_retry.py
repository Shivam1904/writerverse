"""wrt-88: a scene whose auto-title failed is not retried on every autosave.

The titler is mocked (nothing paid runs). A failure leaves an "already tried"
mark in the cache; the next saves skip the model until the mark expires.
"""
from types import SimpleNamespace
from unittest.mock import patch

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.core.cache import caches
from django.test import TestCase

from outline.store import load_outline, save_outline
from outline.tests.tests_add_scene_with_beats import _TITLE_FN
from outline.tests.tests_place_thread_beat_title import _outline


def _doc(text):
    return {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": text}]},
    ]}


class AutoTitleRetryTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project

        caches["throttle"].clear()
        user = get_user_model().objects.create_user(email="r@e.com", password="x")
        self.project = Project.objects.create(title="P", user=user)
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline())
        self.sess = ProjectScope(self.project.id)

    def _save(self, text):
        res = dispatch("save_scene_content", {"scene_id": "sc1", "content": _doc(text)},
                       Actor.USER_BUTTON, self.sess)
        self.assertEqual(res.status, "ran", res)

    def _title(self):
        return load_outline(self.sess)["acts"][0]["chapters"][0]["scenes"][0]["text"]

    def test_failed_title_is_not_retried_on_the_next_saves(self):
        with patch(_TITLE_FN, side_effect=RuntimeError("model down")) as m, \
                self.assertLogs("writerverse.consistency", "ERROR"):
            self._save("They reach the river.")
            self._save("They reach the river. The bridge is out.")
            self._save("They reach the river. The bridge is out. They swim.")
        self.assertEqual(m.call_count, 1)
        self.assertFalse(self._title())

    def test_empty_title_counts_as_a_failure(self):
        with patch(_TITLE_FN, return_value={"title": ""}) as m:
            self._save("One.")
            self._save("One. Two.")
        self.assertEqual(m.call_count, 1)

    def test_tries_again_once_the_mark_expires(self):
        with patch(_TITLE_FN, side_effect=RuntimeError("model down")), \
                self.assertLogs("writerverse.consistency", "ERROR"):
            self._save("They reach the river.")
        caches["throttle"].clear()  # the mark's hour is up
        with patch(_TITLE_FN, return_value={"title": "Reaching the river"}) as m:
            self._save("They reach the river. Again.")
        m.assert_called_once()
        self.assertEqual(self._title(), "Reaching the river")

    def test_a_success_leaves_no_mark(self):
        with patch(_TITLE_FN, return_value={"title": "Reaching the river"}) as m:
            self._save("They reach the river.")
        m.assert_called_once()
        self.assertEqual(self._title(), "Reaching the river")
