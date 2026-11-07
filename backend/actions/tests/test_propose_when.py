"""ProposeWhen.AI_ONLY — auto-apply for non-AI actors.

A Route.PROPOSE capability flagged AI_ONLY shows a human-in-loop card only when
the AI (Actor.CHAT) proposes. For any other actor (button/cron) the trigger IS
the intent, so the proposal is applied immediately via its `accept` capability
and the row is flipped to APPLIED rather than left pending.

Covered both ways: synthetic capabilities for the dispatch-layer contract, and
the real `update_project_meta` capability end-to-end. A real Project row (id=1)
backs the Proposal FK; dispatch runs against ProjectScope(1).
"""
from django.test import TestCase

from actions.capabilities import (
    Actor,
    Capability,
    ProposeWhen,
    Route,
    dispatch,
    registry,
)
from actions.capabilities.spec import ProjectScope
from actions.models import Proposal


def _accept_gather(ctx, args):
    """The accept WRITE cap reads its preview back from the row by id —
    mirrors the real gather_from_proposal contract."""
    row = Proposal.objects.get(pk=args["proposal_id"])
    return {"preview": row.proposal.get("preview"), "records": [{"tag": "applied"}]}


# Previews the synthetic accept cap applied, in order (cleared per test).
_APPLIED: list = []


def _accept_commit(ctx, result):
    _APPLIED.append(result.get("preview"))


def _register_pair(name, *, propose_when=ProposeWhen.ALWAYS, accept=True):
    accept_name = f"_accept_{name}" if accept else None
    if accept:
        registry.register(Capability(
            name=accept_name,
            route=Route.WRITE,
            description="accept",
            args={"proposal_id": "string"},
            gather=_accept_gather,
            commit=_accept_commit,
            actors=(Actor.INTERNAL,),
        ))
    registry.register(Capability(
        name=name,
        route=Route.PROPOSE,
        description="propose",
        gather=lambda ctx, args: {"value": args.get("v", 1)},
        accept=accept_name,
        preview=lambda result: {"shown": result["value"]},
        propose_when=propose_when,
        actors=(Actor.USER_BUTTON, Actor.CHAT, Actor.CRON),
    ))


class ProposeWhenTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="proposewhen@test.com", password="test",
        )
        cls.project = Project.objects.create(id=1, title="Test", user=user)

    def setUp(self):
        self._snap = registry.snapshot()
        registry.clear()
        _APPLIED.clear()

    def tearDown(self):
        registry.restore(self._snap)

    # --- AI_ONLY -----------------------------------------------------------

    def test_ai_only_button_auto_applies(self):
        _register_pair("ai_only", propose_when=ProposeWhen.AI_ONLY)
        sess = ProjectScope(1)
        res = dispatch("ai_only", {"v": 7}, Actor.USER_BUTTON, sess)

        self.assertEqual(res.status, "ran")
        # The accept WRITE cap ran against the stashed preview.
        self.assertEqual(_APPLIED, [{"shown": 7}])
        # The row was created then flipped to APPLIED — never left pending.
        row = Proposal.objects.get()
        self.assertEqual(row.status, Proposal.STATUS_APPLIED)
        self.assertEqual(row.source, "button")

    def test_ai_only_chat_still_proposes(self):
        _register_pair("ai_only", propose_when=ProposeWhen.AI_ONLY)
        sess = ProjectScope(1)
        res = dispatch("ai_only", {"v": 3}, Actor.CHAT, sess)

        self.assertEqual(res.status, "proposed")
        self.assertEqual(res.proposal["preview"], {"shown": 3})
        row = Proposal.objects.get()
        self.assertEqual(row.status, Proposal.STATUS_PROPOSED)
        self.assertEqual(_APPLIED, [])

    def test_ai_only_cron_auto_applies(self):
        _register_pair("ai_only", propose_when=ProposeWhen.AI_ONLY)
        res = dispatch("ai_only", {}, Actor.CRON, ProjectScope(1))
        self.assertEqual(res.status, "ran")
        self.assertEqual(Proposal.objects.get().status, Proposal.STATUS_APPLIED)

    def test_ai_only_without_accept_falls_back_to_proposing(self):
        # Defensive: AI_ONLY but no accept path → can't auto-apply, so the row
        # stays pending rather than the operation being silently lost.
        _register_pair("ai_only", propose_when=ProposeWhen.AI_ONLY, accept=False)
        res = dispatch("ai_only", {}, Actor.USER_BUTTON, ProjectScope(1))
        self.assertEqual(res.status, "proposed")
        self.assertEqual(Proposal.objects.get().status, Proposal.STATUS_PROPOSED)

    # --- ALWAYS (default, unchanged behaviour) -----------------------------

    def test_always_button_proposes(self):
        _register_pair("always")  # default ProposeWhen.ALWAYS
        res = dispatch("always", {}, Actor.USER_BUTTON, ProjectScope(1))
        self.assertEqual(res.status, "proposed")
        self.assertEqual(Proposal.objects.get().status, Proposal.STATUS_PROPOSED)


class UpdateProjectMetaAutoApplyTests(TestCase):
    """End-to-end against the real `update_project_meta` (AI_ONLY) capability —
    uses the live registry, not synthetic caps. A button edit writes the Project
    immediately; an AI edit leaves a pending proposal."""

    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="meta-autoapply@test.com", password="test",
        )
        cls.project = Project.objects.create(
            id=1, title="Existing Title", user=user,
        )

    def _project(self):
        from projects.models import Project
        return Project.objects.get(pk=1)

    def test_button_edit_auto_applies_and_writes(self):
        res = dispatch(
            "update_project_meta", {"theme": "redemption"},
            Actor.USER_BUTTON, ProjectScope(1),
        )
        self.assertEqual(res.status, "ran")
        # The singular `theme` arg is an input alias: it folds into the
        # `themes` list (the field the World form renders). Same for genre.
        self.assertEqual(self._project().themes, ["redemption"])
        row = Proposal.objects.get()
        self.assertEqual(row.status, Proposal.STATUS_APPLIED)
        self.assertEqual(row.source, "button")

    def test_ai_edit_proposes_without_writing(self):
        res = dispatch(
            "update_project_meta", {"theme": "betrayal"},
            Actor.CHAT, ProjectScope(1),
        )
        self.assertEqual(res.status, "proposed")
        # Project is untouched until the author accepts.
        self.assertEqual(self._project().themes, [])
        self.assertEqual(Proposal.objects.get().status, Proposal.STATUS_PROPOSED)

    def test_button_edit_writes_story_craft_fields(self):
        """The story-craft fields added for the World 'more metadata' form
        (logline, perspective, tense, audience, genres, tones) persist through
        the same generic gather→execute→commit path as the older fields."""
        res = dispatch(
            "update_project_meta",
            {
                "logline": "A washed-up cartographer maps a city that keeps redrawing itself.",
                "genres": ["Fantasy", "Mystery"],
                "themes": ["Identity", "Loss"],
                "tones": ["Dark", "Whimsical"],
                "perspective": "third-limited",
                "tense": "past",
                "audience": "adult",
            },
            Actor.USER_BUTTON, ProjectScope(1),
        )
        self.assertEqual(res.status, "ran")
        p = self._project()
        self.assertEqual(p.logline, "A washed-up cartographer maps a city that keeps redrawing itself.")
        self.assertEqual(p.genres, ["Fantasy", "Mystery"])
        # themes (subject) and tones (mood) are distinct lists.
        self.assertEqual(p.themes, ["Identity", "Loss"])
        self.assertEqual(p.tones, ["Dark", "Whimsical"])
        self.assertEqual(p.perspective, "third-limited")
        self.assertEqual(p.tense, "past")
        self.assertEqual(p.audience, "adult")

    def test_legacy_singular_and_label_inputs_are_canonicalized(self):
        """An AI/legacy caller that sends the singular `genre` field with a long
        comma-list label and prose choice values gets folded/coerced into the
        canonical fields the World form renders, never as an invalid code."""
        res = dispatch(
            "update_project_meta",
            {
                "genre": "Science Fiction, Psychological Thriller",
                "theme": "The struggle between power and morality.",
                "perspective": "Third-person",
                "tense": "Past tense",
                "audience": "Young adults",
            },
            Actor.USER_BUTTON, ProjectScope(1),
        )
        self.assertEqual(res.status, "ran")
        p = self._project()
        self.assertEqual(p.genres, ["Science Fiction", "Psychological Thriller"])
        self.assertEqual(p.themes, ["The struggle between power and morality."])
        self.assertEqual(p.perspective, "third-limited")
        self.assertEqual(p.tense, "past")
        self.assertEqual(p.audience, "young-adult")

    def test_accepting_stale_proposal_row_canonicalizes_on_commit(self):
        """A meta_edit proposal carrying un-canonical fields (singular genre, prose
        labels) must still commit cleanly — accept-all canonicalises defensively."""
        row = Proposal.objects.create(
            project_id=1, source="chat", page="world",
            capability="update_project_meta",
            args={"genre": "Science Fiction, Psychological Thriller"},
            proposal={"preview": {
                "type": "meta_edit",
                "project_id": 1,
                "fields": {
                    "title": "The Notebook of Justice",
                    "genre": "Science Fiction, Psychological Thriller",
                    "perspective": "Third-person",
                    "tense": "Past tense",
                },
            }},
            status=Proposal.STATUS_PROPOSED,
        )
        dispatch(
            "_accept_update_project_meta", {"proposal_id": str(row.id)},
            Actor.INTERNAL, ProjectScope(1),
        )
        p = self._project()
        self.assertEqual(p.title, "The Notebook of Justice")
        self.assertEqual(p.genres, ["Science Fiction", "Psychological Thriller"])
        self.assertEqual(p.perspective, "third-limited")
        self.assertEqual(p.tense, "past")
