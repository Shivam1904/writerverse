"""Per-entity colour overrides — world entity + plot thread.

Characters auto-assign + override is covered in characters/tests. Here we lock
the two capability paths that carry an optional ``color`` and the empty-string
"clear the override" branch, exercised through ``dispatch()`` like the other
consistency tests.
"""
from __future__ import annotations

from characters.models import Character
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from worldbuilding.models import Worldbuilding

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope


class EntityColorDispatchTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="col@x.io", password="pw")
        self.project = Project.objects.create(user=self.user, title="P")
        self.session = ProjectScope(self.project.id)

    def _run(self, capability, args):
        return dispatch(capability, args, Actor.USER_BUTTON, self.session)

    def test_update_character_accepts_color(self):
        # The facade PATCH characters/<id>/ routes to update_character; regression
        # for the "nothing to update" bug when only `color` was sent.
        ch = Character.objects.create(project=self.project, name="Mara")
        res = self._run("update_character", {"id": ch.id, "color": "#3d8c8a"})
        self.assertEqual(res.status, "ran")
        ch.refresh_from_db()
        self.assertEqual(ch.color, "#3d8c8a")

    def test_world_entity_color_set_and_clear(self):
        wb = Worldbuilding.objects.create(project=self.project, title="Old Keep", tags=["locations"])
        self.assertEqual(wb.color, "")  # override-only: empty by default

        self._run("update_worldbuilding", {"id": wb.id, "color": "var(--asp-items)"})
        wb.refresh_from_db()
        self.assertEqual(wb.color, "var(--asp-items)")

        # Empty string clears the override → falls back to the derived default.
        self._run("update_worldbuilding", {"id": wb.id, "color": ""})
        wb.refresh_from_db()
        self.assertEqual(wb.color, "")

    def test_plot_thread_color_set_and_clear(self):
        added = self._run("add_plot_thread", {"name": "Revenge"}).result
        tid = added["thread"]["id"]
        # New threads are auto-assigned a distinct colour (never the shared
        # story default), so the first one wears the first palette entry.
        self.assertEqual(added["thread"]["color"], "#3d8c8a")

        set_res = self._run("update_plot_thread", {"thread_id": tid, "color": "#abcdef"}).result
        self.assertEqual(set_res["thread"]["color"], "#abcdef")

        cleared = self._run("update_plot_thread", {"thread_id": tid, "color": ""}).result
        self.assertNotIn("color", cleared["thread"])  # override removed → derives

    def test_new_threads_get_distinct_colors(self):
        a = self._run("add_plot_thread", {"name": "A"}).result["thread"]
        b = self._run("add_plot_thread", {"name": "B"}).result["thread"]
        self.assertTrue(a["color"] and b["color"])
        self.assertNotEqual(a["color"], b["color"])  # never reuse a used colour

    def test_character_thread_first_mirrors_then_distinct(self):
        Character.objects.create(project=self.project, name="Jane", color="#4a72b0")
        # First thread for Jane stores no colour → mirrors her identity colour.
        t1 = self._run(
            "add_plot_thread",
            {"name": "Jane I", "scope_type": "character", "scope_name": "Jane"},
        ).result["thread"]
        self.assertNotIn("color", t1)
        # The next thread for the same character is forced to a distinct colour,
        # never her blue.
        t2 = self._run(
            "add_plot_thread",
            {"name": "Jane II", "scope_type": "character", "scope_name": "Jane"},
        ).result["thread"]
        self.assertTrue(t2["color"])
        self.assertNotEqual(t2["color"].lower(), "#4a72b0")
