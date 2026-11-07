"""Merge-into-grand proposals — `run_merge_rough_into_grand` FANS OUT into one
`outline_beat_insert` proposal per placed beat (mirroring thread beat_inserts).
`get_grand_outline` read-merges each pending insert as a ghost beat in the SAME
triad `get_thread` returns; accept inserts it into its scene; update_proposed
edits the pending value; reject drops it.

The AI placement step (the LLM call inside the engine) is deliberately NOT
exercised here — only the propose/read/accept/edit/reject plumbing this feature
owns. We seed the per-beat proposal rows directly (production fans them out from
the LLM placements via `_preview_merge`, covered by its own pure-function test).
"""
from types import SimpleNamespace
from unittest.mock import patch

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from actions.models import Proposal
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

from outline.capabilities.register.outline import _preview_merge
from outline.store import save_outline, save_threads

User = get_user_model()

GRAND = {
    "base_template": "three_act",
    "acts": [{"id": "ac-1", "text": "Act I", "chapters": [
        {"id": "ch-1", "text": "Chapter 1", "scenes": [
            {"id": "sc-1", "text": "Opening", "beats": [
                {"id": "bt-1", "kind": "text", "text": "She arrives"},
            ]},
        ]},
    ]}],
}


class PreviewMergeFanOutTests(TestCase):
    """`_preview_merge` turns LLM placements into one proposal unit per beat."""

    def test_fans_one_proposal_per_placement_dropping_blanks(self):
        result = {"rough_id": "ro-9", "placements": [
            {"item_id": "ri-1", "scene_id": "sc-1", "kind": "text", "beat_text": "She hesitates"},
            {"item_id": "ri-2", "scene_id": "sc-1", "kind": "placeholder", "beat_text": "  "},
            {"item_id": "ri-3", "scene_id": "sc-2", "kind": "text", "beat_text": "He follows"},
        ]}
        units = _preview_merge(result)
        self.assertEqual(len(units), 2)  # the blank beat is dropped
        pv = units[0]["preview"]
        self.assertEqual(pv["type"], "outline_beat_insert")
        self.assertEqual(pv["scene_id"], "sc-1")
        self.assertEqual(pv["fields"], {
            "text": "She hesitates", "kind": "text",
            "from_rough": "ro-9", "from_item": "ri-1",
        })


class OutlineMergeProposalTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="merge@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        ctx = SimpleNamespace(project_id=self.project.pk)
        # The thread the beats are placed from must exist: outline beats link to
        # it for real (phase 4b), so a link to a missing thread isn't stored.
        save_threads(ctx, [{"id": "ro-9", "title": "Arc", "items": [
            {"id": "ri-1", "kind": "text", "text": "She hesitates"}]}])
        save_outline(ctx, GRAND)
        self.session = ProjectScope(self.project.id)

    def _run(self, cap, args, actor=Actor.USER_BUTTON):
        return dispatch(cap, args, actor, self.session)

    def _scene_beats(self):
        go = self._run("get_grand_outline", {}).result["grand_outline"]
        return go["acts"][0]["chapters"][0]["scenes"][0]["beats"]

    def _propose(self, text="She hesitates", kind="text", scene_id="sc-1"):
        preview = {"type": "outline_beat_insert", "scene_id": scene_id, "index": -1,
                   "fields": {"text": text, "kind": kind, "from_rough": "ro-9", "from_item": "ri-1"}}
        return Proposal.objects.create(
            project=self.project,
            source="button",
            capability="run_merge_rough_into_grand",
            args={"rough_id": "ro-9"},
            proposal={"capability": "run_merge_rough_into_grand",
                      "args": {"rough_id": "ro-9"}, "preview": preview},
        )

    # --- read-merge (ghost in the canonical triad) -------------------------
    def test_read_merges_ghost_in_triad(self):
        p = self._propose()
        beats = self._scene_beats()
        self.assertEqual(len(beats), 2)  # original + ghost
        ghost = beats[-1]
        self.assertTrue(ghost["insert"])
        self.assertIsNone(ghost["id"])
        self.assertEqual(ghost["actual_value"], "")
        self.assertEqual(ghost["proposal"], p.id)
        self.assertEqual(ghost["proposed_value"], "She hesitates")
        self.assertEqual(ghost["proposed_kind"], "text")
        self.assertEqual(ghost["from_rough"], "ro-9")
        self.assertEqual(ghost["from_item"], "ri-1")
        # the committed beat is untouched (no triad noise)
        self.assertNotIn("proposal", beats[0])

    # --- accept (insert the real beat, consume the proposal) ---------------
    def test_accept_inserts_real_beat(self):
        p = self._propose()
        self._run("accept_proposal", {"proposal_id": str(p.id)})
        beats = self._scene_beats()
        self.assertEqual(len(beats), 2)
        nb = beats[-1]
        self.assertNotIn("insert", nb)
        self.assertNotIn("proposal", nb)
        self.assertEqual(nb["text"], "She hesitates")
        self.assertEqual(nb["kind"], "text")
        self.assertEqual(nb["from_rough"], "ro-9")
        self.assertEqual(nb["from_item"], "ri-1")
        p.refresh_from_db()
        self.assertEqual(p.status, Proposal.STATUS_APPLIED)

    # --- update_proposed (edit-before-accept, outline untouched) -----------
    def test_update_proposed_edits_pending_value_only(self):
        p = self._propose()
        self._run("update_proposed_outline_beat", {"proposal_id": str(p.id), "text": "She freezes"})
        p.refresh_from_db()
        self.assertEqual(p.proposal["preview"]["fields"]["text"], "She freezes")
        # still pending: outline shows the ghost with the EDITED proposed value
        beats = self._scene_beats()
        self.assertEqual(len(beats), 2)
        self.assertEqual(beats[-1]["proposed_value"], "She freezes")
        self.assertEqual(beats[-1]["actual_value"], "")  # not applied yet

    # --- update_proposed can change the proposed KIND (Tab on the green field) -
    def test_update_proposed_changes_kind(self):
        p = self._propose(kind="text")
        self._run("update_proposed_outline_beat", {"proposal_id": str(p.id), "kind": "heading"})
        p.refresh_from_db()
        self.assertEqual(p.proposal["preview"]["fields"]["kind"], "heading")
        ghost = self._scene_beats()[-1]
        self.assertEqual(ghost["proposed_kind"], "heading")
        self.assertEqual(ghost["kind"], "heading")
        # and accept carries the edited kind onto the real beat
        self._run("accept_proposal", {"proposal_id": str(p.id)})
        self.assertEqual(self._scene_beats()[-1]["kind"], "heading")

    # --- reject (drop the ghost, outline untouched) ------------------------
    def test_reject_drops_ghost(self):
        p = self._propose()
        self._run("reject_proposal", {"proposal_id": str(p.id)})
        self.assertEqual(len(self._scene_beats()), 1)  # ghost gone, original remains


class RerunMergeSkipsPlacedBeatsTests(TestCase):
    """wrt-47: re-running merge never re-proposes a thread beat that is already
    in the outline (a scene beat carries its id as `from_item`)."""

    def setUp(self):
        self.user = User.objects.create_user(email="rerun@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        self.ctx = SimpleNamespace(project_id=self.project.pk)
        save_threads(self.ctx, [{"id": "ro-9", "title": "Arc", "items": [
            {"id": "ri-1", "kind": "text", "text": "She hesitates"},
            {"id": "ri-2", "kind": "text", "text": "He follows"}]}])
        self.session = ProjectScope(self.project.id)

    def _seed(self, placed_ids):
        beats = [{"id": "bt-1", "kind": "text", "text": "She arrives"}]
        beats += [{"id": f"bt-{i}", "kind": "text", "text": f"placed {i}",
                   "from_rough": "ro-9", "from_item": i} for i in placed_ids]
        grand = {"base_template": "three_act", "acts": [{"id": "ac-1", "text": "Act I",
                 "chapters": [{"id": "ch-1", "text": "Chapter 1", "scenes": [
                     {"id": "sc-1", "text": "Opening", "beats": beats}]}]}]}
        save_outline(self.ctx, grand)

    def _merge(self):
        return dispatch("run_merge_rough_into_grand", {"thread_id": "ro-9"},
                        Actor.USER_BUTTON, self.session)

    @patch("outline.engine.generation.llm_utils.ask_json")
    def test_all_placed_gives_zero_suggestions_and_no_ai_call(self, ask):
        self._seed(["ri-1", "ri-2"])
        res = self._merge()
        self.assertEqual(res.status, "proposed", res.error)
        self.assertEqual(res.proposals, [])
        ask.assert_not_called()
        self.assertFalse(Proposal.objects.filter(project=self.project).exists())

    @patch("outline.engine.generation.llm_utils.ask_json")
    def test_only_unplaced_beats_are_sent_and_proposed(self, ask):
        self._seed(["ri-1"])
        # the model (wrongly) answers for both; only the unplaced one survives
        ask.return_value = {"placements": [
            {"item_id": "ri-1", "scene_id": "sc-1", "kind": "text", "beat_text": "dup"},
            {"item_id": "ri-2", "scene_id": "sc-1", "kind": "text", "beat_text": "He follows"},
        ]}
        res = self._merge()
        self.assertEqual(res.status, "proposed", res.error)
        prompt = ask.call_args.args[0]
        self.assertIn("ri-2", prompt)
        self.assertNotIn("ri-1", prompt)
        self.assertEqual([p["proposal"]["preview"]["fields"]["from_item"]
                          for p in res.proposals], ["ri-2"])
