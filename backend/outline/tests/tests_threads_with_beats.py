"""`get_threads_with_beats` — every thread's beats in one read (SA-88).

The Threads page used to call `get_thread` once per thread, and each call loaded
every thread plus every pending proposal of the project and filtered them in
Python. Now one read loads the threads once and the beat proposals in one
SQL-filtered query, so the query count does not grow with the thread count."""
from types import SimpleNamespace

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from actions.models import Proposal
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

from outline.readers import get_thread, get_threads_with_beats
from outline.store import save_threads


def _thread(n: int) -> dict:
    return {"id": f"t{n}", "title": f"Thread {n}",
            "scope": {"type": "story", "name": "the whole story"},
            "items": [{"id": f"t{n}-b1", "kind": "text", "text": f"beat one of {n}"},
                      {"id": f"t{n}-b2", "kind": "text", "text": f"beat two of {n}"}]}


class ThreadsWithBeatsTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(email="twb@test.com", password="x")
        self.project = Project.objects.create(title="T", user=user)
        self.ctx = SimpleNamespace(project_id=self.project.id)

    def _seed(self, count: int):
        save_threads(self.ctx, [_thread(n) for n in range(1, count + 1)])

    def _propose(self, preview: dict, status=Proposal.STATUS_PROPOSED):
        return Proposal.objects.create(
            project=self.project, capability="propose_update_beat",
            proposal={"preview": preview}, status=status,
        )

    def test_matches_get_thread_for_every_thread(self):
        self._seed(3)
        self._propose({"type": "beat_edit", "thread_id": "t1", "beat_id": "t1-b2",
                       "fields": {"text": "new two"}})
        self._propose({"type": "beat_insert", "thread_id": "t3", "index": 1,
                       "fields": {"text": "ghost", "kind": "text"}})
        batched = get_threads_with_beats(self.ctx)["threads"]
        self.assertEqual([t["thread_id"] for t in batched], ["t1", "t2", "t3"])
        for t in batched:
            self.assertEqual(t, get_thread(self.ctx, thread_id=t["thread_id"]))
        self.assertEqual(batched[0]["beats"][1]["proposed_value"], "new two")
        self.assertTrue(batched[2]["beats"][1]["insert"])
        self.assertNotIn("proposal", batched[1]["beats"][0])

    def test_ignores_other_proposals(self):
        self._seed(1)
        # Not a beat proposal, not pending, other thread: none may show up.
        self._propose({"type": "outline_beat_insert", "scene_id": "s1", "index": 0,
                       "fields": {"text": "x"}})
        self._propose({"type": "beat_edit", "thread_id": "t1", "beat_id": "t1-b1",
                       "fields": {"text": "applied"}}, status=Proposal.STATUS_APPLIED)
        self._propose({"type": "beat_edit", "thread_id": "gone", "beat_id": "t1-b1",
                       "fields": {"text": "elsewhere"}})
        beats = get_threads_with_beats(self.ctx)["threads"][0]["beats"]
        self.assertEqual(len(beats), 2)
        self.assertFalse(any("proposal" in b for b in beats))

    def test_query_count_does_not_grow_with_threads(self):
        # threads + their beats (prefetch) + one proposals query.
        self._seed(2)
        with self.assertNumQueries(3):
            get_threads_with_beats(self.ctx)
        self._seed(12)
        with self.assertNumQueries(3):
            out = get_threads_with_beats(self.ctx)
        self.assertEqual(len(out["threads"]), 12)

    def test_empty_project_skips_the_proposals_query(self):
        with self.assertNumQueries(1):
            self.assertEqual(get_threads_with_beats(self.ctx), {"threads": []})

    def test_cap_is_page_only(self):
        self._seed(1)
        sess = ProjectScope(self.project.id)
        res = dispatch("get_threads_with_beats", {}, Actor.USER_BUTTON, sess)
        self.assertEqual(res.status, "ran", res.error)
        self.assertEqual(len(res.result["threads"]), 1)
        chat = dispatch("get_threads_with_beats", {}, Actor.CHAT, sess)
        self.assertNotEqual(chat.status, "ran")
