from types import SimpleNamespace

from outline.store import save_threads

"""Beat proposals — Night Eyes proposes beat inserts/edits; the author reviews
green and accepts. Mirrors the world-block per-entity pattern (thread = block,
beat = entity). `get_thread` read-time-merges pending beat proposals into the SAME
{actual_value, proposal, proposed_value} triad get_character_full uses: a beat_edit
adds `proposal` (id) + `proposed_value`/`proposed_kind`; a beat_insert splices a
ghost in carrying its own proposal.
"""
from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from actions.models import Proposal
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

User = get_user_model()

THREADS = [
    {"id": "ro-1", "title": "Mira's doubt",
     "scope": {"type": "character", "name": "Mira"},
     "items": [
         {"id": "ri-1", "kind": "text", "text": "She doubts herself"},
         {"id": "ri-2", "kind": "placeholder", "text": ""},
     ]},
]


class BeatProposalTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="beat@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        save_threads(SimpleNamespace(project_id=self.project.id), THREADS)
        self.session = ProjectScope(self.project.id)

    def _run(self, cap, args, actor=Actor.USER_BUTTON):
        return dispatch(cap, args, actor, self.session)

    def _beats(self):
        return self._run("get_thread", {"thread_id": "ro-1"}).result["beats"]

    # --- propose update (edit an existing beat) ----------------------------
    def test_propose_update_wraps_in_get_thread(self):
        res = self._run("propose_update_beat",
                        {"thread_id": "ro-1", "beat_id": "ri-1", "text": "She is sure"},
                        Actor.CHAT)
        self.assertEqual(res.status, "proposed")
        pv = res.proposals[0]["proposal"]["preview"]
        self.assertEqual(pv["type"], "beat_edit")
        self.assertEqual(pv["beat_id"], "ri-1")
        self.assertEqual(pv["fields"], {"text": "She is sure"})

        b0 = self._beats()[0]
        self.assertEqual(b0["actual_value"], "She doubts herself")  # actual unchanged
        self.assertEqual(b0["proposal"], res.proposals[0]["proposal_id"])
        self.assertEqual(b0["proposed_value"], "She is sure")

    def test_accept_update_applies_and_unwraps(self):
        res = self._run("propose_update_beat",
                        {"thread_id": "ro-1", "beat_id": "ri-1", "text": "She is sure"},
                        Actor.CHAT)
        pid = res.proposals[0]["proposal_id"]
        acc = self._run("accept_proposal", {"proposal_id": str(pid)})
        self.assertEqual(acc.status, "ran")
        self.assertEqual(Proposal.objects.get(id=pid).status, Proposal.STATUS_APPLIED)
        b0 = self._beats()[0]
        self.assertEqual(b0["actual_value"], "She is sure")     # applied
        self.assertNotIn("proposal", b0)                # no longer pending
        self.assertNotIn("proposed_value", b0)

    # --- edit-before-accept ------------------------------------------------
    def test_update_proposed_then_accept_uses_edited(self):
        res = self._run("propose_update_beat",
                        {"thread_id": "ro-1", "beat_id": "ri-1", "text": "ai version"},
                        Actor.CHAT)
        pid = res.proposals[0]["proposal_id"]
        self._run("update_proposed_beat", {"proposal_id": str(pid), "text": "my edit"})
        self.assertEqual(self._beats()[0]["proposed_value"], "my edit")
        self.assertEqual(self._beats()[0]["actual_value"], "She doubts herself")  # actual untouched
        self._run("accept_proposal", {"proposal_id": str(pid)})
        self.assertEqual(self._beats()[0]["actual_value"], "my edit")

    # --- propose insert (new ghost beat) -----------------------------------
    def test_propose_insert_ghosts_then_accept_creates(self):
        res = self._run("propose_insert_beat",
                        {"thread_id": "ro-1", "after_beat_id": "ri-1",
                         "text": "A new beat", "kind": "text"},
                        Actor.CHAT)
        self.assertEqual(res.status, "proposed")
        pid = res.proposals[0]["proposal_id"]
        self.assertEqual(res.proposals[0]["proposal"]["preview"]["type"], "beat_insert")

        beats = self._beats()
        self.assertEqual(len(beats), 3)             # ghost spliced in at index 1
        self.assertTrue(beats[1]["insert"])
        self.assertIsNone(beats[1]["id"])
        self.assertEqual(beats[1]["proposed_value"], "A new beat")

        self._run("accept_proposal", {"proposal_id": str(pid)})
        beats = self._beats()
        self.assertEqual(len(beats), 3)             # ghost → real
        self.assertEqual(beats[1]["actual_value"], "A new beat")
        self.assertNotIn("insert", beats[1])
        self.assertIsNotNone(beats[1]["id"])

    # --- reject drops it ---------------------------------------------------
    def test_reject_drops_proposal(self):
        res = self._run("propose_update_beat",
                        {"thread_id": "ro-1", "beat_id": "ri-1", "text": "nope"},
                        Actor.CHAT)
        pid = res.proposals[0]["proposal_id"]
        self._run("reject_proposal", {"proposal_id": str(pid)})
        self.assertEqual(Proposal.objects.get(id=pid).status, Proposal.STATUS_REJECTED)
        self.assertNotIn("proposal", self._beats()[0])

    # --- accept silences the rest (same beat) ------------------------------
    def test_accept_supersedes_other_edits_for_same_beat(self):
        """Two pending edits for the SAME beat → accepting one rejects the other
        so it can't resurface (get_thread shows only the latest per beat)."""
        r1 = self._run("propose_update_beat",
                       {"thread_id": "ro-1", "beat_id": "ri-1", "text": "first take"},
                       Actor.CHAT)
        r2 = self._run("propose_update_beat",
                       {"thread_id": "ro-1", "beat_id": "ri-1", "text": "second take"},
                       Actor.CHAT)
        pid1, pid2 = r1.proposals[0]["proposal_id"], r2.proposals[0]["proposal_id"]
        self.assertEqual(self._beats()[0]["proposal"], pid2)  # latest displayed

        self._run("accept_proposal", {"proposal_id": str(pid2)})

        self.assertEqual(Proposal.objects.get(id=pid2).status, Proposal.STATUS_APPLIED)
        self.assertEqual(Proposal.objects.get(id=pid1).status, Proposal.STATUS_REJECTED)
        b0 = self._beats()[0]
        self.assertEqual(b0["actual_value"], "second take")
        self.assertNotIn("proposal", b0)  # nothing resurfaces

    def test_accept_does_not_supersede_a_different_beat(self):
        """Edits to a DIFFERENT beat are independent — accepting one leaves the
        other pending."""
        r1 = self._run("propose_update_beat",
                       {"thread_id": "ro-1", "beat_id": "ri-1", "text": "edit A"},
                       Actor.CHAT)
        r2 = self._run("propose_update_beat",
                       {"thread_id": "ro-1", "beat_id": "ri-2", "text": "edit B"},
                       Actor.CHAT)
        pid1, pid2 = r1.proposals[0]["proposal_id"], r2.proposals[0]["proposal_id"]
        self._run("accept_proposal", {"proposal_id": str(pid1)})
        self.assertEqual(Proposal.objects.get(id=pid2).status, Proposal.STATUS_PROPOSED)
        self.assertEqual(self._beats()[1]["proposal"], pid2)

    def test_accept_insert_does_not_supersede_other_inserts(self):
        """Inserts are additive (a new beat each), not competing for one slot —
        accepting one must NOT drop another pending insert."""
        r1 = self._run("propose_insert_beat",
                       {"thread_id": "ro-1", "after_beat_id": "ri-1", "text": "beat A"},
                       Actor.CHAT)
        r2 = self._run("propose_insert_beat",
                       {"thread_id": "ro-1", "after_beat_id": "ri-1", "text": "beat B"},
                       Actor.CHAT)
        pid1, pid2 = r1.proposals[0]["proposal_id"], r2.proposals[0]["proposal_id"]
        self._run("accept_proposal", {"proposal_id": str(pid1)})
        self.assertEqual(Proposal.objects.get(id=pid2).status, Proposal.STATUS_PROPOSED)

    # --- author lazy-create cycle (the freshly-added-beat save bug) --------
    def test_add_then_update_beat_persists(self):
        """Add a beat, then update it by the id the add returned — the update must
        find the just-created beat and persist. Locks the add→edit save cycle that
        was 404-ing on the threads page (edits to a freshly-added beat lost)."""
        add = self._run("add_thread_beat", {"thread_id": "ro-1", "text": "fresh beat"})
        self.assertEqual(add.status, "ran")
        new_id = add.result["beat"]["id"]

        upd = self._run("update_thread_beat",
                        {"thread_id": "ro-1", "beat_id": new_id, "text": "edited fresh beat"})
        self.assertEqual(upd.status, "ran")  # NOT denied / not 404

        texts = [b["actual_value"] for b in self._beats()]
        self.assertIn("edited fresh beat", texts)
        self.assertNotIn("fresh beat", texts)  # replaced, not duplicated

    # --- the AI cannot direct-write beats anymore --------------------------
    def test_user_beat_caps_not_chat(self):
        self.assertEqual(self._run("add_thread_beat",
                         {"thread_id": "ro-1", "text": "x"},
                         Actor.CHAT).status, "denied")
        self.assertEqual(self._run("update_thread_beat",
                         {"thread_id": "ro-1", "beat_id": "ri-1", "text": "x"},
                         Actor.CHAT).status, "denied")
