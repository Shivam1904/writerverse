"""SA-304: deleting a character is a soft delete, so the 10-second
"Deleted — Undo" toast can bring it back. Deleted rows never show in lists.

Exercised through ``dispatch()`` — the same gather→commit path the page's
``DELETE characters/<id>/`` and ``callOp('undelete_character')`` run.
"""
from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from rest_framework.test import APIClient

from characters.models import Character


class CharacterSoftDeleteTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="ch@x.io", password="pw")
        self.project = Project.objects.create(user=self.user, title="P")
        self.session = ProjectScope(self.project.id)
        self.kept = Character.objects.create(project=self.project, name="Kept")
        self.gone = Character.objects.create(project=self.project, name="Mira", want="home")

    def _run(self, capability, args=None):
        return dispatch(capability, args or {}, Actor.USER_BUTTON, self.session)

    def _listed_ids(self):
        res = self._run("get_characters")
        self.assertEqual(res.status, "ran")
        return {c["id"] for c in res.result["characters"]}

    def test_delete_hides_the_row_but_keeps_it(self):
        res = self._run("delete_character", {"id": self.gone.id})
        self.assertEqual(res.status, "ran")
        self.assertEqual(self._listed_ids(), {self.kept.id})
        self.assertFalse(Character.objects.filter(id=self.gone.id).exists())
        self.assertIsNotNone(Character.all_objects.get(id=self.gone.id).deleted_at)

    def test_undo_brings_it_back(self):
        self._run("delete_character", {"id": self.gone.id})
        res = self._run("undelete_character", {"id": self.gone.id})
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.result["character"]["name"], "Mira")
        self.assertEqual(self._listed_ids(), {self.kept.id, self.gone.id})
        self.assertEqual(Character.objects.get(id=self.gone.id).want, "home")

    def test_undo_of_a_live_row_fails(self):
        res = self._run("undelete_character", {"id": self.kept.id})
        self.assertNotEqual(res.status, "ran")

    def test_name_is_free_again_after_delete(self):
        self._run("delete_character", {"id": self.gone.id})
        Character.objects.create(project=self.project, name="Mira")
        # Undo now clashes with the new "Mira": it fails cleanly, nothing changes.
        res = self._run("undelete_character", {"id": self.gone.id})
        self.assertNotEqual(res.status, "ran")
        self.assertIsNotNone(Character.all_objects.get(id=self.gone.id).deleted_at)

    def test_rest_delete_is_soft_too(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.delete(f"/api/projects/{self.project.id}/characters/{self.gone.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertIsNotNone(Character.all_objects.get(id=self.gone.id).deleted_at)
