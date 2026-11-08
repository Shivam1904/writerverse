"""promote_to_world_entity — two-tier "make real" for braindump world entities.

Mirrors promote_to_character: `promote_to_world_entity` is a direct WRITE that
create-or-gets the Worldbuilding row in its block NOW and queues a
`draft_world_entity` PROPOSE follow-up. The follow-up drafts a description (one LLM
call, stubbed) from everything the braindumps say about the entity and proposes it
as a content EDIT; accept (`_accept_draft_world_entity`) writes the content onto the
row by id. Mirrors the facade: dispatch the write, then `run_followups`.
"""
from unittest.mock import patch

from actions.capabilities import Actor, dispatch
from actions.capabilities.dispatch import run_followups
from actions.capabilities.spec import ProjectScope
from braindumps.models import Braindump
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

from worldbuilding.models import Worldbuilding

User = get_user_model()

_DRAFT = {"content": "A black ocean under a dead sky, where ships go to be forgotten."}


class PromoteToWorldEntityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="w@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        Braindump.objects.create(
            project=self.project,
            title="The sea",
            content="The Sunless Sea is a black ocean under a dead sky.",
            ai_data={
                "version": 2, "status": "ok",
                "phrases": [
                    {"text": "The Sunless Sea is a black ocean under a dead sky",
                     "entities": [{"kind": "loc", "name": "The Sunless Sea"}],
                     "tags": ["setting", "atmosphere"]},
                ],
                "entities": [{"kind": "loc", "name": "The Sunless Sea"}],
            },
        )

    def _promote(self, session, name="The Sunless Sea", block="locations", kind="loc"):
        return dispatch("promote_to_world_entity",
                        {"name": name, "block": block, "kind": kind},
                        Actor.USER_BUTTON, session)

    def test_promote_creates_row_and_queues_draft(self):
        """The WRITE creates the world entry NOW (no LLM) and queues the draft."""
        res = self._promote(ProjectScope(self.project.id))
        self.assertEqual(res.status, "ran")
        self.assertIn("worldbuilding", res.invalidates)
        # the entry exists immediately, empty, filed under the block
        wb = Worldbuilding.objects.get(project_id=self.project.id, title="The Sunless Sea")
        self.assertEqual(wb.content, "")
        self.assertIn("locations", wb.tags or [])
        # ...with the draft queued as a follow-up targeting the new id
        self.assertEqual(len(res.followups), 1)
        fu = res.followups[0]
        self.assertEqual(fu["capability"], "draft_world_entity")
        self.assertEqual(fu["args"]["worldbuilding_id"], wb.id)
        self.assertEqual(fu["args"]["kind"], "loc")

    def test_draft_followup_proposes_content_edit(self):
        """run_followups drafts (one LLM call) and proposes a content EDIT by id."""
        session = ProjectScope(self.project.id)
        res = self._promote(session)
        wid = Worldbuilding.objects.get(project_id=self.project.id, title="The Sunless Sea").id
        with patch("braindumps.capabilities.execute.run_draft_world_entity", return_value=_DRAFT) as m:
            res = run_followups(res, session)
        m.assert_called_once()
        # gather fed the entity's phrases (name, kind, phrases, ideas) to the LLM
        args = m.call_args[0]
        self.assertEqual(args[0], "The Sunless Sea")
        self.assertEqual(args[1], "loc")
        self.assertTrue(any("black ocean" in (p.get("text") or "") for p in args[2]))
        # exactly one world-entity-edit proposal carrying the id + drafted content
        self.assertEqual(len(res.proposals), 1)
        preview = res.proposals[0]["proposal"]["preview"]
        self.assertEqual(preview["type"], "world_entity_edit")
        self.assertEqual(preview["worldbuilding_id"], wid)
        self.assertEqual(preview["content"], _DRAFT["content"])

    def test_accept_writes_drafted_content(self):
        session = ProjectScope(self.project.id)
        res = self._promote(session)
        wid = Worldbuilding.objects.get(project_id=self.project.id, title="The Sunless Sea").id
        with patch("braindumps.capabilities.execute.run_draft_world_entity", return_value=_DRAFT):
            res = run_followups(res, session)
        pid = res.proposals[0]["proposal_id"]

        accepted = dispatch("_accept_draft_world_entity", {"proposal_id": str(pid)},
                            Actor.INTERNAL, session)
        self.assertEqual(accepted.status, "ran")
        self.assertIn("worldbuilding", accepted.invalidates)
        self.assertEqual(Worldbuilding.objects.get(id=wid).content, _DRAFT["content"])

    def test_promote_is_idempotent_for_existing_entry(self):
        """An already-real entity in the block reuses its row (no dupe)."""
        existing = Worldbuilding.objects.create(
            project=self.project, title="The Sunless Sea", tags=["locations"])
        res = self._promote(ProjectScope(self.project.id))
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.followups[0]["args"]["worldbuilding_id"], existing.id)
        self.assertEqual(
            Worldbuilding.objects.filter(project_id=self.project.id, title="The Sunless Sea").count(), 1)

    def test_promote_unknown_name_still_creates_but_no_proposal(self):
        """No braindumps mention the name → the row is still created; the draft
        follow-up finds no material and produces no proposal (no user-facing error)."""
        session = ProjectScope(self.project.id)
        res = self._promote(session, name="Nowhere At All")
        self.assertEqual(res.status, "ran")
        self.assertTrue(
            Worldbuilding.objects.filter(project_id=self.project.id, title="Nowhere At All").exists())
        with patch("braindumps.capabilities.execute.run_draft_world_entity", return_value=_DRAFT) as m:
            res = run_followups(res, session)
        m.assert_not_called()  # gather raised before the LLM
        self.assertEqual(len(res.proposals), 0)

    def test_edit_proposed_then_accept_writes_edited_value(self):
        """The author edits the green draft before accepting → the edited value is
        persisted into the proposal (still pending) and wins on accept."""
        from actions.models import Proposal
        session = ProjectScope(self.project.id)
        res = self._promote(session)
        wid = Worldbuilding.objects.get(project_id=self.project.id, title="The Sunless Sea").id
        with patch("braindumps.capabilities.execute.run_draft_world_entity", return_value=_DRAFT):
            res = run_followups(res, session)
        pid = res.proposals[0]["proposal_id"]

        dispatch("update_proposed_world_entity",
                 {"proposal_id": str(pid), "value": "My own edited description."},
                 Actor.USER_BUTTON, session)
        # persisted into the proposal, row still untouched
        self.assertEqual(
            Proposal.objects.get(id=pid).proposal["preview"]["content"], "My own edited description.")
        self.assertEqual(Worldbuilding.objects.get(id=wid).content, "")

        # accepting now lands the EDITED value, not the original draft
        dispatch("_accept_draft_world_entity", {"proposal_id": str(pid)}, Actor.INTERNAL, session)
        self.assertEqual(Worldbuilding.objects.get(id=wid).content, "My own edited description.")

    def test_promote_requires_name_and_block(self):
        self.assertEqual(self._promote(ProjectScope(self.project.id), name=" ").status, "error")
        self.assertEqual(self._promote(ProjectScope(self.project.id), block=" ").status, "error")


class WorldEntityDraftSupersedeTests(TestCase):
    """Accepting a world-entity description draft silences other pending drafts for
    the SAME entity — the World page keys drafts by worldbuilding_id (latest pending
    wins), so a stale older draft would resurface on the next read once this one is
    accepted. Runs the generic accept_proposal path under the project write lock."""

    def setUp(self):
        self.user = User.objects.create_user(email="wsup@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        self.session = ProjectScope(self.project.id)

    def _draft(self, wid, content):
        """A pending world_entity_edit (draft_world_entity) proposal for one row."""
        from actions.models import Proposal
        return Proposal.objects.create(
            project=self.project,
            capability="draft_world_entity",
            source=Proposal.SOURCE_BUTTON,
            page="World",
            args={"worldbuilding_id": wid},
            proposal={
                "capability": "draft_world_entity",
                "args": {"worldbuilding_id": wid},
                "preview": {"type": "world_entity_edit", "worldbuilding_id": wid,
                            "name": "X", "block": "locations", "content": content},
            },
        )

    def test_accept_supersedes_other_drafts_for_same_entity(self):
        from actions.models import Proposal
        wb = Worldbuilding.objects.create(
            project=self.project, title="The Sunless Sea", tags=["locations"])
        p_old = self._draft(wb.id, "first draft")
        p_new = self._draft(wb.id, "second draft")

        dispatch("accept_proposal", {"proposal_id": str(p_new.id)},
                 Actor.USER_BUTTON, self.session)

        self.assertEqual(Worldbuilding.objects.get(id=wb.id).content, "second draft")
        self.assertEqual(Proposal.objects.get(id=p_new.id).status, Proposal.STATUS_APPLIED)
        self.assertEqual(Proposal.objects.get(id=p_old.id).status, Proposal.STATUS_REJECTED)

    def test_accept_does_not_supersede_a_different_entity(self):
        from actions.models import Proposal
        a = Worldbuilding.objects.create(project=self.project, title="A", tags=["locations"])
        b = Worldbuilding.objects.create(project=self.project, title="B", tags=["locations"])
        pa = self._draft(a.id, "draft A")
        pb = self._draft(b.id, "draft B")

        dispatch("accept_proposal", {"proposal_id": str(pa.id)},
                 Actor.USER_BUTTON, self.session)

        self.assertEqual(Proposal.objects.get(id=pb.id).status, Proposal.STATUS_PROPOSED)
        self.assertEqual(Worldbuilding.objects.get(id=b.id).content, "")
