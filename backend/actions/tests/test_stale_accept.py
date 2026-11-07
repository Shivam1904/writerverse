"""SA-209 — accepting a proposal must not clobber a newer authored edit.

A proposal is stamped with the target's current value when it is made
(`Proposal.base`). On accept, if the author has changed the target since, the
accept returns 409 `proposal_stale` with {field, was, current, proposed} per
field and writes NOTHING. `force=true` ("Use AI's") applies it anyway; a reject
("Keep mine") dismisses it. Also covers the closed-proposal guards (double
accept, accept after dismiss, reject after accept).
"""
from types import SimpleNamespace

from characters.models import Character
from django.contrib.auth import get_user_model
from django.test import TestCase
from outline.models import PlotThread, ThreadBeat
from outline.store import save_outline, save_threads
from projects.models import Project
from worldbuilding.models import Worldbuilding

from actions.capabilities import Actor, dispatch, registry
from actions.capabilities.dispatch import _context_for, _create_proposal_row
from actions.capabilities.spec import ProjectScope, Route
from actions.models import Proposal

User = get_user_model()

GRAND = {"base_template": "three_act", "acts": [{"id": "ac-1", "text": "Act I", "chapters": [
    {"id": "ch-1", "text": "Chapter 1", "scenes": [{"id": "sc-1", "text": "Opening", "beats": []}]},
]}]}
THREADS = [{"id": "th-1", "items": [{"id": "bt-1", "kind": "text", "text": "old"}]}]


class _Base(TestCase):
    def setUp(self):
        user = User.objects.create_user(email="stale@e.com", password="x")
        self.project = Project.objects.create(title="P", user=user, synopsis="Mine")
        save_outline(SimpleNamespace(project_id=self.project.pk), GRAND)
        save_threads(SimpleNamespace(project_id=self.project.pk), THREADS)
        self.scope = ProjectScope(self.project.pk)
        self.ctx = _context_for(self.scope, Actor.CHAT)

    def propose(self, capability, preview, args=None):
        """Create a proposal through the real path, so it gets stamped."""
        row, _ = _create_proposal_row(capability, args or {}, preview, self.ctx)
        return row

    def accept(self, proposal, **extra):
        return dispatch("accept_proposal", {"proposal_id": str(proposal.pk), **extra},
                        Actor.USER_BUTTON, self.scope)

    def assert_stale(self, res, proposal, fields):
        self.assertEqual(res.status, "error", res.error)
        self.assertEqual(res.http_status, 409)
        self.assertEqual(res.code, "proposal_stale")
        self.assertEqual(sorted(c["field"] for c in res.error_data["conflicts"]), sorted(fields))
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, Proposal.STATUS_PROPOSED)  # still the author's call

    def assert_applied(self, res, proposal):
        self.assertEqual(res.status, "ran", res.error)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, Proposal.STATUS_APPLIED)

    def beat(self):
        return ThreadBeat.objects.get(thread__project=self.project, uid="bt-1")


class RegistryContractTests(TestCase):
    def test_every_proposing_capability_declares_a_stamp(self):
        missing = [c.name for c in registry.all_capabilities()
                   if c.route is Route.PROPOSE and c.accept and c.stamp is None]
        self.assertEqual(missing, [])

    def test_every_accept_capability_is_guarded(self):
        accepts = {c.accept for c in registry.all_capabilities() if c.accept}
        unguarded = [n for n in sorted(accepts)
                     if not getattr(registry.get(n).commit, "accept_guarded", False)]
        self.assertEqual(unguarded, [])


class BeatEditTests(_Base):
    def _edit(self):
        return self.propose("propose_update_beat", {
            "type": "beat_edit", "thread_id": "th-1", "beat_id": "bt-1", "fields": {"text": "AI text"},
        })

    def test_stamps_current_value(self):
        self.assertEqual(self._edit().base, {"text": "old"})

    def test_unchanged_target_applies(self):
        p = self._edit()
        self.assert_applied(self.accept(p), p)
        self.assertEqual(self.beat().text, "AI text")

    def test_author_edit_blocks_accept(self):
        p = self._edit()
        ThreadBeat.objects.filter(uid="bt-1").update(text="Author rewrote it")
        res = self.accept(p)
        self.assert_stale(res, p, ["text"])
        c = res.error_data["conflicts"][0]
        self.assertEqual((c["was"], c["current"], c["proposed"]), ("old", "Author rewrote it", "AI text"))
        self.assertEqual(self.beat().text, "Author rewrote it")  # not clobbered

    def test_force_applies_anyway(self):
        p = self._edit()
        ThreadBeat.objects.filter(uid="bt-1").update(text="Author rewrote it")
        self.assert_applied(self.accept(p, force=True), p)
        self.assertEqual(self.beat().text, "AI text")

    def test_keep_mine_rejects(self):
        p = self._edit()
        ThreadBeat.objects.filter(uid="bt-1").update(text="Author rewrote it")
        dispatch("reject_proposal", {"proposal_id": str(p.pk)}, Actor.USER_BUTTON, self.scope)
        p.refresh_from_db()
        self.assertEqual(p.status, Proposal.STATUS_REJECTED)
        self.assertEqual(self.beat().text, "Author rewrote it")

    def test_author_already_wrote_the_ai_text_is_no_conflict(self):
        p = self._edit()
        ThreadBeat.objects.filter(uid="bt-1").update(text="AI text")
        self.assert_applied(self.accept(p), p)

    def test_direct_accept_beat_is_guarded_too(self):
        p = self._edit()
        ThreadBeat.objects.filter(uid="bt-1").update(text="Author rewrote it")
        res = dispatch("accept_beat", {"proposal_id": str(p.pk)}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.code, "proposal_stale")

    def test_unstamped_legacy_proposal_applies_as_before(self):
        p = self._edit()
        Proposal.objects.filter(pk=p.pk).update(base=None)
        ThreadBeat.objects.filter(uid="bt-1").update(text="Author rewrote it")
        self.assert_applied(self.accept(p), p)


class ClosedProposalTests(_Base):
    def _insert(self):
        return self.propose("propose_insert_beat", {
            "type": "beat_insert", "thread_id": "th-1", "index": 1, "fields": {"text": "new beat"},
        })

    def test_double_accept_does_not_insert_twice(self):
        p = self._insert()
        self.assert_applied(self.accept(p), p)
        # Simulate the second click whose gather saw PROPOSED before the first committed:
        # the direct per-type accept re-checks under the lock.
        Proposal.objects.filter(pk=p.pk).update(status=Proposal.STATUS_APPLIED)
        res = dispatch("accept_beat", {"proposal_id": str(p.pk)}, Actor.USER_BUTTON, self.scope)
        self.assertEqual((res.http_status, res.code), (409, "proposal_not_pending"))
        self.assertEqual(ThreadBeat.objects.filter(thread__uid="th-1", text="new beat").count(), 1)

    def test_accept_after_dismiss(self):
        p = self._insert()
        dispatch("reject_proposal", {"proposal_id": str(p.pk)}, Actor.USER_BUTTON, self.scope)
        res = self.accept(p)
        self.assertEqual((res.http_status, res.code), (409, "proposal_not_pending"))
        p.refresh_from_db()
        self.assertEqual(p.status, Proposal.STATUS_REJECTED)  # not flipped to FAILED

    def test_reject_after_accept_keeps_applied(self):
        p = self._insert()
        self.accept(p)
        res = dispatch("reject_proposal", {"proposal_id": str(p.pk)}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.http_status, 409)
        p.refresh_from_db()
        self.assertEqual(p.status, Proposal.STATUS_APPLIED)

    def test_inserts_never_conflict(self):
        p = self._insert()
        self.assertEqual(p.base, {})
        ThreadBeat.objects.filter(uid="bt-1").update(text="Author rewrote it")
        self.assert_applied(self.accept(p), p)


class CharacterEditTests(_Base):
    def setUp(self):
        super().setUp()
        self.char = Character.objects.create(
            project=self.project, name="Luna", want="mine want", need="mine need",
            appearance={"eyes": "grey"},
        )

    def _edit(self, capability="propose_character_edit", fields=None):
        return self.propose(capability, {
            "type": "character_edit", "character_id": self.char.pk,
            "fields": fields or {"want": "AI want", "need": "AI need"},
        })

    def test_partial_conflict_blocks_all_and_names_only_changed_field(self):
        p = self._edit()
        Character.objects.filter(pk=self.char.pk).update(need="Tuesday need")
        self.assert_stale(self.accept(p), p, ["need"])
        self.char.refresh_from_db()
        self.assertEqual((self.char.want, self.char.need), ("mine want", "Tuesday need"))

    def test_enrich_kind_is_guarded(self):
        p = self._edit("enrich_promoted_character")
        Character.objects.filter(pk=self.char.pk).update(want="Tuesday want")
        self.assert_stale(self.accept(p), p, ["want"])

    def test_dict_subfield(self):
        p = self._edit(fields={"appearance": {"eyes": "green"}})
        self.assertEqual(p.base, {"appearance.eyes": "grey"})
        Character.objects.filter(pk=self.char.pk).update(appearance={"eyes": "blue"})
        self.assert_stale(self.accept(p), p, ["appearance.eyes"])

    def _field(self, p, field, **extra):
        return dispatch("accept_character_field",
                        {"proposal_id": str(p.pk), "field": field, **extra},
                        Actor.USER_BUTTON, self.scope)

    def test_per_field_accept_checks_only_that_field(self):
        p = self._edit()
        Character.objects.filter(pk=self.char.pk).update(need="Tuesday need")
        self.assertEqual(self._field(p, "want").status, "ran")  # untouched field applies
        res = self._field(p, "need")
        self.assertEqual(res.code, "proposal_stale")
        self.assertEqual(self._field(p, "need", force=True).status, "ran")
        self.char.refresh_from_db()
        self.assertEqual((self.char.want, self.char.need), ("AI want", "AI need"))

    def test_per_field_accept_on_closed_proposal(self):
        p = self._edit()
        Proposal.objects.filter(pk=p.pk).update(status=Proposal.STATUS_REJECTED)
        self.assertEqual(self._field(p, "want").code, "proposal_not_pending")
        self.char.refresh_from_db()
        self.assertEqual(self.char.want, "mine want")


class ProjectMetaTests(_Base):
    def _edit(self):
        return self.propose("update_project_meta", {
            "type": "meta_edit", "project_id": self.project.pk, "fields": {"synopsis": "AI synopsis"},
        })

    def test_accept_all(self):
        p = self._edit()
        Project.objects.filter(pk=self.project.pk).update(synopsis="Author synopsis")
        self.assert_stale(self.accept(p), p, ["synopsis"])
        self.assert_applied(self.accept(p, force=True), p)
        self.project.refresh_from_db()
        self.assertEqual(self.project.synopsis, "AI synopsis")

    def test_per_field(self):
        p = self._edit()
        Project.objects.filter(pk=self.project.pk).update(synopsis="Author synopsis")
        res = dispatch("accept_project_meta_field",
                       {"proposal_id": str(p.pk), "field": "synopsis"}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.code, "proposal_stale")
        self.project.refresh_from_db()
        self.assertEqual(self.project.synopsis, "Author synopsis")


class WorldEntityTests(_Base):
    def test_draft_world_entity(self):
        w = Worldbuilding.objects.create(project=self.project, title="Keep", content="")
        p = self.propose("draft_world_entity", {
            "type": "world_entity_edit", "worldbuilding_id": w.pk, "content": "AI desc",
        })
        Worldbuilding.objects.filter(pk=w.pk).update(content="Author desc")
        self.assert_stale(self.accept(p), p, ["content"])
        w.refresh_from_db()
        self.assertEqual(w.content, "Author desc")


class UserWishesTests(_Base):
    def test_replacing_an_edited_wishes_thread_conflicts(self):
        t = PlotThread.objects.create(project=self.project, uid="ro-w", title="Wishes",
                                      source="user_wishes", scope_type="story")
        ThreadBeat.objects.create(thread=t, uid="it-1", text="beat one")
        p = self.propose("run_user_wishes_rough", {
            "rough_outline": {"title": "New wishes", "items": []}, "items_count": 0,
        })
        ThreadBeat.objects.filter(uid="it-1").update(text="author edit")
        self.assert_stale(self.accept(p), p, ["user_wishes_thread"])
        self.assertTrue(PlotThread.objects.filter(uid="ro-w").exists())  # not deleted


class HttpBodyTests(_Base):
    def test_conflict_rides_the_facade_response(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.project.user)
        p = self.propose("propose_update_beat", {
            "type": "beat_edit", "thread_id": "th-1", "beat_id": "bt-1", "fields": {"text": "AI text"},
        })
        ThreadBeat.objects.filter(uid="bt-1").update(text="Author rewrote it")
        url = f"/api/consistency/projects/{self.project.pk}/op/accept_proposal/"
        resp = client.post(url, {"proposal_id": str(p.pk)}, format="json")
        self.assertEqual(resp.status_code, 409)
        body = resp.json()
        self.assertEqual(body["code"], "proposal_stale")
        self.assertEqual(body["conflicts"][0]["current"], "Author rewrote it")
        resp = client.post(url, {"proposal_id": str(p.pk), "force": True}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.beat().text, "AI text")
