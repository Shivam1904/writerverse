"""Awareness layer — evaluate() rules and gates, run in shadow mode (logged only)."""
from datetime import timedelta
from types import SimpleNamespace

from activity.models import ActivityEvent
from django.test import TestCase
from django.utils import timezone

from actions.awareness.evaluate import evaluate, run_shadow_nudges
from actions.capabilities import Actor, ProjectScope, dispatch


class WobbleAndGateTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from projects.models import Project
        user = get_user_model().objects.create_user(
            email="awareness@test.com", password="test",
        )
        cls.project = Project.objects.create(title="T", user=user)

    def _ctx(self, scenes, characters=()):
        from characters.models import Character
        from projects.models import Project
        Project.objects.filter(pk=self.project.pk).update(total_scenes=scenes)
        Character.all_objects.filter(project=self.project).delete()
        for name in characters:
            Character.objects.create(project=self.project, name=name)
        return SimpleNamespace(project_id=self.project.id, actor=Actor.USER_BUTTON)

    def test_wobble_fires_on_thresholds(self):
        out = evaluate(self._ctx(3, ["A", "B"]))
        self.assertIn("wobble_nudge", [s["rule"] for s in out["suggest"]])

    def test_no_wobble_below_threshold(self):
        out = evaluate(self._ctx(2, ["A", "B"]))
        self.assertNotIn("wobble_nudge", [s["rule"] for s in out["suggest"]])

    def test_verdict_withheld_below_6(self):
        out = evaluate(self._ctx(4))
        self.assertTrue(out["gates"].get("verdict_withheld"))
        self.assertNotIn("verdict_ready", out["gates"])

    def test_verdict_ready_at_15(self):
        out = evaluate(self._ctx(15))
        self.assertTrue(out["gates"].get("verdict_ready"))

    def test_signals_returned(self):
        out = evaluate(self._ctx(5, ["A"]))
        self.assertEqual(out["signals"]["scene_count"], 5)
        self.assertEqual(out["signals"]["people_count"], 1)
        self.assertEqual(out["signals"]["days_since_visit"], 9999)  # never checked
        self.assertNotIn("events", out["signals"])

    def test_evaluate_writes_nothing(self):
        evaluate(self._ctx(5, ["A", "B"]))
        self.assertFalse(ActivityEvent.objects.exists())

    # ── shadow mode ───────────────────────────────────────────────────
    def test_shadow_run_logs_what_would_fire(self):
        run_shadow_nudges(self._ctx(3, ["A", "B"]))
        ev = ActivityEvent.objects.get(kind=ActivityEvent.NUDGE)
        self.assertEqual(ev.name, "wobble_nudge")
        self.assertEqual(ev.details["signals"]["scene_count"], 3)

    def test_shadow_run_is_throttled(self):
        ctx = self._ctx(1)
        run_shadow_nudges(ctx)
        run_shadow_nudges(ctx)  # within 30 minutes → skipped
        self.assertEqual(ActivityEvent.objects.filter(kind=ActivityEvent.NUDGE).count(), 1)

        ActivityEvent.objects.update(created_at=timezone.now() - timedelta(minutes=31))
        run_shadow_nudges(ctx)
        self.assertEqual(ActivityEvent.objects.filter(kind=ActivityEvent.NUDGE).count(), 2)

    def test_days_since_visit_uses_last_check(self):
        ctx = self._ctx(1)
        run_shadow_nudges(ctx)
        ActivityEvent.objects.update(created_at=timezone.now() - timedelta(days=3))
        self.assertEqual(evaluate(ctx)["signals"]["days_since_visit"], 3)

    def test_page_load_triggers_shadow_check_but_chat_does_not(self):
        self._ctx(3, ["A", "B"])
        session = ProjectScope(self.project.id)
        dispatch("get_project_meta", {}, Actor.CHAT, session)
        self.assertFalse(ActivityEvent.objects.exists())
        res = dispatch("get_project_meta", {}, Actor.USER_BUTTON, session)
        self.assertEqual(res.status, "ran")
        self.assertEqual(ActivityEvent.objects.filter(kind=ActivityEvent.NUDGE).count(), 1)
