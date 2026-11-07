"""resolve_nouns scene pipeline — mentions + pronoun resolution against the
project's known nouns (characters+aliases, world items, threads, braindump
entities), with preceding chapter scenes fed in as context.

Covers:
  - Full dispatch pipeline (LLM stubbed; gather + stored output shape)
  - Entity index building (known_entity_index_for)
  - Noun enrichment (_resolve_nouns_enrich — attaching entity ids to mentions)
"""
from types import SimpleNamespace
from unittest.mock import patch

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import DispatchContext
from braindumps.readers import known_entities_for, known_entity_index_for
from characters.models import Character
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from worldbuilding.models import Worldbuilding

from outline.capabilities.register.scene_pipelines import _resolve_nouns_enrich
from outline.store import load_outline, save_outline

User = get_user_model()


def _doc(text):
    return {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": text}]},
    ]}


_RESOLVE_RESP = {
    "mentions": [{"phrase": "Wayfarer drew the blade", "noun": "Corvin"}],
    "resolved": [{"phrase": "he raised it high", "pronoun": "he", "noun": "Corvin"}],
    "unresolved": [{"phrase": "they had vanished", "pronoun": "they"}],
}

_OUTLINE_DATA = {"base_template": "three_act", "acts": [
    {"id": "ac1", "text": "Act I", "chapters": [
        {"id": "ch1", "text": "Ch 1", "scenes": [
            {"id": "sc1", "text": "Prologue",
             "content": _doc("Wayfarer met them at the gate."), "words": 6},
            {"id": "sc2", "text": "The Blade",
             "content": _doc("He raised the sword. They had vanished."), "words": 7},
        ]},
    ]},
]}


class ResolveNounsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="t@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)

        from characters.models import Character
        from worldbuilding.models import Worldbuilding
        Character.objects.create(
            project=self.project, name="Corvin", aliases=[{"name": "Wayfarer"}],
        )
        Worldbuilding.objects.create(
            project=self.project, title="Embercall", content="the reforged sword",
        )

        save_outline(SimpleNamespace(project_id=self.project.pk), _OUTLINE_DATA)

    def _session(self):
        from actions.capabilities.spec import ProjectScope
        return ProjectScope(self.project.id)

    def test_known_entities_for_includes_aliases_only_when_asked(self):
        with_aliases = known_entities_for(self.project.id, include_aliases=True)
        self.assertIn("Corvin", with_aliases)
        self.assertIn("Wayfarer", with_aliases)
        self.assertIn("Embercall", with_aliases)

        default = known_entities_for(self.project.id)
        self.assertIn("Corvin", default)
        self.assertNotIn("Wayfarer", default)

    def test_resolve_nouns_stores_buckets(self):
        with patch("ai_engine.llm_utils.ask_json", return_value=_RESOLVE_RESP):
            res = dispatch("analyze_scene__resolve_nouns", {"scene_id": "sc2"},
                           Actor.USER_BUTTON, self._session())
        self.assertEqual(res.status, "ran")

        scene = load_outline(SimpleNamespace(project_id=self.project.pk))["acts"][0]["chapters"][0]["scenes"][1]
        data = scene["analysis"]["resolve_nouns"]
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["mentions"][0]["noun"], "Corvin")
        self.assertEqual(data["resolved"][0]["pronoun"], "he")
        self.assertEqual(data["unresolved"][0]["pronoun"], "they")

    def test_prompt_gets_aliases_and_prior_scene_context(self):
        with patch("ai_engine.llm_utils.ask_json", return_value=_RESOLVE_RESP) as m:
            dispatch("analyze_scene__resolve_nouns", {"scene_id": "sc2"},
                     Actor.USER_BUTTON, self._session())
        prompt = m.call_args[0][0]
        self.assertIn("Wayfarer", prompt)
        self.assertIn("Embercall", prompt)
        self.assertIn("Wayfarer met them at the gate", prompt)
        self.assertIn("They had vanished", prompt)


class KnownEntityIndexForTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="w@x.io", password="pw")
        self.project = Project.objects.create(title="P", user=self.user)

    def test_characters_aliases_and_world_map_to_type_and_id(self):
        corvin = Character.objects.create(
            project=self.project, name="Corvin", aliases=[{"name": "Wayfarer"}]
        )
        ring = Worldbuilding.objects.create(project=self.project, title="The One Ring")

        index = known_entity_index_for(self.project.id, include_aliases=True)

        self.assertEqual(index["corvin"], {"type": "character", "id": corvin.id, "name": "Corvin"})
        self.assertEqual(index["wayfarer"]["id"], corvin.id)
        self.assertEqual(index["wayfarer"]["type"], "character")
        self.assertEqual(index["the one ring"], {"type": "worldbuilding", "id": ring.id, "name": "The One Ring"})

    def test_threads_carry_blob_id(self):
        index = known_entity_index_for(
            self.project.id, threads=[{"title": "The Quest", "id": "t1"}]
        )
        self.assertEqual(index["the quest"], {"type": "thread", "id": "t1", "name": "The Quest"})

    def test_own_name_wins_collision_with_anothers_alias(self):
        Character.objects.create(project=self.project, name="Corvin", aliases=[{"name": "Wayfarer"}])
        wayfarer = Character.objects.create(project=self.project, name="Wayfarer")
        index = known_entity_index_for(self.project.id, include_aliases=True)
        self.assertEqual(index["wayfarer"]["id"], wayfarer.id)


class ResolveNounsEnrichTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="w2@x.io", password="pw")
        self.project = Project.objects.create(title="P", user=self.user)
        self.corvin = Character.objects.create(
            project=self.project, name="Corvin", aliases=[{"name": "Wayfarer"}]
        )

    def _ctx(self):
        return DispatchContext(project_id=self.project.id)

    def test_attaches_entity_type_and_id_to_mentions_and_resolved(self):
        data = {
            "status": "ok",
            "mentions": [{"phrase": "Wayfarer drew his sword", "noun": "Corvin"}],
            "resolved": [{"phrase": "he stood", "pronoun": "he", "noun": "Corvin"}],
            "unresolved": [{"phrase": "they fled", "pronoun": "they"}],
        }
        out = _resolve_nouns_enrich(self._ctx(), data)

        self.assertEqual(out["mentions"][0]["entity_type"], "character")
        self.assertEqual(out["mentions"][0]["entity_id"], self.corvin.id)
        self.assertEqual(out["resolved"][0]["entity_id"], self.corvin.id)
        self.assertNotIn("by_entity", out)
        self.assertNotIn("entity_id", out["unresolved"][0])

    def test_unmatched_noun_gets_null_type_and_id(self):
        data = {"mentions": [{"phrase": "the stranger", "noun": "Nobody"}]}
        out = _resolve_nouns_enrich(self._ctx(), data)
        self.assertIsNone(out["mentions"][0]["entity_type"])
        self.assertIsNone(out["mentions"][0]["entity_id"])

    def test_non_dict_payload_is_returned_unchanged(self):
        self.assertEqual(_resolve_nouns_enrich(self._ctx(), None), None)
