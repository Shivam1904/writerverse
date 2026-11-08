"""annotate_braindump capability — end-to-end dispatch (DB, stubbed LLM).

Verifies the gather→execute→commit wiring writes `ai_data` and mirrors the
tag + entity union onto `Braindump.tags`. The LLM call (`_ask_json`) is stubbed.
"""
from unittest.mock import patch

from actions.capabilities import Actor, dispatch
from actions.capabilities.dispatch import run_followups
from actions.capabilities.spec import ProjectScope
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

from braindumps.models import Braindump

User = get_user_model()


class AnnotateBraindumpDispatchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="t@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        self.bd = Braindump.objects.create(
            project=self.project,
            title="John lit the fire",
            content="John finally admitted he started the fire. Sarah slapped him.",
            tags=["mine"],  # an author tag that must survive the merge
        )

    def test_annotation_writes_ai_data_and_mirrors_tags(self):
        resp = [
            {"text": "John finally admitted he started the fire", "pack_id": "pack_1",
             "entities": [{"kind": "char", "name": "John"}], "tags": ["confrontation", "turning_point"]},
            {"text": "Sarah slapped him", "pack_id": "pack_1",
             "entities": [{"kind": "char", "name": "Sarah"}], "tags": ["event", "emotion"]},
        ]
        with patch("ai_engine.llm_utils.ask_json", return_value=resp):
            res = dispatch("annotate_braindump", {"id": self.bd.id},
                           Actor.USER_BUTTON, ProjectScope(self.project.id))

        self.assertEqual(res.status, "ran")

        self.bd.refresh_from_db()
        ai = self.bd.ai_data
        self.assertEqual(ai["status"], "ok")
        self.assertEqual(len(ai["phrases"]), 2)
        # v2: entities are rolled-up {kind,name,tags} dicts
        self.assertEqual({e["name"] for e in ai["entities"]}, {"John", "Sarah"})

        # tags = author tag + craft tags + TYPED entity tags (deduped, author first)
        self.assertEqual(self.bd.tags[0], "mine")
        for t in ("confrontation", "turning_point", "event", "emotion", "char[John]", "char[Sarah]"):
            self.assertIn(t, self.bd.tags)

    def test_known_real_character_canonicalises_extracted_entity(self):
        from characters.models import Character
        Character.objects.create(project=self.project, name="Tony Stark")
        resp = [{"text": "tony builds a suit", "pack_id": "pack_1",
                 "entities": [{"kind": "char", "name": "tony stark"}], "tags": ["backstory"]}]
        with patch("ai_engine.llm_utils.ask_json", return_value=resp):
            dispatch("annotate_braindump", {"id": self.bd.id},
                     Actor.USER_BUTTON, ProjectScope(self.project.id))
        self.bd.refresh_from_db()
        # the lowercase variant collapses to the real character's canonical name
        names = [e["name"] for e in self.bd.ai_data["entities"]]
        self.assertIn("Tony Stark", names)
        self.assertNotIn("tony stark", names)
        self.assertIn("char[Tony Stark]", self.bd.tags)  # mirrored canonical, typed

    def test_add_braindump_queues_and_runs_annotate_followup(self):
        # The universal path any source (chat / button / cron) takes: add queues
        # annotation as a follow-up; run_followups (facade or chat) executes it.
        resp = [{"text": "a fresh idea", "pack_id": "pack_1",
                 "entities": [], "tags": ["idea"]}]
        sess = ProjectScope(self.project.id)
        with patch("ai_engine.llm_utils.ask_json", return_value=resp):
            res = dispatch("add_braindump", {"body": "a fresh idea"},
                           Actor.USER_BUTTON, sess)
            self.assertTrue(
                any(f.get("capability") == "annotate_braindump" for f in (res.followups or [])),
                "add_braindump should queue an annotate follow-up by default",
            )
            run_followups(res, sess)
        bid = res.result["braindump"]["id"]
        b = Braindump.objects.get(id=bid)
        self.assertEqual(b.ai_data.get("status"), "ok")
        self.assertIn("idea", b.tags)

    def test_add_braindump_none_auto_annotate_still_queues_followup(self):
        # The chat tool's pydantic schema passes auto_annotate=None when the LLM
        # doesn't set it — that must NOT disable annotation. Only an explicit
        # False (the page's self-fire opt-out) skips the follow-up.
        res = dispatch("add_braindump", {"body": "from chat", "auto_annotate": None},
                       Actor.CHAT, ProjectScope(self.project.id))
        self.assertTrue(
            any(f.get("capability") == "annotate_braindump" for f in (res.followups or [])),
            "auto_annotate=None must still queue annotation (regression: chat adds)",
        )

    def test_add_braindump_auto_annotate_false_skips_followup(self):
        # The page opts out (it self-fires annotation).
        res = dispatch("add_braindump", {"body": "no auto", "auto_annotate": False},
                       Actor.USER_BUTTON, ProjectScope(self.project.id))
        self.assertFalse(res.followups)

    def test_ai_add_is_flagged_and_never_starred(self):
        # Night Eyes (Actor.CHAT) adds are stamped ai_generated but never pinned —
        # even if the LLM passes pinned=true. The author owns the star/highlight.
        res = dispatch(
            "add_braindump",
            {"body": "an AI thought", "pinned": True, "auto_annotate": False},
            Actor.CHAT, ProjectScope(self.project.id),
        )
        b = Braindump.objects.get(id=res.result["braindump"]["id"])
        self.assertTrue(b.ai_generated)
        self.assertFalse(b.pinned)  # must stay un-starred

    def test_author_add_keeps_star_and_is_not_ai_flagged(self):
        # The author's own page add (USER_BUTTON) is never AI-flagged, and an
        # explicit pin is honoured.
        res = dispatch(
            "add_braindump",
            {"body": "my own pinned note", "pinned": True, "auto_annotate": False},
            Actor.USER_BUTTON, ProjectScope(self.project.id),
        )
        b = Braindump.objects.get(id=res.result["braindump"]["id"])
        self.assertFalse(b.ai_generated)
        self.assertTrue(b.pinned)

    def test_failed_annotation_persists_status_without_touching_tags(self):
        with patch("ai_engine.llm_utils.ask_json", side_effect=RuntimeError("boom")):
            res = dispatch("annotate_braindump", {"id": self.bd.id},
                           Actor.USER_BUTTON, ProjectScope(self.project.id))

        self.assertEqual(res.status, "ran")
        self.bd.refresh_from_db()
        self.assertEqual(self.bd.ai_data["status"], "failed")
        self.assertEqual(self.bd.tags, ["mine"])  # untouched on failure

    def test_failed_rerun_keeps_previous_good_annotation(self):
        good = {"status": "ok", "phrases": [{"text": "x"}], "entities": [], "tags": []}
        self.bd.ai_data = good
        self.bd.save(update_fields=["ai_data"])
        with patch("ai_engine.llm_utils.ask_json", side_effect=RuntimeError("boom")), \
                self.assertLogs("writerverse.consistency", level="WARNING") as logs:
            dispatch("annotate_braindump", {"id": self.bd.id},
                     Actor.USER_BUTTON, ProjectScope(self.project.id))
        self.bd.refresh_from_db()
        self.assertEqual(self.bd.ai_data, good)
        self.assertTrue(any("keeping previous ai_data" in m for m in logs.output))

    def test_retag_after_edit_replaces_old_ai_tags_and_keeps_author_tags(self):
        # wrt-28: tag "Tony fights Steve", edit it to "Nat fights Steve", Re-tag.
        # The old AI tags (char[Tony], confrontation) must go; the author's own tag stays.
        sess = ProjectScope(self.project.id)
        self.bd.content = "Tony fights Steve"
        self.bd.save(update_fields=["content"])
        first = [{"text": "Tony fights Steve", "pack_id": "pack_1",
                  "entities": [{"kind": "char", "name": "Tony"}, {"kind": "char", "name": "Steve"}],
                  "tags": ["confrontation"]}]
        with patch("ai_engine.llm_utils.ask_json", return_value=first):
            dispatch("annotate_braindump", {"id": self.bd.id}, Actor.USER_BUTTON, sess)
        self.bd.refresh_from_db()
        self.assertIn("char[Tony]", self.bd.tags)
        self.assertEqual(self.bd.ai_data["meta"]["source_text"], "Tony fights Steve")

        # The edit alone changes no tags (and runs no AI).
        dispatch("update_braindump", {"id": self.bd.id, "body": "Nat fights Steve"},
                 Actor.USER_BUTTON, sess)
        self.bd.refresh_from_db()
        self.assertIn("char[Tony]", self.bd.tags)

        second = [{"text": "Nat fights Steve", "pack_id": "pack_1",
                   "entities": [{"kind": "char", "name": "Nat"}, {"kind": "char", "name": "Steve"}],
                   "tags": ["conflict_external"]}]
        with patch("ai_engine.llm_utils.ask_json", return_value=second):
            dispatch("annotate_braindump", {"id": self.bd.id}, Actor.USER_BUTTON, sess)
        self.bd.refresh_from_db()
        self.assertEqual(self.bd.tags, ["mine", "conflict_external", "char[Nat]", "char[Steve]"])
        self.assertEqual({e["name"] for e in self.bd.ai_data["entities"]}, {"Nat", "Steve"})
        self.assertEqual(self.bd.ai_data["meta"]["source_text"], "Nat fights Steve")
