"""Accepted story elements (story / items / rules) live in real tables now:
title/synopsis, StoryItem, StoryRule, plus the live cast from Character."""
from __future__ import annotations

from types import SimpleNamespace

from braindumps.capabilities.commit import commit_init_elements
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from projects.models import Project
from worldbuilding.models import StoryItem, StoryRule
from worldbuilding.readers import get_items, get_rules
from worldbuilding.store import load_elements

from actions.capabilities import Actor
from actions.models import Proposal


class StoryElementsTest(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(email="se@x.io", password="pw")
        self.project = Project.objects.create(user=user, title="P")
        self.ctx = SimpleNamespace(project_id=self.project.id, thread_id=None,
                                   actor=Actor.USER_BUTTON, page="world")

    def _accept(self, preview):
        result = {"preview": preview}
        commit_init_elements(self.ctx, result)
        return result

    def test_empty_project_has_no_elements(self):
        self.assertEqual(load_elements(self.ctx), {})

    def _story(self, title="Crown", summary="A prince finds a hidden library."):
        return self._accept({"type": "story", "story": {"title": title, "summary": summary}})

    def test_story_fills_empty_synopsis_and_proposes_title(self):
        res = self._story()
        self.project.refresh_from_db()
        self.assertEqual(self.project.synopsis, "A prince finds a hidden library.")  # was empty
        self.assertEqual(self.project.title, "P")  # the author's title is never overwritten…
        row = Proposal.objects.get(capability="update_project_meta")  # …it's proposed instead
        self.assertEqual(row.proposal["preview"]["type"], "meta_edit")
        self.assertEqual(row.proposal["preview"]["fields"], {"title": "Crown"})
        self.assertEqual(load_elements(self.ctx)["story"],
                         {"title": "P", "summary": "A prince finds a hidden library."})
        self.assertEqual(res["_followups"][0]["capability"], "generate_thread_from_description")

    def test_story_proposes_instead_of_overwriting_synopsis(self):
        Project.objects.filter(pk=self.project.pk).update(title="Crown", synopsis="My own words.")
        self._story()
        self.project.refresh_from_db()
        self.assertEqual(self.project.synopsis, "My own words.")
        row = Proposal.objects.get(capability="update_project_meta")
        self.assertEqual(row.proposal["preview"]["fields"],
                         {"synopsis": "A prince finds a hidden library."})

    def test_story_matching_author_text_does_nothing(self):
        Project.objects.filter(pk=self.project.pk).update(
            title="Crown", synopsis="A prince finds a hidden library.")
        self._story()
        self.assertFalse(Proposal.objects.exists())

    def test_items_and_rules_are_rows_deduped_case_insensitively(self):
        self._accept({"type": "item", "item": {"name": "Memory Stone", "description": "erases"}})
        self._accept({"type": "item", "item": {"name": " memory stone ", "description": "dup"}})
        self._accept({"type": "item", "item": {"name": "Archive Key"}})
        self._accept({"type": "rule", "rule": {"text": "Magic costs memories", "scope": "world"}})
        self._accept({"type": "rule", "rule": {"text": "MAGIC COSTS MEMORIES"}})
        self._accept({"type": "item", "item": {"name": "  "}})  # empty name → skipped

        self.assertEqual(
            get_items(self.ctx)["items"],
            [{"name": "Memory Stone", "description": "erases"},
             {"name": "Archive Key", "description": ""}],
        )
        self.assertEqual(
            get_rules(self.ctx)["rules"], [{"text": "Magic costs memories", "scope": "world"}],
        )

    def test_db_rejects_duplicate_item_name_any_case(self):
        StoryItem.objects.create(project=self.project, name="Memory Stone")
        with self.assertRaises(IntegrityError), transaction.atomic():
            StoryItem.objects.create(project=self.project, name="MEMORY STONE")

    def test_db_rejects_duplicate_rule_text_any_case(self):
        StoryRule.objects.create(project=self.project, text="Magic costs memories")
        with self.assertRaises(IntegrityError), transaction.atomic():
            StoryRule.objects.create(project=self.project, text="magic costs memories")

    def test_elements_include_the_live_cast_for_suggestion_prompts(self):
        from characters.models import Character
        from django.utils import timezone
        from gauges.engine._serve import _elements_summaries
        Character.objects.create(project=self.project, name="Aelden", type="protagonist",
                                 description="x" * 1000)
        Character.objects.create(project=self.project, name="Gone", deleted_at=timezone.now())
        cast = load_elements(self.ctx)["characters"]
        self.assertEqual([c["name"] for c in cast], ["Aelden"])  # soft-deleted left out
        self.assertEqual(cast[0]["role"], "protagonist")
        self.assertEqual(len(cast[0]["description"]), 300)       # bounded
        _story, chars, _items, _rules = _elements_summaries(load_elements(self.ctx))
        self.assertEqual([c["name"] for c in chars], ["Aelden"])  # the prompt now sees the cast


    def test_cast_role_comes_from_the_flags_and_important_roles_sort_first(self):
        from characters.models import Character

        def mk(n, **kw):
            Character.objects.create(project=self.project, name=n, **kw)
        mk("Aaa", type="sidekick")
        mk("Bbb", is_main_character=True, type="ignored")
        mk("Ccc", is_antagonist=True)
        mk("Ddd", is_protagonist=True, is_antagonist=True)
        mk("Eee")
        cast = load_elements(self.ctx)["characters"]
        self.assertEqual([(c["name"], c["role"]) for c in cast], [
            ("Ddd", "protagonist"), ("Ccc", "antagonist"), ("Bbb", "main"),
            ("Aaa", "sidekick"), ("Eee", ""),
        ])
