"""SA-100 / SA-157 / SA-161 — every character field the author can edit saves.

The field list used to live in six places that drifted, so some fields were
silently stripped or dropped while the API still said 200. Now there is one
list (`characters/fields.py`). These tests pin it:

  • the frontend form's field list matches the backend list exactly;
  • every field round-trips through update_character → get_characters;
  • relationships are real rows (CRUD, rename-safe, delete, cross-project 404);
  • an AI proposal that changes relationships is stamped (SA-209).
"""
import re
from pathlib import Path

from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from actions.models import Proposal
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

from characters import fields as cf
from characters.models import Character, CharacterRelationship

User = get_user_model()

DATA_TS = (Path(__file__).resolve().parents[3]
           / "frontend/src/app/pages/characters/data.ts")

# One sample value per field, by kind.
SAMPLE = {
    **{f: f"some {f}" for f in cf.TEXT_FIELDS},
    "status": "archived",
    "color": "#123456",
    **dict.fromkeys(cf.BOOL_FIELDS, True),
    "appearance": {"description": "tall", "worlditem": "a brass key"},
    "voice_profile": {"tone": "dry"},
    "aliases": [{"name": "The Kid"}],
}


def frontend_update_fields() -> list[str]:
    src = DATA_TS.read_text()
    m = re.search(r"UPDATE_FIELDS\s*=\s*\[(.*?)\]", src, re.S)
    assert m, "UPDATE_FIELDS not found in data.ts"
    return re.findall(r"'([a-z_]+)'", m.group(1))


class _Base(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="f@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        self.scope = ProjectScope(self.project.id)
        self.ana = Character.objects.create(project=self.project, name="Ana")
        self.ben = Character.objects.create(project=self.project, name="Ben")

    def patch(self, cid, **fields):
        return dispatch("update_character", {"id": cid, **fields}, Actor.USER_BUTTON, self.scope)

    def read(self, cid):
        res = dispatch("get_characters", {}, Actor.USER_BUTTON, self.scope)
        return next(c for c in res.result["characters"] if c["id"] == cid)


class FieldListTests(_Base):
    def test_frontend_form_fields_match_backend_list(self):
        self.assertEqual(sorted(frontend_update_fields()), sorted(cf.AUTHOR_EDITABLE))

    def test_every_editable_field_round_trips(self):
        self.ben.save()
        fields = {f: SAMPLE[f] for f in cf.AUTHOR_EDITABLE if f in SAMPLE}
        fields["name"] = "Ana Renamed"
        fields["relationships"] = [{"character_id": self.ben.id, "label": "rival"}]
        res = self.patch(self.ana.id, **fields)
        self.assertEqual(res.status, "ran", res.error)
        row = self.read(self.ana.id)
        for f, v in fields.items():
            if f == "relationships":
                self.assertEqual(cf.compare_form(row[f]), cf.compare_form(v))
            else:
                self.assertEqual(row[f], v, f)

    def test_emotional_journey_alone_saves(self):
        """SA-100: `internal_arc` alone used to be stripped → 400."""
        res = self.patch(self.ana.id, internal_arc="Learns to ask for help.")
        self.assertEqual(res.status, "ran", res.error)
        self.assertEqual(self.read(self.ana.id)["internal_arc"], "Learns to ask for help.")

    def test_backstory_saves(self):
        """SA-161: Backstory was local UI state only."""
        self.patch(self.ana.id, backstory="Grew up on a lighthouse.")
        self.assertEqual(self.read(self.ana.id)["backstory"], "Grew up on a lighthouse.")

    def test_unknown_field_is_refused_not_dropped(self):
        res = self.patch(self.ana.id, want="x", portrait_url="http://evil")
        self.assertEqual((res.status, res.http_status), ("error", 400))
        self.ana.refresh_from_db()
        self.assertEqual(self.ana.want, "")

    def test_tool_schemas_derive_from_the_list(self):
        from actions.capabilities import registry
        upd = registry.get("update_character").args
        self.assertEqual(set(upd) - {"id"}, set(cf.AUTHOR_EDITABLE))
        prop = registry.get("propose_character_edit").args
        self.assertEqual(set(prop) - {"character_id"}, set(cf.AI_EDITABLE))


class RelationshipTests(_Base):
    def test_crud_round_trip(self):
        cara = Character.objects.create(project=self.project, name="Cara")
        self.patch(self.ana.id, relationships=[
            {"character_id": self.ben.id, "label": "rival", "note": "since school"},
            {"name": "cara", "label": "mentor to"},  # name resolves too
        ])
        out = self.read(self.ana.id)["relationships"]
        self.assertEqual([(r["name"], r["label"]) for r in out], [("Ben", "rival"), ("Cara", "mentor to")])
        self.assertEqual(out[0]["note"], "since school")
        # incoming side, on the other character
        self.assertEqual([(r["name"], r["label"]) for r in self.read(self.ben.id)["relationships_in"]],
                         [("Ana", "rival")])
        # rename is safe (FK, name read live)
        self.patch(self.ben.id, name="Benedict")
        self.assertEqual(self.read(self.ana.id)["relationships"][0]["name"], "Benedict")
        # remove one = send the shorter list
        self.patch(self.ana.id, relationships=[{"character_id": cara.id, "label": "mentor to"}])
        self.assertEqual(CharacterRelationship.objects.filter(from_character=self.ana).count(), 1)
        # clear
        self.patch(self.ana.id, relationships=[])
        self.assertFalse(CharacterRelationship.objects.exists())

    def test_duplicates_collapse_and_self_link_refused(self):
        self.patch(self.ana.id, relationships=[
            {"character_id": self.ben.id, "label": "rival"},
            {"character_id": self.ben.id, "label": "Rival"},
        ])
        self.assertEqual(CharacterRelationship.objects.count(), 1)
        res = self.patch(self.ana.id, relationships=[{"character_id": self.ana.id, "label": "self"}])
        self.assertEqual(res.http_status, 400)

    def test_cross_project_target_is_404_and_writes_nothing(self):
        other = Project.objects.create(title="Q", user=self.user)
        stranger = Character.objects.create(project=other, name="Stranger")
        res = self.patch(self.ana.id, want="new want",
                         relationships=[{"character_id": stranger.id, "label": "ally"}])
        self.assertEqual((res.status, res.http_status), ("error", 404))
        self.assertFalse(CharacterRelationship.objects.exists())
        self.ana.refresh_from_db()
        self.assertEqual(self.ana.want, "")  # atomic: nothing written

    def test_cross_project_source_is_404(self):
        other = Project.objects.create(title="Q", user=self.user)
        stranger = Character.objects.create(project=other, name="Stranger")
        res = self.patch(stranger.id, relationships=[{"character_id": self.ana.id, "label": "ally"}])
        self.assertEqual(res.http_status, 404)

    def test_deleting_a_character_removes_its_relationships(self):
        self.patch(self.ana.id, relationships=[{"character_id": self.ben.id, "label": "rival"}])
        # soft delete (Undo window): hidden from both sides, back on Undo
        dispatch("delete_character", {"id": self.ben.id}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(self.read(self.ana.id)["relationships"], [])
        dispatch("undelete_character", {"id": self.ben.id}, Actor.USER_BUTTON, self.scope)
        self.assertEqual(len(self.read(self.ana.id)["relationships"]), 1)
        # hard delete: the row is gone
        Character.all_objects.filter(id=self.ben.id).delete()
        self.assertFalse(CharacterRelationship.objects.exists())


class RelationshipProposalTests(_Base):
    def propose(self, rels):
        res = dispatch("propose_character_edit",
                       {"character_id": self.ana.id, "relationships": rels},
                       Actor.CHAT, self.scope)
        self.assertNotEqual(res.status, "error", res.error)
        return Proposal.objects.filter(project=self.project).latest("id")

    def accept(self, p, **extra):
        return dispatch("accept_proposal", {"proposal_id": str(p.pk), **extra},
                        Actor.USER_BUTTON, self.scope)

    def test_ai_proposal_writes_rows_on_accept(self):
        p = self.propose([{"name": "Ben", "label": "rival"}])
        self.assertEqual(p.base, {"relationships": []})
        res = self.accept(p)
        self.assertEqual(res.status, "ran", res.error)
        self.assertEqual([(r["name"], r["label"]) for r in self.read(self.ana.id)["relationships"]],
                         [("Ben", "rival")])

    def test_ai_proposal_unknown_target_is_refused(self):
        res = dispatch("propose_character_edit",
                       {"character_id": self.ana.id, "relationships": [{"name": "Nobody", "label": "x"}]},
                       Actor.CHAT, self.scope)
        self.assertEqual(res.http_status, 404)

    def test_author_change_after_proposal_is_stale(self):
        p = self.propose([{"name": "Ben", "label": "rival"}])
        self.patch(self.ana.id, relationships=[{"character_id": self.ben.id, "label": "ally"}])
        res = self.accept(p)
        self.assertEqual((res.http_status, res.code), (409, "proposal_stale"))
        self.assertEqual([r["label"] for r in self.read(self.ana.id)["relationships"]], ["ally"])
        res = self.accept(p, force=True)
        self.assertEqual(res.status, "ran", res.error)
        self.assertEqual([r["label"] for r in self.read(self.ana.id)["relationships"]], ["rival"])

    def test_per_field_accept_writes_rows(self):
        p = self.propose([{"name": "Ben", "label": "rival"}])
        res = dispatch("accept_character_field",
                       {"proposal_id": str(p.pk), "field": "relationships"},
                       Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.status, "ran", res.error)
        self.assertEqual(CharacterRelationship.objects.count(), 1)
