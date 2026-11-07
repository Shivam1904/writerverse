"""The developer debug log: writers, history, pruning."""
from datetime import timedelta
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from projects.models import Project

from activity.models import ActivityEvent
from activity.store import log_step, prune_old_events


class ActivityStoreTest(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(email="act@x.io", password="pw")
        self.project = Project.objects.create(user=user, title="P")
        self.ctx = SimpleNamespace(project_id=self.project.id)

    def test_log_step_keeps_history(self):
        for n in (11, 4):
            log_step(self.ctx, "extract",
                     {"ran_at": "2026-06-21T17:45:16+00:00"},
                     braindumps_processed=n)
        rows = ActivityEvent.objects.filter(kind=ActivityEvent.STEP, name="extract")
        self.assertEqual(rows.count(), 2)  # the old blob kept only the last run
        ev = rows.first()
        self.assertEqual(ev.details["ran_at"], "2026-06-21T17:45:16+00:00")
        self.assertEqual(ev.details["braindumps_processed"], 4)

    def test_bad_input_never_raises(self):
        log_step(self.ctx, "extract", None)
        log_step(SimpleNamespace(project_id=None), "extract", {})
        self.assertEqual(ActivityEvent.objects.filter(kind=ActivityEvent.STEP).count(), 1)

    def test_prune_drops_only_old_rows_of_that_project(self):
        log_step(self.ctx, "old", {})
        log_step(self.ctx, "new", {})
        ActivityEvent.objects.filter(name="old").update(
            created_at=timezone.now() - timedelta(days=31))
        self.assertEqual(prune_old_events(self.project.id), 1)
        self.assertEqual(list(ActivityEvent.objects.values_list("name", flat=True)), ["new"])

    def test_deleting_project_deletes_its_log(self):
        log_step(self.ctx, "extract", {})
        self.project.delete()
        self.assertFalse(ActivityEvent.objects.exists())
