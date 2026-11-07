"""SA-306 — get_grand_outline(include_prose=False) skips each scene's prose.

Screens that never show prose (Outline, Threads, Walks, ...) ask for the lean
outline; Write/Preview keep the default and still get every scene's text.
Calls the capability's gather directly (no session needed).
"""
from types import SimpleNamespace

from actions.capabilities import Actor, registry
from django.test import TestCase

PROSE = {"type": "doc", "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "Rain on the roof."}]},
]}


class LeanGrandOutlineTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from types import SimpleNamespace

        from django.contrib.auth import get_user_model
        from projects.models import Project

        from outline.store import save_outline
        user = get_user_model().objects.create_user(
            email="lean-outline@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)
        save_outline(SimpleNamespace(project_id=cls.project.pk), {
            "acts": [{
                "id": "ac_1", "text": "Act One",
                "chapters": [{
                    "id": "ch_1", "text": "Chapter One",
                    "scenes": [{
                        "id": "sc_1", "text": "Opening", "words": 4,
                        "content": PROSE,
                        "analysis": {"scene_properties": {"status": "ok"}},
                        "beats": [{"id": "b_1", "text": "He arrives.", "kind": "text"}],
                    }],
                }],
            }],
        })

    def _read(self, args, actor=Actor.USER_BUTTON):
        cap = registry.get("get_grand_outline")
        ctx = SimpleNamespace(project_id=self.project.id, actor=actor)
        return cap.gather(ctx, args)

    def _scene(self, res):
        return res["grand_outline"]["acts"][0]["chapters"][0]["scenes"][0]

    def test_default_keeps_prose(self):
        # Write/Preview don't pass the flag: they must still get the prose.
        sc = self._scene(self._read({}))
        self.assertEqual(sc["content"], PROSE)

    def test_include_prose_true_keeps_prose(self):
        sc = self._scene(self._read({"include_prose": True}))
        self.assertEqual(sc["content"], PROSE)

    def test_include_prose_false_drops_prose_only(self):
        sc = self._scene(self._read({"include_prose": False}))
        self.assertNotIn("content", sc)
        # Everything the lean screens use is still there.
        self.assertEqual(sc["id"], "sc_1")
        self.assertEqual(sc["text"], "Opening")
        self.assertEqual(sc["words"], 4)
        self.assertEqual(sc["analysis"]["scene_properties"]["status"], "ok")
        self.assertEqual(sc["beats"][0]["text"], "He arrives.")

    def test_lean_read_does_not_touch_stored_prose(self):
        self._read({"include_prose": False})
        sc = self._scene(self._read({}))
        self.assertEqual(sc["content"], PROSE)

    def test_arg_is_registered(self):
        cap = registry.get("get_grand_outline")
        self.assertEqual(cap.args.get("include_prose"), "bool?")

    def test_chat_skeleton_ignores_flag(self):
        # Chat gets the ids+titles skeleton either way; the flag must not break it.
        for args in ({}, {"include_prose": False}, {"include_prose": None}):
            res = self._read(args, actor=Actor.CHAT)
            sc = res["acts"][0]["chapters"][0]["scenes"][0]
            self.assertEqual(set(sc.keys()), {"scene_id", "title"})
