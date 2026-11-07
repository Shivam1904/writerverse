"""add_plot_thread always saves a scope (SA-36).

A thread saved with no scope made the Threads page crash, and chat can call
add_plot_thread without one. A scope-less create must default to the whole story.
"""
from __future__ import annotations

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project


class PlotThreadScopeTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email="scope@x.io", password="pw")
        self.project = Project.objects.create(user=self.user, title="P")
        self.session = ProjectScope(self.project.id)

    def _add(self, args):
        res = dispatch("add_plot_thread", args, Actor.USER_BUTTON, self.session)
        self.assertEqual(res.status, "ran")
        return res.result["thread"]

    def test_scope_less_thread_defaults_to_story(self):
        thread = self._add({"name": "Revenge"})
        self.assertEqual(thread["scope"], {"type": "story", "name": ""})

    def test_given_scope_is_kept(self):
        thread = self._add({"name": "Jane I", "scope_type": "character", "scope_name": "Jane"})
        self.assertEqual(thread["scope"], {"type": "character", "name": "Jane"})
