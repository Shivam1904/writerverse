"""SA-303: deleting a world entry is a soft delete, so the 10-second
"Deleted — Undo" toast can bring it back. Deleted rows never show in lists.

Exercised through ``dispatch()`` — the same gather→commit path the World page's
``callOp('delete_worldbuilding' | 'undelete_worldbuilding')`` runs.
"""

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from rest_framework.test import APIClient

from worldbuilding.models import Worldbuilding


class WorldbuildingSoftDeleteTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="wb@x.io", password="pw")
        self.project = Project.objects.create(user=self.user, title="P")
        self.session = ProjectScope(self.project.id)
        self.kept = Worldbuilding.objects.create(project=self.project, title="kept")
        self.gone = Worldbuilding.objects.create(
            project=self.project, title="gone", content="Magic costs a year of life.",
        )

    def _run(self, capability, args=None):
        return dispatch(capability, args or {}, Actor.USER_BUTTON, self.session)

    def _listed_ids(self):
        res = self._run("get_worldbuildings")
        self.assertEqual(res.status, "ran")
        return {w["id"] for w in res.result["worldbuildings"]}

    def test_delete_hides_the_row_but_keeps_it(self):
        res = self._run("delete_worldbuilding", {"id": self.gone.id})
        self.assertEqual(res.status, "ran")
        self.assertEqual(self._listed_ids(), {self.kept.id})
        self.assertFalse(Worldbuilding.objects.filter(id=self.gone.id).exists())
        self.assertIsNotNone(Worldbuilding.all_objects.get(id=self.gone.id).deleted_at)

    def test_undo_brings_it_back(self):
        self._run("delete_worldbuilding", {"id": self.gone.id})
        res = self._run("undelete_worldbuilding", {"id": self.gone.id})
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.result["worldbuilding"]["content"], "Magic costs a year of life.")
        self.assertEqual(self._listed_ids(), {self.kept.id, self.gone.id})

    def test_undo_tells_the_page_to_refetch_the_world(self):
        # The World page has no reload of its own (SA-82): it refetches when a
        # write's response names the `worldbuilding` domain. Undo must too, or
        # the restored entry only shows after a page reload.
        self._run("delete_worldbuilding", {"id": self.gone.id})
        res = self._run("undelete_worldbuilding", {"id": self.gone.id})
        self.assertIn("worldbuilding", res.invalidates)

    def test_undo_of_a_live_row_fails(self):
        res = self._run("undelete_worldbuilding", {"id": self.kept.id})
        self.assertNotEqual(res.status, "ran")

    def test_rest_delete_is_soft_too(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.delete(f"/api/projects/{self.project.id}/worldbuildings/{self.gone.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertIsNotNone(Worldbuilding.all_objects.get(id=self.gone.id).deleted_at)
