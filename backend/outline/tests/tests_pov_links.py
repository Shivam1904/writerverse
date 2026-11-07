"""Chapter / default POV link to the character by id, so a rename follows."""
from __future__ import annotations

from types import SimpleNamespace

from characters.models import Character
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

from outline.capabilities.commit import outline_crud as oc
from outline.capabilities.gather.outline_crud import (
    gather_set_chapter_pov,
    gather_set_project_pov_default,
)
from outline.store import load_outline, load_pov_default, save_outline


class PovLinkTest(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(email="pov@x.io", password="pw")
        self.project = Project.objects.create(user=user, title="P")
        self.ctx = SimpleNamespace(project_id=self.project.id)
        self.aelden = Character.objects.create(
            project=self.project, name="Prince Aelden",
            aliases=[{"name": "Aelden"}, {"name": "Varen", "character_id": 999}])
        save_outline(self.ctx, {"acts": [{"id": "a1", "text": "Act", "chapters": [
            {"id": "c1", "text": "Ch 1", "scenes": []}]}]})

    def _set_chapter_pov(self, character):
        result = gather_set_chapter_pov(
            self.ctx, {"chapter_id": "c1", "mode": "first", "character": character})
        oc.commit_set_chapter_pov(self.ctx, result)

    def _chapter_pov(self, chapter_id="c1"):
        chapters = load_outline(self.ctx)["acts"][0]["chapters"]
        return next(c for c in chapters if c["id"] == chapter_id)["pov"]

    def test_chapter_pov_follows_a_rename(self):
        self._set_chapter_pov("aelden")  # alias, any case
        self.assertEqual(self._chapter_pov()["character_id"], self.aelden.id)
        self.aelden.name = "King Aelden"
        self.aelden.save()
        self.assertEqual(self._chapter_pov()["character"], "King Aelden")

    def test_unknown_pov_name_stays_text(self):
        self._set_chapter_pov("Mira")
        pov = self._chapter_pov()
        self.assertEqual(pov["character"], "Mira")
        self.assertNotIn("character_id", pov)

    def test_default_pov_follows_rename_and_new_chapters_inherit_the_link(self):
        oc.commit_set_project_pov_default(self.ctx, gather_set_project_pov_default(
            self.ctx, {"mode": "third-limited", "character": "Prince Aelden"}))
        self.aelden.name = "King Aelden"
        self.aelden.save()
        self.assertEqual(load_pov_default(self.ctx)["character"], "King Aelden")

        res = {"item_type": "chapter", "parent_id": "a1", "text": "Ch 2"}
        oc.commit_add_outline_item(self.ctx, res)
        new_id = res["item"]["id"]
        self.assertEqual(self._chapter_pov(new_id)["character_id"], self.aelden.id)

    def test_alias_pointing_at_another_character_is_not_a_match(self):
        self._set_chapter_pov("Varen")  # listed on Aelden, but as a reference to someone else
        self.assertNotIn("character_id", self._chapter_pov())

