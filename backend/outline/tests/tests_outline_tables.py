"""The grand outline lives in tables (Act → Chapter → Scene → OutlineBeat, prose
in SceneContent) but the app still reads/writes ONE nested dict through
load_outline / save_outline. These check the round trip is exact, that saves
write only what changed, and that the real outline capabilities still work.
"""
import copy
from types import SimpleNamespace

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from characters.models import Character
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from projects.models import Project

from outline.capabilities.commit import outline_crud as oc
from outline.models import Act, Chapter, OutlineBeat, Scene, SceneContent, SceneRevision
from outline.revisions import record_scene_revision
from outline.store import (
    load_chapter,
    load_chapter_of_scene,
    load_outline,
    load_scene,
    save_outline,
    save_threads,
)

User = get_user_model()


def _doc(*paras):
    return {"type": "doc", "content": [
        {"type": "paragraph", "attrs": {"refs": [{"entityType": "character", "id": 3}]},
         "content": [{"type": "text", "text": p, "marks": [{"type": "bold"}]}]}
        for p in paras]}


def _writes(queries, table=None):
    out = [q["sql"] for q in queries
           if q["sql"].lstrip().split(" ", 1)[0].upper() in ("INSERT", "UPDATE", "DELETE")]
    return [q for q in out if table is None or f'"{table}"' in q]


class OutlineTablesBase(TestCase):
    def setUp(self):
        user = User.objects.create_user(email="tables@e.com", password="x")
        self.project = Project.objects.create(title="P", user=user)
        self.ctx = SimpleNamespace(project_id=self.project.pk)
        self.mara = Character.objects.create(project=self.project, name="Mara")
        save_threads(self.ctx, [{"id": "ro-1", "title": "Main", "items": [
            {"id": "ri-1", "kind": "text", "text": "She finds the key"}]}])

    def outline(self):
        """A dict with every key the writers use, plus a few odd ones."""
        return {
            "base_template": "three_act",
            "acts": [
                {"id": "ac-1", "text": "Act I", "created_at": "2026-10-01T10:00:00+00:00",
                 "updated_at": "2026-10-02T10:00:00+00:00", "chapters": [
                    {"id": "ch-1", "text": None, "created_at": "2026-10-01T10:00:00+00:00",
                     "pov": {"mode": "third-limited", "character": "Mara",
                             "character_id": self.mara.pk},
                     "scenes": [
                        {"id": "sc-1", "text": "Opening", "beats": [
                            {"id": "bt-1", "kind": "text", "text": "She finds the key",
                             "from_rough": "ro-1", "from_item": "ri-1",
                             "created_at": "2026-10-01T10:00:00+00:00",
                             "updated_at": "2026-10-01T11:00:00+00:00"},
                            {"id": "bt-2", "kind": "heading", "text": "Then", "written": True},
                         ],
                         "thread": None, "words": 2, "content": _doc("Hello there"),
                         "analysis": {"summary": {"status": "ok", "text": "s"}},
                         "entity_links": [{"link_type": "worldbuilding", "link_id": 3}],
                         "created_at": "2026-10-01T10:00:00+00:00",
                         "updated_at": "2026-10-02T09:30:00+00:00"},
                        {"id": "sc-2", "text": "", "beats": [], "title": "legacy key",
                         "words": "seven",                     # odd type → kept in extra
                         "updated_at": "2026-10-02T09:30:00.123456+00:00"},  # not to-the-second
                     ]},
                    {"id": "ch-2", "text": "Two", "pov": {"mode": "first"},  # unusual POV
                     "scenes": []},
                 ]},
                {"id": "ac-2", "text": "Act II", "chapters": []},
            ],
        }


class RoundTripTests(OutlineTablesBase):
    def test_round_trip_is_exact(self):
        go = self.outline()
        save_outline(self.ctx, copy.deepcopy(go))
        self.assertEqual(load_outline(self.ctx), go)
        self.assertEqual(
            (Act.objects.count(), Chapter.objects.count(), Scene.objects.count(),
             OutlineBeat.objects.count(), SceneContent.objects.count()),
            (2, 2, 2, 2, 1),
        )
        beat = OutlineBeat.objects.get(uid="bt-1")
        self.assertEqual((beat.thread.uid, beat.thread_beat.uid), ("ro-1", "ri-1"))
        self.assertEqual(Chapter.objects.get(uid="ch-1").pov_character, self.mara)

    def test_empty_project_reads_empty(self):
        self.assertEqual(load_outline(self.ctx), {})

    def test_pov_name_follows_a_rename(self):
        save_outline(self.ctx, self.outline())
        self.mara.name = "Mara Vey"
        self.mara.save()
        pov = load_outline(self.ctx)["acts"][0]["chapters"][0]["pov"]
        self.assertEqual(pov["character"], "Mara Vey")

    def test_link_to_a_missing_thread_is_dropped(self):
        go = self.outline()
        go["acts"][0]["chapters"][0]["scenes"][0]["beats"][0]["from_rough"] = "ro-gone"
        save_outline(self.ctx, go)
        b = load_outline(self.ctx)["acts"][0]["chapters"][0]["scenes"][0]["beats"][0]
        self.assertNotIn("from_rough", b)
        self.assertNotIn("from_item", b)  # ri-1 belongs to ro-1, not to the missing thread
        self.assertEqual(b["text"], "She finds the key")

    def test_duplicate_ids_are_renamed_not_dropped(self):
        go = self.outline()
        scenes = go["acts"][0]["chapters"][0]["scenes"]
        scenes.append({"id": "sc-1", "text": "Copy", "beats": []})
        save_outline(self.ctx, go)
        texts = [s["text"] for s in load_outline(self.ctx)["acts"][0]["chapters"][0]["scenes"]]
        self.assertEqual(texts, ["Opening", "", "Copy"])
        self.assertNotEqual(scenes[2]["id"], "sc-1")  # the new id is written back


class WriteOnlyChangesTests(OutlineTablesBase):
    def test_unchanged_save_writes_nothing(self):
        save_outline(self.ctx, self.outline())
        go = load_outline(self.ctx)
        with CaptureQueriesContext(connection) as q:
            save_outline(self.ctx, go)
        self.assertEqual(_writes(q.captured_queries), [])

    def test_lean_dict_saved_back_keeps_the_prose(self):
        save_outline(self.ctx, self.outline())
        lean = load_outline(self.ctx, include_prose=False)
        lean["acts"][0]["chapters"][0]["scenes"][0]["text"] = "Renamed"
        save_outline(self.ctx, lean)
        sc = load_outline(self.ctx)["acts"][0]["chapters"][0]["scenes"][0]
        self.assertEqual((sc["text"], sc["content"]), ("Renamed", _doc("Hello there")))

    def test_lean_read_never_touches_scene_content(self):
        save_outline(self.ctx, self.outline())
        with CaptureQueriesContext(connection) as q:
            go = load_outline(self.ctx, include_prose=False)
        self.assertFalse([x for x in q.captured_queries if "outline_scenecontent" in x["sql"]])
        sc = go["acts"][0]["chapters"][0]["scenes"][0]
        self.assertNotIn("content", sc)
        self.assertEqual(sc["words"], 2)

    def test_lean_grand_outline_reader(self):
        from outline.readers import get_grand_outline
        save_outline(self.ctx, self.outline())
        with CaptureQueriesContext(connection) as q:
            go = get_grand_outline(self.ctx, include_prose=False)["grand_outline"]
        self.assertFalse([x for x in q.captured_queries if "outline_scenecontent" in x["sql"]])
        self.assertNotIn("content", go["acts"][0]["chapters"][0]["scenes"][0])


class ByIdReaderTests(OutlineTablesBase):
    """load_scene / load_chapter read ONE node by id and return exactly the
    dict load_outline nests for it, without reading the rest of the book."""

    def setUp(self):
        super().setUp()
        save_outline(self.ctx, self.outline())

    def test_same_dict_as_the_full_tree(self):
        full = load_outline(self.ctx)["acts"][0]["chapters"][0]
        lean = load_outline(self.ctx, include_prose=False)["acts"][0]["chapters"][0]
        self.assertEqual(load_scene(self.ctx, "sc-1"), full["scenes"][0])
        self.assertEqual(load_scene(self.ctx, "sc-1", include_prose=False), lean["scenes"][0])
        self.assertEqual(load_chapter(self.ctx, "ch-1", include_prose=True), full)
        self.assertEqual(load_chapter(self.ctx, "ch-1"), lean)
        self.assertEqual(load_chapter_of_scene(self.ctx, "sc-2", include_prose=True), full)

    def test_unknown_id_or_other_project_is_none(self):
        other = SimpleNamespace(project_id=self.project.pk + 999)
        self.assertIsNone(load_scene(self.ctx, "sc-nope"))
        self.assertIsNone(load_scene(other, "sc-1"))
        self.assertIsNone(load_chapter(other, "ch-1"))
        self.assertIsNone(load_chapter_of_scene(other, "sc-1"))

    def test_scene_read_skips_acts_and_other_scenes(self):
        with CaptureQueriesContext(connection) as q:
            load_scene(self.ctx, "sc-1")
        sql = " ".join(x["sql"] for x in q.captured_queries)
        self.assertNotIn('"outline_act"', sql)
        self.assertNotIn('"outline_chapter"', sql)


class CapabilityTests(OutlineTablesBase):
    def setUp(self):
        super().setUp()
        save_outline(self.ctx, self.outline())
        self.sess = ProjectScope(self.project.pk)

    def _run(self, cap, args):
        res = dispatch(cap, args, Actor.USER_BUTTON, self.sess)
        self.assertEqual(res.status, "ran", res)
        return res

    def _scene_ids(self, chapter=0):
        return [s["id"] for s in load_outline(self.ctx)["acts"][0]["chapters"][chapter]["scenes"]]

    def test_insert_scene(self):
        self._run("add_outline_item", {"item_type": "scene", "parent_id": "ch-1",
                                       "text": "Middle", "at_index": 1})
        ids = self._scene_ids()
        self.assertEqual(len(ids), 3)
        self.assertEqual((ids[0], ids[2]), ("sc-1", "sc-2"))
        self.assertEqual(list(Scene.objects.filter(chapter__uid="ch-1").values_list("uid", flat=True)),
                         ids)

    def test_reorder_scene(self):
        self._run("reorder_outline_item", {"item_type": "scene", "item_id": "sc-2", "new_index": 0})
        self.assertEqual(self._scene_ids(), ["sc-2", "sc-1"])

    def test_move_scene_to_another_chapter_keeps_prose_and_history(self):
        record_scene_revision(self.project.pk, "sc-1", _doc("old"), _doc("Hello there"))
        go = load_outline(self.ctx)
        sc = go["acts"][0]["chapters"][0]["scenes"].pop(0)
        go["acts"][0]["chapters"][1]["scenes"].append(sc)
        save_outline(self.ctx, go)
        self.assertEqual(self._scene_ids(1), ["sc-1"])
        moved = Scene.objects.get(uid="sc-1")
        self.assertEqual(moved.chapter.uid, "ch-2")
        self.assertEqual(moved.content.doc, _doc("Hello there"))
        self.assertEqual(moved.revisions.count(), 1)

    def test_add_and_delete_chapter_and_act(self):
        self._run("add_outline_item", {"item_type": "act", "parent_id": "", "text": "Act III"})
        self._run("delete_outline_item", {"item_type": "chapter", "item_id": "ch-1"})
        go = load_outline(self.ctx)
        self.assertEqual([a["text"] for a in go["acts"]], ["Act I", "Act II", "Act III"])
        self.assertEqual([c["id"] for c in go["acts"][0]["chapters"]], ["ch-2"])
        self.assertFalse(Scene.objects.filter(uid__in=["sc-1", "sc-2"]).exists())
        self.assertFalse(SceneContent.objects.exists())
        self._run("delete_outline_item", {"item_type": "act", "item_id": "ac-1"})
        self.assertFalse(Chapter.objects.exists())
        self.assertEqual(Project.objects.get(pk=self.project.pk).total_acts, 2)

    def test_prose_save_bumps_rev_and_touches_only_that_scene(self):
        # A title is passed so no (paid) auto-title runs; auto_analyze off for the same reason.
        self._run("save_scene_content", {"scene_id": "sc-2", "text": "Second",
                                         "content": _doc("first words"), "auto_analyze": False})
        other = SceneContent.objects.get(scene__uid="sc-1")
        row = SceneContent.objects.get(scene__uid="sc-2")
        self.assertEqual(row.rev, 1)
        with CaptureQueriesContext(connection) as q:
            self._run("save_scene_content", {"scene_id": "sc-2", "text": "Second",
                                             "content": _doc("more words here"),
                                             "auto_analyze": False})
        writes = _writes(q.captured_queries, "outline_scenecontent")
        self.assertEqual(len(writes), 1)
        self.assertIn(str(row.pk), writes[0])
        row.refresh_from_db()
        self.assertEqual((row.rev, row.doc), (2, _doc("more words here")))
        self.assertEqual(SceneContent.objects.get(pk=other.pk).rev, other.rev)
        self.assertEqual(Project.objects.get(pk=self.project.pk).total_word_count, 2 + 3)

    def test_same_prose_again_does_not_bump_rev(self):
        before = SceneContent.objects.get(scene__uid="sc-1").rev
        self._run("save_scene_content", {"scene_id": "sc-1", "content": _doc("Hello there"),
                                         "auto_analyze": False})
        self.assertEqual(SceneContent.objects.get(scene__uid="sc-1").rev, before)

    def test_ai_paragraph_insert_bumps_rev(self):
        before = SceneContent.objects.get(scene__uid="sc-1").rev
        self._run("insert_scene_paragraphs", {"scene_id": "sc-1", "paragraphs": ["AI line."]})
        row = SceneContent.objects.get(scene__uid="sc-1")
        self.assertEqual(row.rev, before + 1)
        self.assertEqual(len(row.doc["content"]), 2)
        self.assertEqual(SceneRevision.objects.filter(scene__uid="sc-1").count(), 1)

    def test_deleting_a_scene_deletes_its_history(self):
        record_scene_revision(self.project.pk, "sc-1", _doc("old"), _doc("Hello there"))
        self.assertEqual(SceneRevision.objects.count(), 1)
        self._run("delete_outline_item", {"item_type": "scene", "item_id": "sc-1"})
        self.assertEqual(SceneRevision.objects.count(), 0)

    def test_deleting_a_thread_unlinks_beats_but_keeps_text(self):
        oc.commit_delete_plot_thread(self.sess, {"thread_id": "ro-1"})
        b = OutlineBeat.objects.get(uid="bt-1")
        self.assertEqual((b.thread_id, b.thread_beat_id, b.text), (None, None, "She finds the key"))
        beat = load_outline(self.ctx)["acts"][0]["chapters"][0]["scenes"][0]["beats"][0]
        self.assertNotIn("from_rough", beat)
        self.assertNotIn("from_item", beat)

    def test_deleting_a_thread_beat_unlinks_only_from_item(self):
        oc.commit_delete_thread_beat(self.sess, {"thread_id": "ro-1", "beat_id": "ri-1"})
        beat = load_outline(self.ctx)["acts"][0]["chapters"][0]["scenes"][0]["beats"][0]
        self.assertEqual(beat.get("from_rough"), "ro-1")
        self.assertNotIn("from_item", beat)
