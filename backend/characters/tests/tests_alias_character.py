"""alias_character / unalias_character — fold a braindump candidate into a real
character as an alias, and un-fold it (direct WRITEs, no LLM).

The braindumps idea tree drags a candidate character branch ("Iron Man") onto a
real one ("Tony"): the candidate's name lands on Tony's `aliases`, and the tree
renders "alias of Tony" instead of the Draft button. Reversible via unalias.
"""
from actions.capabilities import Actor, dispatch
from actions.capabilities.spec import ProjectScope
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

User = get_user_model()


class AliasCharacterTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="a@e.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        from characters.models import Character
        self.tony = Character.objects.create(project_id=self.project.id, name="Tony")

    def _dispatch(self, cap, primary, alias):
        return dispatch(cap, {"primary_name": primary, "alias_name": alias},
                        Actor.USER_BUTTON, ProjectScope(self.project.id))

    def test_alias_appends_name_and_invalidates(self):
        res = self._dispatch("alias_character", "Tony", "Iron Man")
        self.assertEqual(res.status, "ran")
        self.assertIn("characters", res.invalidates)
        self.tony.refresh_from_db()
        self.assertEqual(self.tony.aliases, [{"name": "Iron Man"}])

    def test_alias_is_idempotent(self):
        self._dispatch("alias_character", "Tony", "Iron Man")
        self._dispatch("alias_character", "Tony", "iron man")  # case-insensitive
        self.tony.refresh_from_db()
        self.assertEqual(self.tony.aliases, [{"name": "Iron Man"}])

    def test_alias_to_another_real_character_carries_cross_ref(self):
        """If the alias name matches another real row, the entry carries its id
        (the documented cross-ref shape) — but that row is NOT deleted."""
        from characters.models import Character
        stark = Character.objects.create(project_id=self.project.id, name="Tony Stark")
        self._dispatch("alias_character", "Tony", "Tony Stark")
        self.tony.refresh_from_db()
        self.assertEqual(self.tony.aliases, [{"name": "Tony Stark", "character_id": stark.id}])
        self.assertTrue(Character.objects.filter(id=stark.id).exists())

    def test_unalias_removes_name(self):
        self._dispatch("alias_character", "Tony", "Iron Man")
        res = self._dispatch("unalias_character", "Tony", "Iron Man")
        self.assertEqual(res.status, "ran")
        self.assertIn("characters", res.invalidates)
        self.tony.refresh_from_db()
        self.assertEqual(self.tony.aliases, [])

    def test_alias_unknown_primary_errors(self):
        res = self._dispatch("alias_character", "Ghost", "Iron Man")
        self.assertEqual(res.status, "error")
        self.assertEqual(res.http_status, 404)

    def test_alias_missing_args_errors(self):
        res = dispatch("alias_character", {"primary_name": "Tony"},
                       Actor.USER_BUTTON, ProjectScope(self.project.id))
        self.assertEqual(res.status, "error")
        self.assertEqual(res.http_status, 400)
