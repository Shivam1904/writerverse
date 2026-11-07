"""SA-305: Undo a beat delete. The delete really deletes, and returns a signed
snapshot (`undo_token`); `restore_deleted_beat` puts the beat back in place,
same id, same position, links re-attached.

Run through ``dispatch()``, the same path the page's ``callOp`` uses.
"""
from unittest import mock

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.contrib.auth import get_user_model
from projects.models import Project

from outline import beat_undo
from outline.models import OutlineBeat, ThreadBeat
from outline.store import load_outline, load_threads, save_outline, save_threads
from outline.tests.tests_outline_tables import OutlineTablesBase


class BeatUndoTests(OutlineTablesBase):
    def setUp(self):
        super().setUp()
        go = self.outline()
        # A third beat, so a middle beat has neighbours on both sides.
        go["acts"][0]["chapters"][0]["scenes"][0]["beats"].append(
            {"id": "bt-3", "kind": "text", "text": "She leaves"})
        save_outline(self.ctx, go)
        save_threads(self.ctx, [{"id": "ro-1", "title": "Main", "items": [
            {"id": "ri-0", "kind": "heading", "text": "Start"},
            {"id": "ri-1", "kind": "text", "text": "She finds the key",
             "created_at": "2026-10-01T10:00:00+00:00",
             "updated_at": "2026-10-01T11:00:00+00:00"},
            {"id": "ri-2", "kind": "text", "text": "She opens the door"}]}])
        # save_threads replaced the thread beats, so place bt-1 from ri-1 again.
        OutlineBeat.objects.filter(uid="bt-1").update(
            thread_beat=ThreadBeat.objects.get(uid="ri-1"))
        self.sess = ProjectScope(self.project.pk)

    def _run(self, cap, args, actor=Actor.USER_BUTTON, sess=None):
        return dispatch(cap, args, actor, sess or self.sess)

    def _ok(self, cap, args):
        res = self._run(cap, args)
        self.assertEqual(res.status, "ran", res)
        return res.result

    def _del_outline(self, uid):
        return self._ok("delete_outline_item", {"item_type": "beat", "item_id": uid})["undo_token"]

    def _del_thread(self, uid, thread="ro-1"):
        return self._ok("delete_thread_beat", {"thread_id": thread, "beat_id": uid})["undo_token"]

    def _undo(self, token):
        return self._ok("restore_deleted_beat", {"token": token})

    def _rows(self, model, **parent):
        return list(model.objects.filter(**parent).order_by("position", "id")
                    .values_list("uid", "position"))

    # ---- round trips ----------------------------------------------------- #

    def test_outline_beat_comes_back_exactly(self):
        before, rows = load_outline(self.ctx), self._rows(OutlineBeat, scene__uid="sc-1")
        token = self._del_outline("bt-1")  # the linked one, with stamps
        self.assertFalse(OutlineBeat.objects.filter(uid="bt-1").exists())
        res = self._undo(token)
        self.assertEqual(load_outline(self.ctx), before)  # text, kind, stamps, links
        self.assertEqual(self._rows(OutlineBeat, scene__uid="sc-1"), rows)
        self.assertEqual((res["scene_id"], res["index"], res["beat"]["from_item"]),
                         ("sc-1", 0, "ri-1"))

    def test_thread_beat_comes_back_with_its_outline_links(self):
        before_t, before_o = load_threads(self.ctx), load_outline(self.ctx)
        rows = self._rows(ThreadBeat, thread__uid="ro-1")
        token = self._del_thread("ri-1")
        self.assertIsNone(OutlineBeat.objects.get(uid="bt-1").thread_beat)  # link dropped
        res = self._undo(token)
        self.assertEqual(load_threads(self.ctx), before_t)
        self.assertEqual(load_outline(self.ctx), before_o)  # bt-1's from_item is back
        self.assertEqual(self._rows(ThreadBeat, thread__uid="ro-1"), rows)
        self.assertEqual((res["thread_id"], res["index"], res["item_type"]),
                         ("ro-1", 1, "thread_beat"))

    def test_goes_back_after_its_old_neighbour_when_siblings_moved(self):
        token = self._del_outline("bt-2")
        # Meanwhile: a new beat at the top, and bt-3 moved above bt-1.
        self._ok("add_outline_item", {"item_type": "beat", "parent_id": "sc-1",
                                      "id": "bt-new", "text": "New", "at_index": 0})
        self._ok("reorder_outline_item", {"item_type": "beat", "item_id": "bt-3", "new_index": 0})
        self._undo(token)
        order = [u for u, _ in self._rows(OutlineBeat, scene__uid="sc-1")]
        self.assertEqual(order, ["bt-3", "bt-new", "bt-1", "bt-2"])

    def test_goes_before_its_old_next_neighbour_if_the_previous_is_gone(self):
        token = self._del_thread("ri-1")
        self._del_thread("ri-0")
        self._undo(token)
        self.assertEqual([u for u, _ in self._rows(ThreadBeat, thread__uid="ro-1")],
                         ["ri-1", "ri-2"])

    # ---- refusals and repeats -------------------------------------------- #

    def test_refuses_when_the_scene_was_deleted(self):
        token = self._del_outline("bt-1")
        self._ok("delete_outline_item", {"item_type": "scene", "item_id": "sc-1"})
        res = self._run("restore_deleted_beat", {"token": token})
        self.assertEqual((res.status, res.http_status), ("error", 409))
        self.assertIn("scene", res.error)

    def test_refuses_when_the_thread_was_deleted(self):
        token = self._del_thread("ri-1")
        self._ok("delete_plot_thread", {"thread_id": "ro-1"})
        res = self._run("restore_deleted_beat", {"token": token})
        self.assertEqual((res.status, res.http_status), ("error", 409))
        self.assertIn("thread", res.error)

    def test_undo_twice_restores_once(self):
        token = self._del_outline("bt-1")
        self._undo(token)
        again = self._undo(token)
        self.assertTrue(again["already_restored"])
        self.assertEqual(OutlineBeat.objects.filter(scene__uid="sc-1").count(), 3)
        t_token = self._del_thread("ri-2")
        self._undo(t_token)
        self.assertTrue(self._undo(t_token)["already_restored"])
        self.assertEqual(ThreadBeat.objects.filter(thread__uid="ro-1").count(), 3)

    def test_id_taken_meanwhile_comes_back_under_a_new_id(self):
        token = self._del_outline("bt-2")
        self._ok("add_outline_item", {"item_type": "beat", "parent_id": "sc-1",
                                      "id": "bt-2", "text": "Other"})
        res = self._undo(token)
        self.assertNotEqual(res["beat"]["id"], "bt-2")
        self.assertEqual(res["beat"]["text"], "Then")
        self.assertEqual(OutlineBeat.objects.get(uid="bt-2").text, "Other")

    def test_a_relinked_outline_beat_keeps_its_new_link(self):
        token = self._del_thread("ri-1")
        OutlineBeat.objects.filter(uid="bt-1").update(
            thread_beat=ThreadBeat.objects.get(uid="ri-2"))
        self._undo(token)
        self.assertEqual(OutlineBeat.objects.get(uid="bt-1").thread_beat.uid, "ri-2")

    # ---- safety ---------------------------------------------------------- #

    def test_token_from_another_project_is_refused(self):
        token = self._del_outline("bt-1")
        other = Project.objects.create(
            title="Other", user=get_user_model().objects.create_user(email="o@e.com", password="x"))
        res = self._run("restore_deleted_beat", {"token": token}, sess=ProjectScope(other.pk))
        self.assertEqual((res.status, res.http_status), ("error", 400))
        self.assertFalse(OutlineBeat.objects.filter(uid="bt-1").exists())

    def test_edited_or_expired_tokens_are_refused(self):
        token = self._del_outline("bt-1")
        res = self._run("restore_deleted_beat", {"token": token[:-2] + "xx"})
        self.assertEqual(res.http_status, 400)
        with mock.patch.object(beat_undo, "MAX_AGE_S", -1):
            res = self._run("restore_deleted_beat", {"token": token})
        self.assertEqual(res.http_status, 410)
        self.assertFalse(OutlineBeat.objects.filter(uid="bt-1").exists())

    def test_only_the_author_can_undo_not_the_ai(self):
        token = self._del_outline("bt-1")
        res = self._run("restore_deleted_beat", {"token": token}, actor=Actor.CHAT)
        self.assertEqual(res.status, "denied")
