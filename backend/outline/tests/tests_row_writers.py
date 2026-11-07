"""Phase 4b part B: the common outline writers change only their own rows.

Each test runs a real capability, then checks two things: (1) the outline
reads back exactly as the old "load the whole dict → change it → save it all"
path would have left it (edit stamps aside), and (2) the whole-outline
save_outline was never used and no other scene's prose was read.
"""
import copy
import re
from unittest import mock

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.db import connection
from django.test.utils import CaptureQueriesContext
from projects.models import Project

from outline import outline_writes as ow
from outline.models import Chapter, OutlineBeat, Scene, SceneContent, SceneRevision
from outline.store import load_outline, save_outline
from outline.tests.tests_outline_tables import OutlineTablesBase, _doc

_STAMPS = ("created_at", "updated_at")


def _strip_stamps(node):
    if isinstance(node, dict):
        return {k: _strip_stamps(v) for k, v in node.items() if k not in _STAMPS}
    if isinstance(node, list):
        return [_strip_stamps(x) for x in node]
    return node


def _no_whole_save(*_a, **_k):
    raise AssertionError("save_outline must not be used by a row-level writer")


class RowWriterTests(OutlineTablesBase):
    def setUp(self):
        super().setUp()
        save_outline(self.ctx, self.outline())
        self.sess = ProjectScope(self.project.pk)

    def _run(self, cap, args):
        with mock.patch("outline.store.save_outline", _no_whole_save), \
             mock.patch("outline.capabilities.commit.outline_crud.save_outline",
                        _no_whole_save):
            res = dispatch(cap, args, Actor.USER_BUTTON, self.sess)
        self.assertEqual(res.status, "ran", res)
        return res

    def _expect(self, mutate):
        """The outline the old dict path would give: load, change, compare."""
        go = load_outline(self.ctx)
        mutate(go)
        return _strip_stamps(go)

    def _now(self):
        return _strip_stamps(load_outline(self.ctx))

    def _ch1(self, go):
        return go["acts"][0]["chapters"][0]

    # ---- prose ----------------------------------------------------------- #

    def test_prose_save_writes_one_scene_and_reads_no_other_prose(self):
        other_pk = Scene.objects.get(uid="sc-1").pk
        me = Scene.objects.get(uid="sc-2")

        def change(go):
            sc = self._ch1(go)["scenes"][1]
            sc.update(text="Second", content=_doc("three new words"), words=3)
        expected = self._expect(change)
        with CaptureQueriesContext(connection) as q:
            res = self._run("save_scene_content", {
                "scene_id": "sc-2", "text": "Second", "content": _doc("three new words"),
                "auto_analyze": False})
        self.assertEqual(self._now(), expected)
        prose_reads = [x["sql"] for x in q.captured_queries
                       if "outline_scenecontent" in x["sql"]
                       and x["sql"].lstrip().upper().startswith("SELECT")]
        self.assertTrue(prose_reads)
        for sql in prose_reads:
            self.assertNotIn(str(other_pk), re.findall(r"\b\d+\b", sql.split("WHERE", 1)[-1]))
        self.assertIn(str(me.pk), " ".join(prose_reads))
        self.assertEqual(res.result["scene"]["words"], 3)  # the odd "seven" is gone
        self.assertEqual(SceneContent.objects.get(scene=me).rev, 1)
        self.assertEqual(Project.objects.get(pk=self.project.pk).total_word_count, 2 + 3)

    def test_prose_save_keeps_old_text_as_a_revision(self):
        self._run("save_scene_content", {"scene_id": "sc-1", "content": _doc("New text"),
                                         "auto_analyze": False})
        rev = SceneRevision.objects.get(scene__uid="sc-1")
        self.assertEqual(rev.content, _doc("Hello there"))
        self.assertEqual(SceneContent.objects.get(scene__uid="sc-1").rev, 2)

    def test_empty_doc_over_prose_is_refused(self):
        res = dispatch("save_scene_content", {"scene_id": "sc-1", "content": _doc(),
                                              "auto_analyze": False},
                       Actor.USER_BUTTON, self.sess)
        self.assertNotEqual(res.status, "ran")
        self.assertEqual(SceneContent.objects.get(scene__uid="sc-1").doc, _doc("Hello there"))

    def test_restore_revision(self):
        self._run("save_scene_content", {"scene_id": "sc-1", "content": _doc("New text"),
                                         "auto_analyze": False})
        rev = SceneRevision.objects.get(scene__uid="sc-1")
        self._run("restore_scene_revision", {"scene_id": "sc-1", "revision_id": rev.pk})
        self.assertEqual(SceneContent.objects.get(scene__uid="sc-1").doc, _doc("Hello there"))
        self.assertEqual(Scene.objects.get(uid="sc-1").words, 2)

    # ---- structure ------------------------------------------------------- #

    def test_add_items_land_where_the_dict_path_put_them(self):
        res = self._run("add_outline_item", {"item_type": "beat", "parent_id": "sc-1",
                                             "text": "Middle", "at_index": 1})
        beat = res.result["item"]
        expected = self._expect(lambda go: None)
        self.assertEqual([b["id"] for b in self._ch1(expected)["scenes"][0]["beats"]],
                         ["bt-1", beat["id"], "bt-2"])
        res = self._run("add_outline_item", {"item_type": "chapter", "parent_id": "ac-1",
                                             "text": "Three"})
        go = load_outline(self.ctx)
        self.assertEqual([c["id"] for c in go["acts"][0]["chapters"]],
                         ["ch-1", "ch-2", res.result["item"]["id"]])
        self.assertEqual(Project.objects.get(pk=self.project.pk).total_chapters, 3)

    def test_add_scene_with_beats_keeps_thread_links(self):
        res = self._run("add_scene_with_beats", {
            "chapter_id": "ch-2", "title": "New",
            "beats": [{"text": "Key", "from_rough": "ro-1", "from_item": "ri-1"}]})
        sc = load_outline(self.ctx)["acts"][0]["chapters"][1]["scenes"][0]
        self.assertEqual(sc["id"], res.result["scene"]["id"])
        self.assertEqual((sc["beats"][0]["from_rough"], sc["beats"][0]["from_item"]),
                         ("ro-1", "ri-1"))
        self.assertEqual(Project.objects.get(pk=self.project.pk).total_scenes, 3)

    def test_update_beat_and_chapter(self):
        def change(go):
            b = self._ch1(go)["scenes"][0]["beats"][1]
            b.update(text="Later", written=False)
            self._ch1(go)["text"] = "Chapter one"
        expected = self._expect(change)
        self._run("update_outline_item", {"item_type": "beat", "item_id": "bt-2",
                                          "text": "Later", "written": False})
        res = self._run("update_outline_item", {"item_type": "chapter", "item_id": "ch-1",
                                                "text": "Chapter one"})
        self.assertEqual(self._now(), expected)
        # The result is the whole chapter, as load_outline shows it.
        self.assertEqual(res.result["item"], load_outline(self.ctx)["acts"][0]["chapters"][0])

    def test_reorder_rewrites_only_sibling_positions(self):
        def change(go):
            beats = self._ch1(go)["scenes"][0]["beats"]
            beats.insert(0, beats.pop(1))
        expected = self._expect(change)
        res = self._run("reorder_outline_item", {"item_type": "beat", "item_id": "bt-2",
                                                 "new_index": 0})
        self.assertEqual((res.result["old_index"], res.result["new_index"]), (1, 0))
        self.assertEqual(self._now(), expected)
        res = self._run("reorder_outline_item", {"item_type": "act", "item_id": "ac-1",
                                                 "new_index": 99})
        self.assertEqual(res.result["new_index"], 1)
        self.assertEqual([a["id"] for a in load_outline(self.ctx)["acts"]], ["ac-2", "ac-1"])

    def test_delete_beat_and_scene(self):
        def change(go):
            sc = self._ch1(go)["scenes"]
            sc[0]["beats"].pop(0)
            sc.pop(1)
        expected = self._expect(change)
        self._run("delete_outline_item", {"item_type": "beat", "item_id": "bt-1"})
        self._run("delete_outline_item", {"item_type": "scene", "item_id": "sc-2"})
        self.assertEqual(self._now(), expected)
        self.assertEqual(Project.objects.get(pk=self.project.pk).total_scenes, 1)

    def test_resent_id_gets_a_new_id_not_a_500(self):
        # A retry / double add resending an id that is already used: the new
        # item is kept under a fresh id (as save_outline did), never a crash.
        for item_type, parent, used in (("scene", "ch-1", "sc-1"), ("beat", "sc-1", "bt-1"),
                                        ("chapter", "ac-1", "ch-1"), ("act", "", "ac-1")):
            res = self._run("add_outline_item", {"item_type": item_type, "parent_id": parent,
                                                 "id": used, "text": "again"})
            new_id = res.result["item"]["id"]
            self.assertNotEqual(new_id, used, item_type)
            self.assertTrue(ow.get_item(self.project.pk, item_type, new_id), item_type)
        self.assertEqual(Scene.objects.get(uid="sc-1").title, "Opening")  # original untouched

    def test_bad_beat_kind_is_refused(self):
        res = dispatch("update_outline_item", {"item_type": "beat", "item_id": "bt-1",
                                               "kind": "x" * 21}, Actor.USER_BUTTON, self.sess)
        self.assertNotEqual(res.status, "ran")
        self.assertEqual(OutlineBeat.objects.get(uid="bt-1").kind, "text")

    def test_missing_item_is_404(self):
        res = dispatch("update_outline_item", {"item_type": "scene", "item_id": "nope",
                                               "text": "x"}, Actor.USER_BUTTON, self.sess)
        self.assertNotEqual(res.status, "ran")

    # ---- other scene / chapter writers ----------------------------------- #

    def test_place_thread_beat(self):
        res = self._run("place_thread_beat", {"thread_id": "ro-1", "item_id": "ri-1",
                                              "scene_id": "sc-1", "beat_index": 0})
        beats = self._ch1(load_outline(self.ctx))["scenes"][0]["beats"]
        self.assertEqual(beats[0]["id"], res.result["beat"]["id"])
        self.assertEqual((beats[0]["from_rough"], beats[0]["from_item"]), ("ro-1", "ri-1"))
        self.assertEqual(len(beats), 3)

    def test_entity_links(self):
        self._run("link_scene_entity", {"scene_id": "sc-2", "link_type": "braindump", "link_id": 7})
        self.assertEqual(Scene.objects.get(uid="sc-2").entity_links,
                         [{"link_type": "braindump", "link_id": 7}])
        self._run("unlink_scene_entity", {"scene_id": "sc-2", "link_type": "braindump", "link_id": 7})
        self.assertEqual(Scene.objects.get(uid="sc-2").entity_links, [])

    def test_set_chapter_pov(self):
        def change(go):
            go["acts"][0]["chapters"][1]["pov"] = {
                "mode": "first", "character": "Mara", "character_id": self.mara.pk}
        expected = self._expect(change)
        self._run("set_chapter_pov", {"chapter_id": "ch-2", "mode": "first",
                                      "character": "Mara", "character_id": self.mara.pk})
        self.assertEqual(self._now(), expected)
        ch = Chapter.objects.get(uid="ch-2")
        self.assertEqual((ch.pov_mode, ch.pov_character_id, ch.extra), ("first", self.mara.pk, {}))

    def test_scene_pipeline_commit_writes_only_analysis(self):
        from outline.capabilities.pipelines import _PIPELINES, _make_commit
        key = next(iter(_PIPELINES))
        Scene.objects.filter(uid="sc-1").update(analysis={"other": {"status": "ok"}})
        before = copy.deepcopy(self._now())
        with mock.patch("outline.store.save_outline", _no_whole_save):
            _make_commit(_PIPELINES[key])(self.sess, {"scene_id": "sc-1",
                                                      "data": {"status": "ok", "v": 1}})
        sc = Scene.objects.get(uid="sc-1")
        self.assertEqual(sc.analysis[key], {"status": "ok", "v": 1})
        self.assertEqual(sc.analysis["other"], {"status": "ok"})  # other keys kept
        self._ch1(before)["scenes"][0]["analysis"][key] = {"status": "ok", "v": 1}
        self.assertEqual(self._now(), before)
        self.assertEqual(OutlineBeat.objects.filter(scene=sc).count(), 2)
