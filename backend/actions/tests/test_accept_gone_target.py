from types import SimpleNamespace

from outline.store import save_threads

"""Accepting a proposal whose target is gone must FAIL (409), not report "applied".

A bare `return` in a commit function reads as success, so `accept_proposal` used to
stamp the row APPLIED, return 200 and drop the card while nothing was written.
Each accept path below now raises `CapabilityError(..., 409)` instead.
"""
from characters.models import Character
from django.contrib.auth import get_user_model
from django.test import TestCase
from outline.store import save_outline
from projects.models import Project

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from actions.models import Proposal

User = get_user_model()

GRAND = {"base_template": "three_act", "acts": [{"id": "ac-1", "text": "Act I", "chapters": [
    {"id": "ch-1", "text": "Chapter 1", "scenes": [{"id": "sc-1", "text": "Opening", "beats": []}]},
]}]}
THREADS = [{"id": "th-1", "items": [{"id": "bt-1", "kind": "text", "text": "old"}]}]


class AcceptGoneTargetTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(email="gone@e.com", password="x")
        self.project = Project.objects.create(title="P", user=user)
        save_outline(SimpleNamespace(project_id=self.project.pk), GRAND)
        save_threads(SimpleNamespace(project_id=self.project.id), THREADS)
        self.session = ProjectScope(self.project.id)

    def _proposal(self, capability, preview):
        return Proposal.objects.create(
            project=self.project, source="button", capability=capability, args={},
            proposal={"capability": capability, "args": {}, "preview": preview},
        )

    def _accept_fails(self, proposal):
        res = dispatch("accept_proposal", {"proposal_id": str(proposal.id)},
                       Actor.USER_BUTTON, self.session)
        self.assertEqual(res.status, "error")
        self.assertEqual(res.http_status, 409)
        proposal.refresh_from_db()
        self.assertNotEqual(proposal.status, Proposal.STATUS_APPLIED)

    def _beat(self, **over):
        pv = {"type": "beat_edit", "thread_id": "th-1", "beat_id": "bt-1", "fields": {"text": "new"}}
        pv.update(over)
        return self._proposal("propose_update_beat", pv)

    def test_beat_thread_gone(self):
        self._accept_fails(self._beat(thread_id="th-missing"))

    def test_beat_gone(self):
        self._accept_fails(self._beat(beat_id="bt-missing"))

    def test_beat_unknown_type(self):
        self._accept_fails(self._beat(type="beat_mystery"))

    def test_beat_edit_still_applies_when_target_exists(self):
        p = self._beat()
        res = dispatch("accept_proposal", {"proposal_id": str(p.id)}, Actor.USER_BUTTON, self.session)
        self.assertNotEqual(res.status, "error")
        p.refresh_from_db()
        self.assertEqual(p.status, Proposal.STATUS_APPLIED)

    def _outline(self, **over):
        pv = {"type": "outline_beat_insert", "scene_id": "sc-1", "index": -1, "fields": {"text": "x"}}
        pv.update(over)
        return self._proposal("run_merge_rough_into_grand", pv)

    def test_outline_scene_gone(self):
        self._accept_fails(self._outline(scene_id="sc-missing"))

    def test_outline_unknown_type(self):
        self._accept_fails(self._outline(type="nope"))

    def test_outline_missing(self):
        save_outline(SimpleNamespace(project_id=self.project.pk), {})
        self._accept_fails(self._outline())

    def test_enrich_character_gone(self):
        pv = {"type": "character_edit", "character_id": 999999, "fields": {"description": "d"}}
        self._accept_fails(self._proposal("enrich_promoted_character", pv))

    def test_enrich_character_nothing_left(self):
        char = Character.objects.create(project=self.project, name="Al")
        pv = {"type": "character_edit", "character_id": char.id, "fields": {}}
        self._accept_fails(self._proposal("enrich_promoted_character", pv))

    def test_world_draft_empty_content(self):
        pv = {"type": "world_entity_edit", "worldbuilding_id": 1, "content": "  "}
        self._accept_fails(self._proposal("draft_world_entity", pv))

    def test_world_draft_unknown_type(self):
        pv = {"type": "nope", "worldbuilding_id": 1, "content": "x"}
        self._accept_fails(self._proposal("draft_world_entity", pv))


class FailedAcceptKeepsSuggestionTests(AcceptGoneTargetTests):
    """wrt-106: a failed per-type accept leaves the suggestion open (PROPOSED,
    never FAILED) and tells the author what went wrong."""

    def test_failed_accept_stays_proposed_with_the_real_reason(self):
        p = self._beat(beat_id="bt-missing")
        res = dispatch("accept_proposal", {"proposal_id": str(p.id)},
                       Actor.USER_BUTTON, self.session)
        self.assertEqual(res.status, "error")
        self.assertTrue(res.error)
        self.assertNotEqual(res.error, "accept capability failed")
        p.refresh_from_db()
        self.assertEqual(p.status, Proposal.STATUS_PROPOSED)

    def test_failed_accept_without_a_message_gets_a_plain_sentence(self):
        import importlib
        from unittest.mock import patch

        from actions.capabilities import DispatchResult, registry
        from actions.capabilities.commit._proposals import ACCEPT_FAILED_MESSAGE

        # The module (the package re-exports a function of the same name).
        dispatch_mod = importlib.import_module("actions.capabilities.dispatch")
        real = dispatch_mod.dispatch
        per_type_accept = registry.get("propose_update_beat").accept

        def failing(name, *a, **kw):
            # The per-type accept fails with no message of its own.
            if name == per_type_accept:
                return DispatchResult(status="error", capability=name, error=None)
            return real(name, *a, **kw)

        p = self._beat()
        with patch.object(dispatch_mod, "dispatch", side_effect=failing):
            res = dispatch("accept_proposal", {"proposal_id": str(p.id)},
                           Actor.USER_BUTTON, self.session)
        self.assertEqual(res.status, "error")
        self.assertEqual(res.error, ACCEPT_FAILED_MESSAGE)
        p.refresh_from_db()
        self.assertEqual(p.status, Proposal.STATUS_PROPOSED)
