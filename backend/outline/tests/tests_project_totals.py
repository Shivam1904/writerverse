"""SA-310: every outline save rolls word/act/chapter/scene totals up onto the
Project row (the library cover reads them). Totals come from the in-memory
outline only: each scene's stored `words`, never a recount of prose.
"""
from types import SimpleNamespace

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

from outline.store import save_outline

User = get_user_model()


def _outline():
    return {
        "base_template": "three_act",
        "acts": [
            {"id": "a1", "text": "Act 1", "chapters": [
                {"id": "c1", "text": "Ch 1", "scenes": [
                    {"id": "s1", "text": "S1", "beats": [], "words": 120},
                    {"id": "s2", "text": "S2", "beats": [], "words": 30},
                ]},
                {"id": "c2", "text": "Ch 2", "scenes": [
                    # No `words` key (never written): counts as 0.
                    {"id": "s3", "text": "S3", "beats": []},
                ]},
            ]},
            {"id": "a2", "text": "Act 2", "chapters": []},
        ],
    }


class ProjectTotalsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="totals@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)

    def _totals(self):
        p = Project.objects.get(pk=self.project.pk)
        return (p.total_word_count, p.total_acts, p.total_chapters, p.total_scenes)

    def test_save_outline_writes_totals(self):
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline())
        self.assertEqual(self._totals(), (150, 2, 2, 3))

    def test_scene_without_words_counts_zero(self):
        go = {"acts": [{"id": "a", "chapters": [{"id": "c", "scenes": [
            {"id": "s", "text": "x"}, {"id": "t", "text": "y", "words": None},
        ]}]}]}
        save_outline(SimpleNamespace(project_id=self.project.pk), go)
        self.assertEqual(self._totals(), (0, 1, 1, 2))


class ProjectTotalsViaCapabilitiesTests(TestCase):
    """The real write capabilities go through save_outline, so totals follow."""

    def setUp(self):
        self.user = User.objects.create_user(email="totals2@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline())
        self.session = ProjectScope(self.project.id)

    def _run(self, cap, args):
        return dispatch(cap, args, Actor.USER_BUTTON, self.session)

    def _totals(self):
        p = Project.objects.get(pk=self.project.pk)
        return (p.total_word_count, p.total_acts, p.total_chapters, p.total_scenes)

    def test_delete_scene_lowers_totals(self):
        self._run("delete_outline_item", {"item_type": "scene", "item_id": "s1"})
        self.assertEqual(self._totals(), (30, 2, 2, 2))

    def test_delete_chapter_lowers_totals(self):
        self._run("delete_outline_item", {"item_type": "chapter", "item_id": "c1"})
        self.assertEqual(self._totals(), (0, 2, 1, 1))

    def test_save_scene_content_updates_word_total(self):
        doc = {"type": "doc", "content": [{"type": "paragraph", "content": [
            {"type": "text", "text": "one two three four five"}]}]}
        self._run("save_scene_content",
                  {"scene_id": "s3", "content": doc, "auto_analyze": False})
        self.assertEqual(self._totals(), (155, 2, 2, 3))
