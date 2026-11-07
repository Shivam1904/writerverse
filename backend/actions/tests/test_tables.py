"""Characters → Character table and braindumps → Braindump table (the blob→table flips).

DB-backed (TestCase). Covers the readers that read these tables.
"""

from braindumps import readers as braindump_readers
from braindumps.models import Braindump
from characters import readers as character_readers
from characters.models import Character
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from rest_framework.test import APIClient

from actions.capabilities.spec import DispatchContext, ProjectScope

User = get_user_model()


class CharactersTableTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="c@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        self.ctx = DispatchContext(project_id=self.project.id)

    def test_get_characters_reads_table_with_enriched_fields(self):
        Character.objects.create(
            project=self.project, name="Light", type="protagonist", description="d",
            want="w", need="n", misbelief="m", story="s")
        out = character_readers.get_characters(self.ctx)
        row = next(r for r in out["characters"] if r["name"] == "Light")
        self.assertEqual(row["want"], "w")
        self.assertEqual(row["misbelief"], "m")
        self.assertEqual(row["story"], "s")


class BraindumpsBraindumpTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="i@e.com", password="x")
        self.project = Project.objects.create(title="P2", user=self.user)
        self.sess = ProjectScope(self.project.id)
        self.ctx = DispatchContext(project_id=self.project.id)

    def test_lab_braindumps_read_braindump(self):
        Braindump.objects.create(project=self.project, title="one", content="one", order=0)
        Braindump.objects.create(project=self.project, title="two", content="two", order=1)
        self.assertEqual([t["text"] for t in braindump_readers.lab_braindumps(self.project.id)],
                         ["one", "two"])

    def test_get_braindumps_hides_ai_data_from_chat(self):
        """The chat model only needs content + the merged `tags` projection.
        The full `ai_data` annotation blob (phrase/pack breakdown) is internal —
        Night Eyes was pasting it verbatim into replies — so the CHAT read drops
        it. The Braindumps page (USER_BUTTON) still needs it for PackBreakdown."""
        from actions.capabilities.spec import Actor

        ai_data = {
            "status": "ok",
            "phrases": [
                {"text": "Genius billionaire", "pack_id": "pack_1",
                 "entities": ["Tony Stark"], "tags": ["character", "backstory"]},
            ],
            "entities": ["Tony Stark"],
            "tags": ["character", "backstory"],
        }
        Braindump.objects.create(
            project=self.project, title="t", content="Tony Stark stuff",
            tags=["character", "backstory", "Tony Stark"], ai_data=ai_data,
        )

        chat_ctx = DispatchContext(
            project_id=self.project.id, actor=Actor.CHAT,
        )
        page_ctx = DispatchContext(
            project_id=self.project.id,
            actor=Actor.USER_BUTTON,
        )

        chat_row = braindump_readers.get_braindumps(chat_ctx)["braindumps"][0]
        page_row = braindump_readers.get_braindumps(page_ctx)["braindumps"][0]

        # Chat never sees the raw annotation blob — it can't echo what it lacks.
        self.assertNotIn("ai_data", chat_row)
        # But the human-meaningful projection (tags) still reaches the model.
        self.assertEqual(chat_row["tags"], ["character", "backstory", "Tony Stark"])
        # The page keeps the full payload for its tag UI / PackBreakdown.
        self.assertEqual(page_row["ai_data"]["phrases"][0]["pack_id"], "pack_1")

    def test_update_braindump_is_denied_to_chat(self):
        """Caps refactor (2026-07-03): update_braindump was dropped from the chat
        surface — the AI can add braindumps but not edit them. Chat dispatch is
        DENIED; the page (USER_BUTTON) still works and gets the full `ai_data`."""
        from actions.capabilities import Actor, dispatch

        bd = Braindump.objects.create(
            project=self.project, title="t", content="orig",
            tags=["character"], ai_data={"status": "ok", "phrases": [{"pack_id": "pack_1"}]},
        )

        chat_res = dispatch(
            "update_braindump", {"id": bd.id, "body": "edited via chat"},
            Actor.CHAT, self.sess,
        )
        page_res = dispatch(
            "update_braindump", {"id": bd.id, "body": "edited via page"},
            Actor.USER_BUTTON, self.sess,
        )

        self.assertEqual(chat_res.status, "denied")
        self.assertEqual(page_res.status, "ran")
        self.assertIn("ai_data", page_res.result["braindump"])


class FacadeTests(TestCase):
    """Tier 2 — the declarative semantic-resource facade over dispatch().
    Verifies the wire conventions: ran→200+X-Invalidates, proposed→202."""

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(email="fac@e.com", password="x")
        self.project = Project.objects.create(title="Facade", user=self.user)
        self.char = Character.objects.create(
            project=self.project, name="Light", description="d")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.base = f"/api/consistency/projects/{self.project.id}/characters/"

    def test_get_lists_characters(self):
        resp = self.client.get(self.base)
        self.assertEqual(resp.status_code, 200)

    def test_patch_runs_and_sets_invalidates_header(self):
        resp = self.client.patch(
            f"{self.base}{self.char.id}/",
            {"description": "rewritten"}, format="json")
        self.assertEqual(resp.status_code, 200)
        # ran → mutated domains in the X-Invalidates header.
        self.assertIn("characters", resp.headers.get("X-Invalidates", ""))
        self.char.refresh_from_db()
        self.assertEqual(self.char.description, "rewritten")

    def test_unmapped_method_405(self):
        # PATCH on the collection has no mapping → 405.
        resp = self.client.patch(self.base, {}, format="json")
        self.assertEqual(resp.status_code, 405)

    def test_generic_op_route_read(self):
        url = f"/api/consistency/projects/{self.project.id}/op/get_characters/"
        resp = self.client.post(url, {}, format="json")
        self.assertEqual(resp.status_code, 200)

    def test_generic_op_route_write_sets_invalidates(self):
        url = f"/api/consistency/projects/{self.project.id}/op/update_character/"
        resp = self.client.post(
            url, {"id": self.char.id, "description": "via op"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("characters", resp.headers.get("X-Invalidates", ""))
        self.char.refresh_from_db()
        self.assertEqual(self.char.description, "via op")
