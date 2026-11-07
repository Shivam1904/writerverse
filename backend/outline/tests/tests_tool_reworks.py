import types
from types import SimpleNamespace

from django.test import TestCase

from outline import readers as od
from outline.capabilities.commit import outline_crud as coc
from outline.capabilities.gather import outline_crud as goc
from outline.store import save_outline, save_threads


def _ctx(discovery, project_id=None):
    return types.SimpleNamespace(discovery=discovery, project_id=project_id)


class GetPlotThreadsSlimTests(TestCase):
    def test_returns_id_name_scope_and_beat_count_only(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(email="slim@t.com", password="x")
        proj = Project.objects.create(title="P", user=user)
        save_threads(SimpleNamespace(project_id=proj.id), [
            {"id": "ro-1", "title": "Mira's doubt",
             "scope": {"type": "character", "name": "Mira"},
             "items": [{"id": "ri-1", "text": "a", "kind": "text"},
                       {"id": "ri-2", "text": "b", "kind": "text"}]},
        ])
        ctx = _ctx({}, project_id=proj.id)
        out = od.get_plot_threads(ctx)["plot_threads"]
        self.assertEqual(out, [{
            "id": "ro-1", "name": "Mira's doubt",
            "scope": {"type": "character", "name": "Mira"},
            "color": "",
            "beat_count": 2,
        }])
        self.assertNotIn("items", out[0])


class GetThreadTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(email="gthread@t.com", password="x")
        self.proj = Project.objects.create(title="P", user=user)
        save_threads(SimpleNamespace(project_id=self.proj.id), [
            {"id": "ro-1", "title": "T",
             "items": [{"id": "ri-1", "text": "first", "kind": "text"},
                       {"id": "ri-2", "text": "second", "kind": "placeholder"}]},
        ])

    def test_returns_ordered_beats_by_index(self):
        ctx = _ctx({}, project_id=self.proj.id)
        out = od.get_thread(ctx, thread_id="ro-1")
        self.assertTrue(out["found"])
        self.assertEqual(out["name"], "T")
        self.assertEqual(out["beats"], [
            {"index": 0, "id": "ri-1", "kind": "text", "actual_value": "first"},
            {"index": 1, "id": "ri-2", "kind": "placeholder", "actual_value": "second"},
        ])

    def test_missing_thread_returns_found_false(self):
        ctx = _ctx({}, project_id=self.proj.id)
        out = od.get_thread(ctx, thread_id="nope")
        self.assertFalse(out["found"])
        self.assertEqual(out["beats"], [])


class GetScenesTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(email="getscenes@t.com", password="x")
        self.proj = Project.objects.create(title="P", user=user)
        save_outline(SimpleNamespace(project_id=self.proj.pk), {"acts": [
            {"id": "ac-1", "chapters": [
                {"id": "ch-1", "text": "Ch one", "scenes": [
                    {"id": "sc-1", "text": "Opening", "content": None},
                ]},
                {"id": "ch-2", "text": "Ch two", "scenes": [
                    {"id": "sc-2", "text": "Turn", "content": None},
                ]},
            ]},
        ]})

    def test_flattens_scenes_with_chapter_number_and_id(self):
        ctx = _ctx({}, project_id=self.proj.id)
        out = od.get_scenes(ctx)["scenes"]
        self.assertEqual(out, [
            {"scene_id": "sc-1", "title": "Opening", "chapter_id": "ch-1",
             "chapter_number": 1, "paragraph_count": 0},
            {"scene_id": "sc-2", "title": "Turn", "chapter_id": "ch-2",
             "chapter_number": 2, "paragraph_count": 0},
        ])


class AddThreadBeatTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(email="addbeat@t.com", password="x")
        self.proj = Project.objects.create(title="P", user=user)

    def test_inserts_after_beat_id(self):
        save_threads(SimpleNamespace(project_id=self.proj.id), [
            {"id": "ro-1", "title": "T",
             "items": [{"id": "ri-1", "text": "A", "kind": "text"},
                       {"id": "ri-2", "text": "C", "kind": "text"}]},
        ])
        ctx = _ctx({}, project_id=self.proj.id)
        result = goc.gather_add_thread_beat(ctx, {"thread_id": "ro-1", "text": "B", "after_beat_id": "ri-1"})
        coc.commit_add_thread_beat(ctx, result)
        from outline.store import load_threads
        texts = [b["text"] for b in load_threads(ctx)[0]["items"]]
        self.assertEqual(texts, ["A", "B", "C"])

    def test_appends_when_no_after(self):
        save_threads(SimpleNamespace(project_id=self.proj.id), [
            {"id": "ro-1", "title": "T", "items": [{"id": "ri-1", "text": "A", "kind": "text"}]}])
        ctx = _ctx({}, project_id=self.proj.id)
        result = goc.gather_add_thread_beat(ctx, {"thread_id": "ro-1", "text": "B"})
        coc.commit_add_thread_beat(ctx, result)
        from outline.store import load_threads
        self.assertEqual([b["text"] for b in load_threads(ctx)[0]["items"]], ["A", "B"])


class UpdateThreadBeatTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(email="updbeat@t.com", password="x")
        self.proj = Project.objects.create(title="P", user=user)

    def test_patches_beat_by_id(self):
        save_threads(SimpleNamespace(project_id=self.proj.id), [
            {"id": "ro-1", "title": "T",
             "items": [{"id": "ri-1", "text": "A", "kind": "text"},
                       {"id": "ri-2", "text": "B", "kind": "placeholder"}]},
        ])
        ctx = _ctx({}, project_id=self.proj.id)
        result = goc.gather_update_thread_beat(
            ctx, {"thread_id": "ro-1", "beat_id": "ri-2", "text": "B-filled", "kind": "text"})
        coc.commit_update_thread_beat(ctx, result)
        from outline.store import load_threads
        beats = load_threads(ctx)[0]["items"]
        self.assertEqual(beats[1]["text"], "B-filled")
        self.assertEqual(beats[1]["kind"], "text")

    def test_unknown_beat_id_raises(self):
        from actions.capabilities.spec import CapabilityError
        save_threads(SimpleNamespace(project_id=self.proj.id), [
            {"id": "ro-1", "title": "T", "items": [{"id": "ri-1", "text": "A", "kind": "text"}]}])
        ctx = _ctx({}, project_id=self.proj.id)
        result = goc.gather_update_thread_beat(ctx, {"thread_id": "ro-1", "beat_id": "nope", "text": "x"})
        with self.assertRaises(CapabilityError):
            coc.commit_update_thread_beat(ctx, result)


class AddSceneTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(email="addscene@t.com", password="x")
        self.proj = Project.objects.create(title="P", user=user)

    def test_appends_scene_to_chapter(self):
        from outline.store import load_outline
        save_outline(SimpleNamespace(project_id=self.proj.pk), {"acts": [
            {"id": "ac-1", "chapters": [{"id": "ch-1", "text": "C", "scenes": []}]}]})
        ctx = _ctx({}, project_id=self.proj.id)
        result = goc.gather_add_scene(ctx, {"chapter_id": "ch-1", "title": "Opening"})
        coc.commit_add_scene(ctx, result)
        go = load_outline(ctx)
        scenes = go["acts"][0]["chapters"][0]["scenes"]
        self.assertEqual(len(scenes), 1)
        self.assertEqual(scenes[0]["text"], "Opening")
        self.assertTrue(scenes[0]["id"].startswith("sc-"))

    def test_unknown_chapter_raises(self):
        from actions.capabilities.spec import CapabilityError
        save_outline(SimpleNamespace(project_id=self.proj.pk), {"acts": []})
        ctx = _ctx({}, project_id=self.proj.id)
        result = goc.gather_add_scene(ctx, {"chapter_id": "nope", "title": "X"})
        with self.assertRaises(CapabilityError):
            coc.commit_add_scene(ctx, result)
