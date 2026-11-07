"""POV persistence — mode canonicaliser + chapter/project POV capabilities."""
from types import SimpleNamespace

from django.test import TestCase


class PovModeCanonicaliseTests(TestCase):
    def test_canonicalises_common_labels(self):
        from projects.meta_fields import canonicalize_pov_mode
        self.assertEqual(canonicalize_pov_mode("first person"), "first")
        self.assertEqual(canonicalize_pov_mode("third-limited"), "third-limited")
        self.assertEqual(canonicalize_pov_mode("Omniscient"), "third-omniscient")
        self.assertEqual(canonicalize_pov_mode("alternating"), "multiple")

    def test_blank_and_unknown_become_empty(self):
        from projects.meta_fields import canonicalize_pov_mode
        self.assertEqual(canonicalize_pov_mode(""), "")
        self.assertEqual(canonicalize_pov_mode(None), "")
        self.assertEqual(canonicalize_pov_mode("gibberish"), "")


from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope


def _outline_data():
    return {"base_template": "three_act", "acts": [
        {"id": "ac1", "text": "Act I", "chapters": [
            {"id": "ch1", "text": "Ch 1", "scenes": []},
        ]},
    ]}


class PovCapabilityTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project

        from outline.store import save_outline
        self.user = get_user_model().objects.create_user(email="t@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        save_outline(SimpleNamespace(project_id=self.project.pk), _outline_data())

    def _ch(self, sess):
        from outline.store import load_outline
        go = load_outline(sess)
        return go["acts"][0]["chapters"][0]

    def test_set_chapter_pov_writes_structured_pov(self):
        sess = ProjectScope(self.project.id)
        res = dispatch("set_chapter_pov",
                       {"chapter_id": "ch1", "mode": "first person", "character": "Elara"},
                       Actor.USER_BUTTON, sess)
        self.assertEqual(res.status, "ran")
        self.assertEqual(self._ch(sess)["pov"], {"mode": "first", "character": "Elara"})
        self.assertIn("outline", res.invalidates)

    def test_set_chapter_pov_unknown_chapter_errors(self):
        sess = ProjectScope(self.project.id)
        res = dispatch("set_chapter_pov", {"chapter_id": "nope", "mode": "first"},
                       Actor.USER_BUTTON, sess)
        self.assertEqual(res.status, "error")

    def test_set_project_pov_default_and_read_back(self):
        from outline.store import load_pov_default
        sess = ProjectScope(self.project.id)
        dispatch("set_project_pov_default", {"mode": "Omniscient", "character": ""},
                 Actor.USER_BUTTON, sess)
        self.assertEqual(load_pov_default(sess),
                         {"mode": "third-omniscient", "character": ""})

    def test_new_chapter_inherits_project_default(self):
        from outline.store import load_outline, save_pov_default
        sess = ProjectScope(self.project.id)
        save_pov_default(sess, {"mode": "third-limited", "character": "Mara"})
        dispatch("add_outline_item",
                 {"item_type": "chapter", "parent_id": "ac1", "text": "Ch 2"},
                 Actor.USER_BUTTON, sess)
        go = load_outline(sess)
        chapters = go["acts"][0]["chapters"]
        self.assertEqual(chapters[-1]["pov"], {"mode": "third-limited", "character": "Mara"})


class PovPurityPipelineContextTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        self.user = get_user_model().objects.create_user(email="t2@e.com", password="x")
        self.project = Project.objects.create(title="P2", user=self.user)

    def test_pipeline_registered(self):
        from actions.capabilities import registry
        self.assertIsNotNone(registry.get("analyze_scene__pov_purity"))
        self.assertIsNotNone(registry.get("analyze_scene__hook_grade"))
        self.assertIsNotNone(registry.get("analyze_scene__subtext"))
        self.assertIsNotNone(registry.get("analyze_scene__voice"))

    def test_pov_context_resolves_chapter_then_default(self):
        from outline.capabilities.register.scene_pipelines import (
            _pov_purity_context,
        )
        from outline.store import save_outline, save_pov_default

        class _Ctx:
            project_id = None

        outline_data = {"acts": [
            {"id": "ac1", "chapters": [
                {"id": "ch1", "pov": {"mode": "first", "character": "Elara"},
                 "scenes": [{"id": "sc1"}]},
                {"id": "ch2", "scenes": [{"id": "sc2"}]},
            ]},
        ]}
        save_outline(SimpleNamespace(project_id=self.project.pk), outline_data)
        save_pov_default(SimpleNamespace(project_id=self.project.pk),
                         {"mode": "third-limited", "character": "Mara"})
        ctx = _Ctx()
        ctx.project_id = self.project.id
        got = _pov_purity_context(ctx, {"id": "sc1"})
        self.assertEqual(got, {"pov_mode": "first", "pov_character": "Elara"})
        got2 = _pov_purity_context(ctx, {"id": "sc2"})
        self.assertEqual(got2, {"pov_mode": "third-limited", "pov_character": "Mara"})
