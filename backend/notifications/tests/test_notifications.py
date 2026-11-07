"""Notifications GET is bounded (it is polled) and old archived rows are pruned."""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from projects.models import Project
from rest_framework.test import APIClient

from notifications.models import Notification
from notifications.notifications import (
    ARCHIVED_RETENTION_DAYS,
    create_notification,
    prune_archived,
)

User = get_user_model()


class NotificationsListTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="n@t.com", password="x")
        self.project = Project.objects.create(title="P", user=self.user)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = f"/api/consistency/projects/{self.project.id}/notifications/"

    @patch("notifications.notifications.LIST_LIMIT", 3)
    def test_lists_are_capped_newest_first_with_active_total(self):
        for i in range(5):
            Notification.objects.create(project=self.project, content=f"a{i}")
        Notification.objects.create(
            project=self.project, content="old", status=Notification.STATUS_ARCHIVED,
            archived_at=timezone.now(),
        )
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["active"]), 3)
        self.assertEqual(r.data["active_total"], 5)
        self.assertEqual([n["content"] for n in r.data["archived"]], ["old"])
        ids = [n["id"] for n in r.data["active"]]
        self.assertEqual(ids, sorted(ids, reverse=True))

    def test_other_users_project_is_404(self):
        other = User.objects.create_user(email="o@t.com", password="x")
        p2 = Project.objects.create(title="Q", user=other)
        r = self.client.get(f"/api/consistency/projects/{p2.id}/notifications/")
        self.assertEqual(r.status_code, 404)


class PruneTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(email="p@t.com", password="x")
        self.project = Project.objects.create(title="P", user=user)

    def _archived(self, days_ago):
        return Notification.objects.create(
            project=self.project, content="x", status=Notification.STATUS_ARCHIVED,
            archived_at=timezone.now() - timedelta(days=days_ago),
        )

    def test_prunes_only_old_archived(self):
        self._archived(ARCHIVED_RETENTION_DAYS + 1)
        recent = self._archived(1)
        active = Notification.objects.create(project=self.project, content="live")
        self.assertEqual(prune_archived(self.project.id), 1)
        left = set(Notification.objects.values_list("id", flat=True))
        self.assertEqual(left, {recent.id, active.id})

    def test_create_notification_prunes(self):
        old = self._archived(ARCHIVED_RETENTION_DAYS + 5)
        create_notification(self.project, content="new")
        self.assertFalse(Notification.objects.filter(id=old.id).exists())
