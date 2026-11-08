"""promote_to_character — two-tier create-then-enrich flow (DB, stubbed LLM).

`promote_to_character` is now a direct WRITE: it create-or-gets the Character row
NOW and queues an `enrich_promoted_character` PROPOSE follow-up. The follow-up drafts
description + arcs (one LLM call, stubbed) and proposes them as an EDIT to the row;
accept (`_accept_enrich_character`) fills the existing character's blank arc fields by
id. Mirrors the facade: dispatch the write, then `run_followups` for the proposal.
"""
from unittest.mock import patch

from actions.capabilities import Actor, dispatch
from actions.capabilities.dispatch import run_followups
from actions.capabilities.spec import ProjectScope
from braindumps.models import Braindump
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

User = get_user_model()

_DRAFT = {
    "character": {
        "name": "Tony Stark",
        "role": "protagonist",
        "description": "A genius weapons manufacturer.",
        "want": "Out of the cave alive.",
        "need": "To matter beyond his wealth.",
        "misbelief": "Money and brains make him untouchable.",
        "external_arc": "From arms dealer to reluctant protector.",
        "internal_arc": "Learns responsibility outruns ego.",
    },
}


class PromoteToCharacterTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="t@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        Braindump.objects.create(
            project=self.project,
            title="Tony lights the arc reactor",
            content="Tony Stark builds the suit in a cave. Pepper worries.",
            ai_data={
                "version": 2,
                "status": "ok",
                "phrases": [
                    {"text": "Tony Stark builds the suit in a cave", "pack_id": "pack_1",
                     "entities": [{"kind": "char", "name": "Tony Stark"}],
                     "tags": ["backstory", "turning_point"]},
                    {"text": "Pepper worries", "pack_id": "pack_1",
                     "entities": [{"kind": "char", "name": "Pepper Potts"}], "tags": ["emotion"]},
                ],
                "entities": [{"kind": "char", "name": "Tony Stark", "tags": ["backstory", "turning_point"]}],
            },
        )

    def test_promote_creates_character_and_queues_enrich(self):
        """The WRITE creates the cast row NOW (no LLM) and queues the enrichment."""
        from characters.models import Character

        res = dispatch("promote_to_character", {"name": "Tony Stark"},
                       Actor.USER_BUTTON, ProjectScope(self.project.id))
        self.assertEqual(res.status, "ran")
        self.assertIn("characters", res.invalidates)
        # the character exists immediately, before any draft ran
        c = Character.objects.get(project_id=self.project.id, name="Tony Stark")
        # ...with the enrichment queued as a follow-up targeting the new id
        self.assertEqual(len(res.followups), 1)
        fu = res.followups[0]
        self.assertEqual(fu["capability"], "enrich_promoted_character")
        self.assertEqual(fu["args"]["character_id"], c.id)

    def test_enrich_followup_proposes_edit(self):
        """run_followups drafts (one LLM call) and proposes an EDIT carrying the id."""
        from characters.models import Character

        session = ProjectScope(self.project.id)
        res = dispatch("promote_to_character", {"name": "Tony Stark"},
                       Actor.USER_BUTTON, session)
        cid = Character.objects.get(project_id=self.project.id, name="Tony Stark").id
        with patch("braindumps.capabilities.execute.run_promote_character", return_value=_DRAFT) as m:
            res = run_followups(res, session)
        m.assert_called_once()
        # gather fed the candidate's phrases (with tags) to the LLM
        args = m.call_args[0]
        self.assertEqual(args[0], "Tony Stark")
        self.assertTrue(any("builds the suit" in (p.get("text") or "") for p in args[1]))
        # exactly one character-EDIT proposal, Character-schema shaped, carrying the id
        self.assertEqual(len(res.proposals), 1)
        preview = res.proposals[0]["proposal"]["preview"]
        self.assertEqual(preview["type"], "character_edit")
        self.assertEqual(preview["character_id"], cid)
        # engine keys mapped to columns (external_arc→story, role→type), empties dropped
        fields = preview["fields"]
        self.assertEqual(fields["story"], _DRAFT["character"]["external_arc"])
        self.assertEqual(fields["type"], "protagonist")
        self.assertEqual(fields["want"], _DRAFT["character"]["want"])
        self.assertNotIn("name", fields)  # identity isn't a proposed field

    def _promote_and_enrich(self, session):
        """Helper: run promote + the enrich follow-up, return (cid, proposal_id)."""
        from characters.models import Character
        res = dispatch("promote_to_character", {"name": "Tony Stark"},
                       Actor.USER_BUTTON, session)
        cid = Character.objects.get(project_id=self.project.id, name="Tony Stark").id
        with patch("braindumps.capabilities.execute.run_promote_character", return_value=_DRAFT):
            res = run_followups(res, session)
        return cid, res.proposals[0]["proposal_id"]

    def test_accept_all_fills_existing_character(self):
        """Accept-all (via _accept_enrich_character) applies every field by id — no dupe."""
        from characters.models import Character

        session = ProjectScope(self.project.id)
        cid, pid = self._promote_and_enrich(session)

        accepted = dispatch("_accept_enrich_character", {"proposal_id": str(pid)},
                            Actor.INTERNAL, session)
        self.assertEqual(accepted.status, "ran")
        self.assertIn("characters", accepted.invalidates)

        c = Character.objects.get(project_id=self.project.id, id=cid)
        self.assertEqual(c.type, "protagonist")
        self.assertEqual(c.description, "A genius weapons manufacturer.")
        self.assertEqual(c.story, _DRAFT["character"]["external_arc"])
        self.assertEqual(c.internal_arc, _DRAFT["character"]["internal_arc"])
        self.assertEqual(c.want, _DRAFT["character"]["want"])
        self.assertEqual(
            Character.objects.filter(project_id=self.project.id, name="Tony Stark").count(), 1)

    def test_get_character_full_overlays_pending(self):
        """get_character_full wraps every field; proposed fields carry proposal+proposed_value."""
        from characters import readers

        session = ProjectScope(self.project.id)
        cid, pid = self._promote_and_enrich(session)
        full = readers.get_character_full(session, character_id=cid)["character"]
        # plain field — actual only
        self.assertEqual(full["name"], {"actual_value": "Tony Stark"})
        # proposed field — actual (empty) + proposal id + proposed value
        self.assertEqual(full["want"]["actual_value"], "")
        self.assertEqual(full["want"]["proposal"], pid)
        self.assertEqual(full["want"]["proposed_value"], _DRAFT["character"]["want"])

    def test_accept_one_field_keeps_proposal_open(self):
        """Per-field accept writes the (edited) value, shrinks the proposal, keeps id."""
        from actions.models import Proposal

        from characters.models import Character

        session = ProjectScope(self.project.id)
        cid, pid = self._promote_and_enrich(session)

        # accept `want` with an EDITED value (the green value the author tweaked)
        r = dispatch("accept_character_field",
                     {"proposal_id": str(pid), "field": "want", "value": "Survival, then redemption."},
                     Actor.USER_BUTTON, session)
        self.assertEqual(r.status, "ran")
        c = Character.objects.get(id=cid)
        self.assertEqual(c.want, "Survival, then redemption.")  # edited value wins
        # proposal still open, `want` gone, the rest still pending
        p = Proposal.objects.get(id=pid)
        self.assertEqual(p.status, Proposal.STATUS_PROPOSED)
        self.assertNotIn("want", p.proposal["preview"]["fields"])
        self.assertIn("story", p.proposal["preview"]["fields"])

    def test_update_proposed_field_saves_into_proposal_not_character(self):
        """Blur-save: editing in proposal mode persists into the proposal (still
        pending); the value only reaches the Character on accept."""
        from actions.models import Proposal

        from characters.models import Character

        session = ProjectScope(self.project.id)
        cid, pid = self._promote_and_enrich(session)

        r = dispatch("update_proposed_field",
                     {"proposal_id": str(pid), "field": "want", "value": "Edited want."},
                     Actor.USER_BUTTON, session)
        self.assertEqual(r.status, "ran")
        p = Proposal.objects.get(id=pid)
        self.assertEqual(p.proposal["preview"]["fields"]["want"], "Edited want.")
        self.assertEqual(p.status, Proposal.STATUS_PROPOSED)  # still pending
        self.assertEqual(Character.objects.get(id=cid).want, "")  # NOT written yet

        # accepting now (no explicit value) promotes the edited proposal value
        dispatch("accept_character_field", {"proposal_id": str(pid), "field": "want"},
                 Actor.USER_BUTTON, session)
        self.assertEqual(Character.objects.get(id=cid).want, "Edited want.")

    def test_reject_field_and_last_field_closes_proposal(self):
        """Per-field reject drops without writing; emptying the proposal closes it."""
        from actions.models import Proposal

        from characters.models import Character

        session = ProjectScope(self.project.id)
        cid, pid = self._promote_and_enrich(session)
        fields = list(Proposal.objects.get(id=pid).proposal["preview"]["fields"].keys())

        # reject the first, accept the rest → proposal empties → APPLIED
        dispatch("reject_character_field", {"proposal_id": str(pid), "field": fields[0]},
                 Actor.USER_BUTTON, session)
        c = Character.objects.get(id=cid)
        self.assertFalse(getattr(c, fields[0]))  # reject wrote nothing
        for f in fields[1:]:
            dispatch("accept_character_field", {"proposal_id": str(pid), "field": f},
                     Actor.USER_BUTTON, session)
        p = Proposal.objects.get(id=pid)
        self.assertEqual(p.status, Proposal.STATUS_APPLIED)
        self.assertEqual(p.proposal["preview"]["fields"], {})

    def test_promote_is_idempotent_for_existing_character(self):
        """An already-real candidate reuses its row (no dupe) and enriches it."""
        from characters.models import Character

        existing = Character.objects.create(project_id=self.project.id, name="Tony Stark")
        res = dispatch("promote_to_character", {"name": "Tony Stark"},
                       Actor.USER_BUTTON, ProjectScope(self.project.id))
        self.assertEqual(res.status, "ran")
        self.assertEqual(res.followups[0]["args"]["character_id"], existing.id)
        self.assertEqual(
            Character.objects.filter(project_id=self.project.id, name="Tony Stark").count(), 1)

    def test_promote_unknown_name_still_creates_but_no_proposal(self):
        """No braindumps mention the name → the row is still created; the enrich
        follow-up finds no material and produces no proposal (no user-facing error)."""
        from characters.models import Character

        session = ProjectScope(self.project.id)
        res = dispatch("promote_to_character", {"name": "Nobody McGhost"},
                       Actor.USER_BUTTON, session)
        self.assertEqual(res.status, "ran")
        self.assertTrue(
            Character.objects.filter(project_id=self.project.id, name="Nobody McGhost").exists())
        with patch("braindumps.capabilities.execute.run_promote_character", return_value=_DRAFT) as m:
            res = run_followups(res, session)
        m.assert_not_called()  # gather raised before the LLM
        self.assertEqual(len(res.proposals), 0)


class FieldSupersedeTests(TestCase):
    """Resolving a field (accept OR reject) drops that same field from every OTHER
    pending character_edit proposal — so a stale sibling proposal can't resurface a
    field the author already decided. The studio shows ONE green cell per field
    (latest-wins); without this, accepting it leaves an older proposal still holding
    the field, which pops back up on the next read with a stale value."""

    def setUp(self):
        self.user = User.objects.create_user(email="sup@e.com", password="x")
        self.project = Project.objects.create(title="S", user=self.user)

    def _propose_edit(self, session, char_id, **fields):
        res = dispatch("propose_character_edit", {"character_id": char_id, **fields},
                       Actor.CHAT, session)
        return res.proposals[0]["proposal_id"]

    def test_accept_field_supersedes_same_field_in_other_proposals(self):
        from actions.models import Proposal

        from characters.models import Character

        char = Character.objects.create(project_id=self.project.id, name="Tony")
        session = ProjectScope(self.project.id)
        # two competing proposals both touch `type`; the older also touches `want`
        pid_old = self._propose_edit(session, char.id, type="hero", want="W1")
        pid_new = self._propose_edit(session, char.id, type="protagonist", summary="S")

        # accept `type` on the NEWER (displayed) proposal
        dispatch("accept_character_field",
                 {"proposal_id": str(pid_new), "field": "type", "value": "protagonist"},
                 Actor.USER_BUTTON, session)

        char.refresh_from_db()
        self.assertEqual(char.type, "protagonist")
        # the OLDER proposal must no longer carry `type` (no resurface) ...
        old = Proposal.objects.get(id=pid_old)
        self.assertNotIn("type", old.proposal["preview"]["fields"])
        # ... but its unrelated field stays pending, proposal still open
        self.assertIn("want", old.proposal["preview"]["fields"])
        self.assertEqual(old.status, Proposal.STATUS_PROPOSED)

    def test_reject_field_supersedes_and_closes_emptied_sibling(self):
        from actions.models import Proposal

        from characters.models import Character

        char = Character.objects.create(project_id=self.project.id, name="Tony")
        session = ProjectScope(self.project.id)
        pid_old = self._propose_edit(session, char.id, type="hero")        # only `type`
        pid_new = self._propose_edit(session, char.id, type="protagonist", summary="S")

        # reject `type` on the newer proposal
        dispatch("reject_character_field", {"proposal_id": str(pid_new), "field": "type"},
                 Actor.USER_BUTTON, session)

        char.refresh_from_db()
        self.assertEqual(char.type, "")  # reject wrote nothing
        # the sibling held ONLY `type` → dropped → emptied → closed REJECTED
        old = Proposal.objects.get(id=pid_old)
        self.assertNotIn("type", old.proposal["preview"]["fields"])
        self.assertEqual(old.status, Proposal.STATUS_REJECTED)

    def test_appearance_subkeys_from_different_proposals_all_visible(self):
        """The studio explodes `appearance` per sub-key; two proposals touching
        DIFFERENT appearance sub-keys must BOTH show, each carrying its own
        proposal id. The old whole-dict dedup hid a non-latest proposal's sub-keys
        until one resolved, then popped them up — the nested-json bug."""
        from characters import readers
        from characters.models import Character

        char = Character.objects.create(
            project_id=self.project.id, name="Tony", appearance={"gender": "male"})
        session = ProjectScope(self.project.id)
        pid_old = self._propose_edit(session, char.id, appearance={"eyes": "blue"})
        pid_new = self._propose_edit(session, char.id, appearance={"clothing": "suit B"})

        cells = readers.get_character_full(session, character_id=char.id)["character"]["appearance"]
        # both sub-keys visible at once, each attributed to the proposal that owns it
        self.assertEqual(cells["eyes"]["proposal"], pid_old)
        self.assertEqual(cells["eyes"]["proposed_value"], "blue")
        self.assertEqual(cells["clothing"]["proposal"], pid_new)
        self.assertEqual(cells["clothing"]["proposed_value"], "suit B")
        # the live sub-key has no proposal overlay
        self.assertNotIn("proposal", cells["gender"])

    def test_appearance_subkey_latest_wins_and_supersedes(self):
        """Same appearance sub-key on two proposals → latest shown; accepting it
        clears that sub-key from the older sibling (no resurface), leaving the
        sibling's OTHER appearance sub-key pending."""
        from actions.models import Proposal

        from characters import readers
        from characters.models import Character

        char = Character.objects.create(project_id=self.project.id, name="Tony")
        session = ProjectScope(self.project.id)
        pid_old = self._propose_edit(
            session, char.id, appearance={"clothing": "suit A", "eyes": "blue"})
        pid_new = self._propose_edit(session, char.id, appearance={"clothing": "suit B"})

        # displayed clothing belongs to the newer proposal (latest-wins per sub-key)
        cells = readers.get_character_full(session, character_id=char.id)["character"]["appearance"]
        self.assertEqual(cells["clothing"]["proposal"], pid_new)
        self.assertEqual(cells["clothing"]["proposed_value"], "suit B")

        dispatch("accept_character_field",
                 {"proposal_id": str(pid_new), "field": "appearance.clothing", "value": "suit B"},
                 Actor.USER_BUTTON, session)

        char.refresh_from_db()
        self.assertEqual(char.appearance.get("clothing"), "suit B")
        # the older sibling no longer carries clothing (no resurface) but keeps eyes
        old = Proposal.objects.get(id=pid_old).proposal["preview"]["fields"]["appearance"]
        self.assertNotIn("clothing", old)
        self.assertEqual(old["eyes"], "blue")
        # final display: clothing settled (no overlay), eyes still pending from old
        cells = readers.get_character_full(session, character_id=char.id)["character"]["appearance"]
        self.assertNotIn("proposal", cells["clothing"])
        self.assertEqual(cells["eyes"]["proposal"], pid_old)

    def test_supersede_is_scoped_to_the_same_character(self):
        from actions.models import Proposal

        from characters.models import Character

        tony = Character.objects.create(project_id=self.project.id, name="Tony")
        pepper = Character.objects.create(project_id=self.project.id, name="Pepper")
        session = ProjectScope(self.project.id)
        pid_pepper = self._propose_edit(session, pepper.id, type="ally")
        pid_tony = self._propose_edit(session, tony.id, type="protagonist")

        dispatch("accept_character_field",
                 {"proposal_id": str(pid_tony), "field": "type"},
                 Actor.USER_BUTTON, session)

        # Pepper's proposal is a different character — untouched
        pep = Proposal.objects.get(id=pid_pepper)
        self.assertEqual(pep.proposal["preview"]["fields"]["type"], "ally")
        self.assertEqual(pep.status, Proposal.STATUS_PROPOSED)


class NightEyesEditCharacterTests(TestCase):
    """propose_character_edit — Night Eyes edits a character via the SAME
    character_edit proposal the studio pipeline already handles. The AI sees the
    tool as plain `update_character`; the user's direct patch is untouched."""

    def setUp(self):
        self.user = User.objects.create_user(email="ne@e.com", password="x")
        self.project = Project.objects.create(title="NE", user=self.user)

    def test_ai_sees_update_character_but_it_proposes(self):
        from actions.capabilities import registry as cap_registry

        cap = cap_registry.get("propose_character_edit")
        self.assertEqual(cap.ai_name, "update_character")   # the LLM-facing name
        self.assertEqual(cap.actors, (Actor.CHAT,))         # chat-only
        # the user's direct-write update_character no longer exposes itself to chat
        write_cap = cap_registry.get("update_character")
        self.assertNotIn(Actor.CHAT, write_cap.actors)

    def test_edit_writes_same_character_edit_proposal(self):
        from characters import readers
        from characters.models import Character

        char = Character.objects.create(project_id=self.project.id, name="Pepper")
        session = ProjectScope(self.project.id)
        res = dispatch(
            "propose_character_edit",
            {"character_id": char.id, "want": "Run the company.", "misbelief": "She is invisible."},
            Actor.CHAT, session,
        )
        self.assertEqual(res.status, "proposed")
        preview = res.proposals[0]["proposal"]["preview"]
        self.assertEqual(preview["type"], "character_edit")
        self.assertEqual(preview["character_id"], char.id)
        self.assertEqual(
            preview["fields"], {"want": "Run the company.", "misbelief": "She is invisible."})

        # the studio reader overlays it like any character_edit proposal...
        full = readers.get_character_full(session, character_id=char.id)["character"]
        self.assertEqual(full["want"]["proposed_value"], "Run the company.")
        # ...and the shared accept path applies it (no extra wiring).
        pid = res.proposals[0]["proposal_id"]
        dispatch("_accept_enrich_character", {"proposal_id": str(pid)}, Actor.INTERNAL, session)
        char.refresh_from_db()
        self.assertEqual(char.want, "Run the company.")
        self.assertEqual(char.misbelief, "She is invisible.")

    def test_edit_with_no_editable_fields_errors(self):
        from characters.models import Character

        char = Character.objects.create(project_id=self.project.id, name="Pepper")
        res = dispatch("propose_character_edit", {"character_id": char.id},
                       Actor.CHAT, ProjectScope(self.project.id))
        self.assertEqual(res.status, "error")
        self.assertEqual(res.http_status, 400)
