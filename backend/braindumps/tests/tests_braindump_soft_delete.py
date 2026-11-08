"""SA-302: deleting a braindump is a soft delete, so the 10-second
"Deleted — Undo" toast can bring it back. Deleted rows never show in lists.

Exercised through ``dispatch()`` — the same gather→commit path the page's
``callOp('delete_braindump' | 'undelete_braindump')`` runs.
"""
from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from rest_framework.test import APIClient

from braindumps.models import Braindump


class BraindumpSoftDeleteTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="bd@x.io", password="pw")
        self.project = Project.objects.create(user=self.user, title="P")
        self.session = ProjectScope(self.project.id)
        self.kept = Braindump.objects.create(project=self.project, title="kept", content="kept")
        self.gone = Braindump.objects.create(project=self.project, title="gone", content="gone")

    def _run(self, capability, args=None):
        return dispatch(capability, args or {}, Actor.USER_BUTTON, self.session)

    def _listed_ids(self):
        res = self._run("get_braindumps")
        self.assertEqual(res.status, "ran")
        return {b["id"] for b in res.result["braindumps"]}

    def test_delete_hides_the_row_but_keeps_it(self):
        res = self._run("delete_braindump", {"id": self.gone.id})
        self.assertEqual(res.status, "ran")
        self.assertEqual(self._listed_ids(), {self.kept.id})
        self.assertFalse(Braindump.objects.filter(id=self.gone.id).exists())
        self.assertIsNotNone(Braindump.all_objects.get(id=self.gone.id).deleted_at)

    def test_undo_brings_it_back(self):
        self._run("delete_braindump", {"id": self.gone.id})
        res = self._run("undelete_braindump", {"id": self.gone.id})
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.result["braindump"]["content"], "gone")
        self.assertEqual(self._listed_ids(), {self.kept.id, self.gone.id})

    def test_undo_tells_other_views_to_refetch_ideas(self):
        # Other open tabs (and the chat's "this changed since you read it")
        # learn about a write from the `braindumps` domain it names
        # (staleness.yml). Undo must name it too, or another tab only shows
        # the restored idea after a reload.
        self._run("delete_braindump", {"id": self.gone.id})
        res = self._run("undelete_braindump", {"id": self.gone.id})
        self.assertIn("braindumps", res.invalidates)

    def test_undo_of_a_live_row_fails(self):
        res = self._run("undelete_braindump", {"id": self.kept.id})
        self.assertNotEqual(res.status, "ran")

    def test_rest_delete_is_soft_too(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.delete(f"/api/projects/{self.project.id}/braindumps/{self.gone.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertIsNotNone(Braindump.all_objects.get(id=self.gone.id).deleted_at)
