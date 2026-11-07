"""Per-field metadata proposals — the character-studio mechanism on the World page.

An AI `update_project_meta` now lands a `meta_edit` proposal whose fields are
reviewed one at a time:
  • get_project_meta_full wraps every field {actual_value, proposal?, proposed_value?}
  • accept_project_meta_field writes ONE field + drops it from the proposal
  • reject_project_meta_field drops ONE field, writes nothing
  • update_proposed_meta_field edits a pending value in place
  • the proposal closes (APPLIED) once no field remains

A real Project row (id=1) backs the Proposal FK; dispatch runs against
ProjectScope(1).
"""
from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from actions.models import Proposal
from django.test import TestCase


class MetaPerFieldTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model

        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="meta-perfield@test.com", password="test",
        )
        # A title exists so no accept path ever needs the auto-title LLM.
        cls.project = Project.objects.create(
            id=1, title="Existing Title", synopsis="old synopsis", user=user,
        )

    def _project(self):
        from projects.models import Project
        return Project.objects.get(pk=1)

    def _propose(self, **fields):
        """AI proposes an edit → one pending meta_edit proposal. Returns its id."""
        res = dispatch("update_project_meta", fields, Actor.CHAT, ProjectScope(1))
        self.assertEqual(res.status, "proposed")
        return Proposal.objects.get(status=Proposal.STATUS_PROPOSED).id

    def _full(self):
        res = dispatch("get_project_meta_full", {}, Actor.USER_BUTTON, ProjectScope(1))
        self.assertEqual(res.status, "ran")
        return res.result["meta"]

    # --- get_project_meta_full wrapping ------------------------------------

    def test_full_wraps_actual_and_proposed(self):
        pid = self._propose(synopsis="a sharper synopsis", genres=["Fantasy"])
        meta = self._full()
        # Proposed fields carry proposal + proposed_value over their actual value.
        self.assertEqual(meta["synopsis"]["actual_value"], "old synopsis")
        self.assertEqual(meta["synopsis"]["proposed_value"], "a sharper synopsis")
        self.assertEqual(meta["synopsis"]["proposal"], pid)
        self.assertEqual(meta["genres"]["proposed_value"], ["Fantasy"])
        # An untouched field is wrapped too, but carries no proposal keys.
        self.assertEqual(meta["logline"]["actual_value"], "")
        self.assertNotIn("proposed_value", meta["logline"])

    # --- accept one field --------------------------------------------------

    def test_accept_one_field_writes_and_shrinks(self):
        pid = self._propose(synopsis="new synopsis", genres=["Fantasy"])
        dispatch(
            "accept_project_meta_field",
            {"proposal_id": str(pid), "field": "synopsis", "value": "new synopsis"},
            Actor.USER_BUTTON, ProjectScope(1),
        )
        # The accepted field landed on the Project; the row stays pending with
        # only the un-accepted field left.
        self.assertEqual(self._project().synopsis, "new synopsis")
        row = Proposal.objects.get(id=pid)
        self.assertEqual(row.status, Proposal.STATUS_PROPOSED)
        self.assertEqual(set(row.proposal["preview"]["fields"]), {"genres"})

    def test_authored_value_wins_over_proposed(self):
        pid = self._propose(synopsis="ai version")
        dispatch(
            "accept_project_meta_field",
            {"proposal_id": str(pid), "field": "synopsis", "value": "my edited version"},
            Actor.USER_BUTTON, ProjectScope(1),
        )
        self.assertEqual(self._project().synopsis, "my edited version")

    def test_accept_list_field(self):
        pid = self._propose(genres=["Fantasy", "Mystery"])
        dispatch(
            "accept_project_meta_field",
            {"proposal_id": str(pid), "field": "genres",
             "value": ["Fantasy", "Mystery"]},
            Actor.USER_BUTTON, ProjectScope(1),
        )
        self.assertEqual(self._project().genres, ["Fantasy", "Mystery"])
        self.assertEqual(Proposal.objects.get(id=pid).status, Proposal.STATUS_APPLIED)

    # --- reject one field --------------------------------------------------

    def test_reject_one_field_writes_nothing(self):
        pid = self._propose(synopsis="unwanted", genres=["Fantasy"])
        dispatch(
            "reject_project_meta_field",
            {"proposal_id": str(pid), "field": "synopsis"},
            Actor.USER_BUTTON, ProjectScope(1),
        )
        self.assertEqual(self._project().synopsis, "old synopsis")  # untouched
        row = Proposal.objects.get(id=pid)
        self.assertEqual(row.status, Proposal.STATUS_PROPOSED)
        self.assertEqual(set(row.proposal["preview"]["fields"]), {"genres"})

    # --- proposal closes once empty ----------------------------------------

    def test_proposal_closes_when_last_field_resolved(self):
        pid = self._propose(synopsis="new", logline="hook")
        for field in ("synopsis", "logline"):
            dispatch(
                "accept_project_meta_field",
                {"proposal_id": str(pid), "field": field, "value": None},
                Actor.USER_BUTTON, ProjectScope(1),
            )
        self.assertEqual(Proposal.objects.get(id=pid).status, Proposal.STATUS_APPLIED)
        # Both fields landed (value=None → the proposed value is used).
        p = self._project()
        self.assertEqual(p.synopsis, "new")
        self.assertEqual(p.logline, "hook")

    # --- edit a pending value in place -------------------------------------

    def test_update_proposed_field_edits_pending_value(self):
        pid = self._propose(logline="rough hook")
        dispatch(
            "update_proposed_meta_field",
            {"proposal_id": str(pid), "field": "logline", "value": "polished hook"},
            Actor.USER_BUTTON, ProjectScope(1),
        )
        # Still pending, Project untouched, but the proposed value changed.
        row = Proposal.objects.get(id=pid)
        self.assertEqual(row.status, Proposal.STATUS_PROPOSED)
        self.assertEqual(row.proposal["preview"]["fields"]["logline"], "polished hook")
        self.assertEqual(self._project().logline, "")
        # Accepting now lands the edited value.
        dispatch(
            "accept_project_meta_field",
            {"proposal_id": str(pid), "field": "logline", "value": None},
            Actor.USER_BUTTON, ProjectScope(1),
        )
        self.assertEqual(self._project().logline, "polished hook")

    # --- sibling supersede: a resolved field is cleared everywhere ----------

    def _propose_new(self, **fields):
        """Propose an edit and return the id of the freshly created proposal
        (the default `_propose` assumes a single pending row)."""
        before = set(Proposal.objects.values_list("id", flat=True))
        res = dispatch("update_project_meta", fields, Actor.CHAT, ProjectScope(1))
        self.assertEqual(res.status, "proposed")
        return (set(Proposal.objects.values_list("id", flat=True)) - before).pop()

    def test_accept_field_supersedes_same_field_in_other_proposals(self):
        """Accepting `synopsis` on the newer proposal drops `synopsis` from an
        older sibling (no resurface) while leaving the sibling's other field."""
        pid_old = self._propose_new(synopsis="old take", logline="hook")
        pid_new = self._propose_new(synopsis="sharp take")

        dispatch(
            "accept_project_meta_field",
            {"proposal_id": str(pid_new), "field": "synopsis", "value": "sharp take"},
            Actor.USER_BUTTON, ProjectScope(1),
        )
        self.assertEqual(self._project().synopsis, "sharp take")
        old = Proposal.objects.get(id=pid_old)
        self.assertNotIn("synopsis", old.proposal["preview"]["fields"])  # no resurface
        self.assertIn("logline", old.proposal["preview"]["fields"])      # other field kept
        self.assertEqual(old.status, Proposal.STATUS_PROPOSED)

    def test_reject_field_supersedes_and_closes_emptied_sibling(self):
        """Rejecting `synopsis` clears it from a sibling too; a sibling left empty
        by the drop is closed REJECTED."""
        pid_old = self._propose_new(synopsis="old take")   # only synopsis
        pid_new = self._propose_new(synopsis="sharp take", logline="hook")

        dispatch(
            "reject_project_meta_field",
            {"proposal_id": str(pid_new), "field": "synopsis"},
            Actor.USER_BUTTON, ProjectScope(1),
        )
        self.assertEqual(self._project().synopsis, "old synopsis")  # nothing written
        old = Proposal.objects.get(id=pid_old)
        self.assertNotIn("synopsis", old.proposal["preview"]["fields"])
        self.assertEqual(old.status, Proposal.STATUS_REJECTED)  # emptied → closed

    # --- title clobber guards (UX_FINDINGS 2026-07-02 F1.2) -----------------

    def test_gather_drops_empty_title(self):
        """The AI often passes every field it knows, blank ones included — an
        empty title must never enter the proposal (it would blank the book's
        name on accept-all)."""
        pid = self._propose(title="", synopsis="a new synopsis")
        row = Proposal.objects.get(id=pid)
        self.assertNotIn("title", row.proposal["preview"]["fields"])
        self.assertIn("synopsis", row.proposal["preview"]["fields"])

    def test_commit_skips_empty_title_from_legacy_proposal(self):
        """Proposals authored before the gather guard can still carry
        `title: ""` — the accept-all commit must skip it, not setattr it."""
        from types import SimpleNamespace

        from projects.capabilities.commit import commit_update_project_meta
        commit_update_project_meta(
            SimpleNamespace(project_id=1),
            {"preview": {"project_id": 1,
                         "fields": {"title": "", "synopsis": "kept synopsis"}}},
        )
        p = self._project()
        self.assertEqual(p.title, "Existing Title")     # not clobbered
        self.assertEqual(p.synopsis, "kept synopsis")   # rest still lands


class BookTitleIsAuthorAskedTests(TestCase):
    """wrt-104: the AI names the book only when the author clicks "Suggest a
    title" (generate_title with `from_project`), never inside an accept."""

    def setUp(self):
        from django.contrib.auth import get_user_model

        from projects.models import Project
        user = get_user_model().objects.create_user(email="untitled@test.com", password="x")
        self.project = Project.objects.create(title="", synopsis="", user=user)
        self.scope = ProjectScope(self.project.id)

    def test_synopsis_on_untitled_book_calls_no_ai(self):
        from unittest.mock import patch

        from projects.models import Project
        with patch("projects.capabilities.execute_titles.generate_title") as titler:
            res = dispatch("update_project_meta", {"synopsis": "A lake that burns."},
                           Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.status, "ran")
        titler.assert_not_called()
        p = Project.objects.get(pk=self.project.pk)
        self.assertEqual(p.synopsis, "A lake that burns.")
        self.assertEqual(p.title, "")

    def test_from_project_titles_from_synopsis_and_ideas(self):
        from unittest.mock import patch

        from braindumps.models import Braindump

        from projects.models import Project
        Project.objects.filter(pk=self.project.pk).update(synopsis="A lake that burns.")
        Braindump.objects.create(project=self.project, title="Idea", content="The ferryman lies.")
        with patch("projects.capabilities.execute_titles.generate_title",
                   return_value={"title": "The Ember Lake", "alternatives": []}) as titler:
            res = dispatch("generate_title", {"from_project": True},
                           Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.status, "ran", res.error)
        self.assertEqual(res.result["title"], "The Ember Lake")
        desc = titler.call_args.args[0]
        self.assertIn("A lake that burns.", desc)
        self.assertIn("The ferryman lies.", desc)
        # Suggesting writes nothing: the author decides whether to keep it.
        self.assertEqual(Project.objects.get(pk=self.project.pk).title, "")

    def test_from_project_with_nothing_written_says_what_to_do(self):
        from unittest.mock import patch
        with patch("projects.capabilities.execute_titles.generate_title") as titler:
            res = dispatch("generate_title", {"from_project": True},
                           Actor.USER_BUTTON, self.scope)
        self.assertEqual(res.status, "error")
        self.assertIn("synopsis", res.error)
        titler.assert_not_called()
