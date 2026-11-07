"""load_threads / save_threads over the PlotThread + ThreadBeat tables.

save_threads takes the whole list (the shape the old ThreadStore blob held)
and syncs it into rows; load_threads gives the same list back."""
import copy
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from projects.models import Project

from outline.models import PlotThread, ThreadBeat
from outline.store import load_threads, save_threads

THREADS = [
    {
        "id": "ro-main",
        "title": "The Discovery",
        "description": "Main plot",
        "color": "#aa3355",
        "scope": {"type": "story", "name": ""},
        "source": "ai_thread",
        "template_id": "three_act",
        "created_at": "2026-09-01T10:00:00.000000+00:00",
        "items": [
            {"id": "it-1", "kind": "heading", "text": "Setup"},
            {"id": "ri-2", "kind": "text", "text": "Books move on their own",
             "created_at": "2026-09-01T10:00:00.000000+00:00",
             "updated_at": "2026-09-02T11:30:05.000000+00:00"},
            {"id": "ri-3", "kind": "placeholder", "text": "… payoff not yet drafted"},
        ],
    },
    {
        "id": "ro-arc",
        "scope": {"type": "character", "name": "Aelden"},
        "source": "seed",
        "template_id": None,
        "items": [],
    },
]


class ThreadStoreTest(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(email="ts@x.io", password="pw")
        self.project = Project.objects.create(user=user, title="P")
        self.ctx = SimpleNamespace(project_id=self.project.id)

    def test_round_trip_is_exact(self):
        save_threads(self.ctx, copy.deepcopy(THREADS))
        expected = copy.deepcopy(THREADS)
        del expected[1]["template_id"]  # None comes back as absent; readers use .get()
        self.assertEqual(load_threads(self.ctx), expected)
        self.assertEqual(PlotThread.objects.count(), 2)
        self.assertEqual(ThreadBeat.objects.count(), 3)

    def test_resaving_unchanged_list_writes_nothing(self):
        save_threads(self.ctx, copy.deepcopy(THREADS))
        loaded = load_threads(self.ctx)
        with CaptureQueriesContext(connection) as q:
            save_threads(self.ctx, loaded)
        writes = [x["sql"] for x in q.captured_queries
                  if x["sql"].split()[0] in ("INSERT", "UPDATE", "DELETE")]
        self.assertEqual(writes, [])

    def test_insert_edit_reorder_delete(self):
        save_threads(self.ctx, copy.deepcopy(THREADS))
        threads = load_threads(self.ctx)
        main = threads[0]
        main["items"].insert(1, {"id": "ri-new", "kind": "text", "text": "A hidden door"})
        main["items"][2]["text"] = "Books fly"           # edit ri-2
        del main["items"][3]                             # drop ri-3
        threads.reverse()                                # arc thread to the top
        save_threads(self.ctx, threads)

        out = load_threads(self.ctx)
        self.assertEqual([t["id"] for t in out], ["ro-arc", "ro-main"])
        self.assertEqual([b["id"] for b in out[1]["items"]], ["it-1", "ri-new", "ri-2"])
        self.assertEqual(out[1]["items"][2]["text"], "Books fly")
        self.assertFalse(ThreadBeat.objects.filter(uid="ri-3").exists())

    def test_dropping_a_thread_deletes_its_beats(self):
        save_threads(self.ctx, copy.deepcopy(THREADS))
        save_threads(self.ctx, [load_threads(self.ctx)[1]])
        self.assertEqual(list(PlotThread.objects.values_list("uid", flat=True)), ["ro-arc"])
        self.assertEqual(ThreadBeat.objects.count(), 0)

    def test_missing_ids_are_minted_and_written_back(self):
        threads = [{"title": "New", "items": [{"text": "first"}]}]
        save_threads(self.ctx, threads)
        self.assertTrue(threads[0]["id"].startswith("ro-"))
        self.assertTrue(threads[0]["items"][0]["id"].startswith("ri-"))
        self.assertEqual(load_threads(self.ctx)[0]["id"], threads[0]["id"])

    def test_projects_are_separate(self):
        other_user = get_user_model().objects.create_user(email="o@x.io", password="pw")
        other = SimpleNamespace(
            project_id=Project.objects.create(user=other_user, title="Q").id,
        )
        save_threads(self.ctx, copy.deepcopy(THREADS))
        save_threads(other, [])
        self.assertEqual(len(load_threads(self.ctx)), 2)
        self.assertEqual(load_threads(other), [])
