"""Thread writers edit PlotThread / ThreadBeat rows directly. These cover the
ones with no other test, and the order (`position`) after inserts/deletes."""
from __future__ import annotations

from types import SimpleNamespace

from actions.capabilities.spec import CapabilityError
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from rest_framework.test import APIClient

from outline.capabilities.commit import outline_crud as oc
from outline.capabilities.commit.threads import (
    commit_generate_thread,
    commit_user_wishes_rough,
)
from outline.models import PlotThread, ThreadBeat
from outline.store import load_outline, load_threads, save_outline, save_threads


def _beats(n):
    return [{"id": f"b{i}", "kind": "text", "text": f"beat {i}"} for i in range(n)]


class ThreadWritersTest(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(email="tw@x.io", password="pw")
        self.project = Project.objects.create(user=user, title="P")
        self.ctx = SimpleNamespace(project_id=self.project.id)
        save_threads(self.ctx, [
            {"id": "ro-a", "title": "A", "items": _beats(3)},
            {"id": "ro-b", "title": "B", "items": []},
        ])

    def _ids(self, thread_id="ro-a"):
        t = next(t for t in load_threads(self.ctx) if t["id"] == thread_id)
        return [b["id"] for b in t["items"]]

    # ── threads ───────────────────────────────────────────────────────
    def test_add_thread_goes_on_top_with_its_beats(self):
        res = {"name": "C", "beats": ["one", {"text": "two", "kind": "heading"}]}
        oc.commit_add_plot_thread(self.ctx, res)
        out = load_threads(self.ctx)
        self.assertEqual([t["title"] for t in out], ["C", "A", "B"])
        self.assertEqual([(b["kind"], b["text"]) for b in out[0]["items"]],
                         [("text", "one"), ("heading", "two")])
        self.assertEqual(res["thread"]["id"], out[0]["id"])

    def test_update_thread_touches_only_that_row(self):
        res = {"thread_id": "ro-b", "name": "B2", "color": "#123456", "scope_type": "story"}
        oc.commit_update_plot_thread(self.ctx, res)
        b = PlotThread.objects.get(uid="ro-b")
        self.assertEqual((b.title, b.color, b.scope_type), ("B2", "#123456", "story"))
        self.assertEqual(PlotThread.objects.get(uid="ro-a").title, "A")
        self.assertEqual(res["thread"]["title"], "B2")

    def test_delete_thread_takes_its_beats(self):
        oc.commit_delete_plot_thread(self.ctx, {"thread_id": "ro-a"})
        self.assertEqual(list(PlotThread.objects.values_list("uid", flat=True)), ["ro-b"])
        self.assertEqual(ThreadBeat.objects.count(), 0)

    def test_unknown_thread_is_404(self):
        with self.assertRaises(CapabilityError) as e:
            oc.commit_delete_plot_thread(self.ctx, {"thread_id": "nope"})
        self.assertEqual(e.exception.status, 404)

    # ── beats ─────────────────────────────────────────────────────────
    def test_add_beat_after_one_and_at_end(self):
        res = {"thread_id": "ro-a", "text": "mid", "after_beat_id": "b0"}
        oc.commit_add_thread_beat(self.ctx, res)
        new_id = res["beat"]["id"]
        self.assertEqual(self._ids(), ["b0", new_id, "b1", "b2"])
        self.assertTrue(res["beat"]["updated_at"])

        res2 = {"thread_id": "ro-a", "text": "end"}
        oc.commit_add_thread_beat(self.ctx, res2)
        self.assertEqual(self._ids()[-1], res2["beat"]["id"])

    def test_insert_after_delete_keeps_order(self):
        oc.commit_delete_thread_beat(self.ctx, {"thread_id": "ro-a", "beat_id": "b1"})
        self.assertEqual(self._ids(), ["b0", "b2"])  # positions now 0, 2 (a gap)
        res = {"thread_id": "ro-a", "text": "x", "after_beat_id": "b0"}
        oc.commit_add_thread_beat(self.ctx, res)
        self.assertEqual(self._ids(), ["b0", res["beat"]["id"], "b2"])

    def test_delete_unknown_beat_is_404(self):
        with self.assertRaises(CapabilityError) as e:
            oc.commit_delete_thread_beat(self.ctx, {"thread_id": "ro-a", "beat_id": "zz"})
        self.assertEqual(e.exception.status, 404)

    def test_reorder_beats_saves_the_new_order(self):
        res = {"thread_id": "ro-a", "beat_ids": ["b2", "b0", "b1"]}
        oc.commit_reorder_thread_beats(self.ctx, res)
        self.assertEqual(self._ids(), ["b2", "b0", "b1"])
        self.assertEqual(res["beat_ids"], ["b2", "b0", "b1"])
        # A move is not an edit: the gauges' stale stamp stays put.
        self.assertIsNone(ThreadBeat.objects.get(uid="b2").updated_at)

    def test_reorder_beats_touches_only_that_thread(self):
        save_threads(self.ctx, [
            {"id": "ro-a", "title": "A", "items": _beats(2)},
            {"id": "ro-b", "title": "B", "items": [{"id": "x0", "text": "x"}, {"id": "x1", "text": "y"}]},
        ])
        oc.commit_reorder_thread_beats(self.ctx, {"thread_id": "ro-a", "beat_ids": ["b1", "b0"]})
        self.assertEqual(self._ids(), ["b1", "b0"])
        self.assertEqual(self._ids("ro-b"), ["x0", "x1"])

    def test_reorder_beats_refuses_a_stale_list(self):
        # A beat missing from the list (added elsewhere) or an unknown id: 409,
        # and nothing moves.
        for ids in (["b1", "b0"], ["b1", "b0", "b2", "zz"], ["b1", "zz", "b0"]):
            with self.subTest(ids=ids), self.assertRaises(CapabilityError) as e:
                oc.commit_reorder_thread_beats(self.ctx, {"thread_id": "ro-a", "beat_ids": ids})
            self.assertEqual(e.exception.status, 409)
        self.assertEqual(self._ids(), ["b0", "b1", "b2"])

    def test_reorder_beats_unknown_thread_is_404(self):
        with self.assertRaises(CapabilityError) as e:
            oc.commit_reorder_thread_beats(self.ctx, {"thread_id": "nope", "beat_ids": ["b0"]})
        self.assertEqual(e.exception.status, 404)

    def test_update_beat_stamps_only_that_beat(self):
        oc.commit_update_thread_beat(
            self.ctx, {"thread_id": "ro-a", "beat_id": "b1", "text": " new ", "kind": "heading"},
        )
        b1 = ThreadBeat.objects.get(uid="b1")
        self.assertEqual((b1.text, b1.kind), ("new", "heading"))
        self.assertIsNotNone(b1.updated_at)
        self.assertIsNone(ThreadBeat.objects.get(uid="b0").updated_at)

    def test_accept_beat_insert_at_index(self):
        res = {"preview": {"type": "beat_insert", "thread_id": "ro-a", "index": 1,
                           "fields": {"text": "AI beat"}}}
        oc.commit_accept_beat(self.ctx, res)
        self.assertEqual(self._ids(), ["b0", res["beat"]["id"], "b1", "b2"])

    def test_accept_beat_on_deleted_thread_is_409(self):
        res = {"preview": {"type": "beat_insert", "thread_id": "gone", "fields": {}}}
        with self.assertRaises(CapabilityError) as e:
            oc.commit_accept_beat(self.ctx, res)
        self.assertEqual(e.exception.status, 409)

    # ── AI-built threads ──────────────────────────────────────────────
    def test_generate_thread_appends_at_bottom(self):
        commit_generate_thread(self.ctx, {"preview": {"plot_thread": {
            "id": "ro-ai", "title": "AI", "source": "ai_thread",
            "scope": {"type": "story", "name": ""}, "items": _beats(2),
        }}})
        out = load_threads(self.ctx)
        self.assertEqual([t["id"] for t in out], ["ro-a", "ro-b", "ro-ai"])
        self.assertTrue(out[-1].get("color"))  # got a distinct colour

    def test_user_wishes_replaces_its_previous_thread(self):
        for n in (1, 2):
            commit_user_wishes_rough(self.ctx, {"preview": {"rough_outline": {
                "id": f"ro-w{n}", "source": "user_wishes",
                "scope": {"type": "story", "name": ""}, "items": _beats(n),
            }}})
        self.assertEqual([t["id"] for t in load_threads(self.ctx)], ["ro-a", "ro-b", "ro-w2"])

    # ── deleting unlinks placed outline beats (text kept) ─────────────
    def _place_beats(self):
        save_outline(self.ctx, {"acts": [{"id": "a1", "text": "Act", "chapters": [
            {"id": "c1", "text": "Ch", "scenes": [{"id": "s1", "text": "Library", "beats": [
                {"id": "ob1", "text": "He finds a hidden door — but it's locked",
                 "from_rough": "ro-a", "from_item": "b1"},
                {"id": "ob2", "text": "From thread B", "from_rough": "ro-b", "from_item": "x"},
                {"id": "ob3", "text": "Author's own beat"},
            ]}]},
        ]}]})

    def _outline_beats(self):
        return {b["id"]: b for b in load_outline(self.ctx)["acts"][0]["chapters"][0]["scenes"][0]["beats"]}

    def test_delete_thread_unlinks_its_outline_beats_and_keeps_text(self):
        self._place_beats()
        oc.commit_delete_plot_thread(self.ctx, {"thread_id": "ro-a"})
        beats = self._outline_beats()
        self.assertEqual(set(beats), {"ob1", "ob2", "ob3"})  # nothing deleted
        self.assertEqual(beats["ob1"]["text"], "He finds a hidden door — but it's locked")
        self.assertNotIn("from_rough", beats["ob1"])
        self.assertNotIn("from_item", beats["ob1"])
        self.assertEqual(beats["ob2"]["from_rough"], "ro-b")  # other thread untouched

    def test_delete_thread_beat_drops_only_that_item_link(self):
        self._place_beats()
        oc.commit_delete_thread_beat(self.ctx, {"thread_id": "ro-a", "beat_id": "b1"})
        beats = self._outline_beats()
        self.assertNotIn("from_item", beats["ob1"])
        self.assertEqual(beats["ob1"]["from_rough"], "ro-a")  # thread still exists → keeps colour
        self.assertEqual(beats["ob1"]["text"], "He finds a hidden door — but it's locked")

    def test_delete_with_nothing_placed_does_not_touch_outline(self):
        oc.commit_delete_plot_thread(self.ctx, {"thread_id": "ro-b"})
        from outline.models import Act
        self.assertFalse(Act.objects.filter(project=self.project).exists())

    # ── character threads link by id, so a rename follows ─────────────
    def _character(self, name, aliases=()):
        from characters.models import Character
        return Character.objects.create(
            project=self.project, name=name, aliases=[{"name": a} for a in aliases])

    def _scope(self, thread_id):
        return next(t for t in load_threads(self.ctx) if t["id"] == thread_id)["scope"]

    def test_character_thread_follows_a_rename(self):
        aelden = self._character("Prince Aelden")
        res = {"name": "Aelden's arc", "scope_type": "character", "scope_name": "prince aelden"}
        oc.commit_add_plot_thread(self.ctx, res)
        tid = res["thread"]["id"]
        self.assertEqual(PlotThread.objects.get(uid=tid).character_id, aelden.id)

        aelden.name = "King Aelden"
        aelden.save()
        self.assertEqual(self._scope(tid)["name"], "King Aelden")  # no thread update needed

    def test_alias_links_and_unknown_name_stays_text(self):
        aelden = self._character("Prince Aelden", aliases=["Aelden"])
        for name in ("Aelden", "Mira"):
            oc.commit_add_plot_thread(
                self.ctx, {"name": name, "scope_type": "character", "scope_name": name})
        linked = dict(PlotThread.objects.values_list("scope_name", "character_id"))
        self.assertEqual(linked, {"Aelden": aelden.id, "Mira": None, "": None})
        mira = next(t for t in load_threads(self.ctx) if t.get("title") == "Mira")
        self.assertEqual(mira["scope"], {"type": "character", "name": "Mira"})

    def test_changing_scope_relinks(self):
        a, b = self._character("Aelden"), self._character("Varen")
        res = {"name": "Arc", "scope_type": "character", "scope_name": "Aelden"}
        oc.commit_add_plot_thread(self.ctx, res)
        tid = res["thread"]["id"]
        oc.commit_update_plot_thread(self.ctx, {"thread_id": tid, "scope_name": "Varen"})
        self.assertEqual(PlotThread.objects.get(uid=tid).character_id, b.id)
        oc.commit_update_plot_thread(self.ctx, {"thread_id": tid, "scope_type": "story"})
        self.assertIsNone(PlotThread.objects.get(uid=tid).character_id)
        self.assertNotEqual(a.id, b.id)


class ReorderThreadBeatsRouteTest(TestCase):
    """The Threads page's drag goes through the generic op route and is saved."""

    def setUp(self):
        user = get_user_model().objects.create_user(email="rt@x.io", password="pw")
        self.project = Project.objects.create(user=user, title="P")
        self.ctx = SimpleNamespace(project_id=self.project.id)
        save_threads(self.ctx, [{"id": "ro-a", "title": "A", "items": _beats(3)}])
        self.client = APIClient()
        self.client.force_authenticate(user)
        self.url = f"/api/consistency/projects/{self.project.id}/op/reorder_thread_beats/"

    def _ids(self):
        return [b["id"] for b in load_threads(self.ctx)[0]["items"]]

    def test_drag_is_saved(self):
        resp = self.client.post(
            self.url, {"thread_id": "ro-a", "beat_ids": ["b1", "b2", "b0"]}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._ids(), ["b1", "b2", "b0"])

    def test_bad_lists_are_400(self):
        for body in ({"thread_id": "ro-a"}, {"thread_id": "ro-a", "beat_ids": []},
                     {"thread_id": "ro-a", "beat_ids": ["b0", "b0", "b1"]}):
            with self.subTest(body=body):
                resp = self.client.post(self.url, body, format="json")
                self.assertEqual(resp.status_code, 400)
        self.assertEqual(self._ids(), ["b0", "b1", "b2"])

