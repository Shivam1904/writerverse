"""Notification endpoints + sender helper.

Plain DRF views (not the capability facade) — notifications are informational,
not proposals. The frontend polls these via TanStack; there is no push.

Sender contract (`create_notification` / POST): markdown `content`, an optional
`target_url` to navigate to on click, and a `slug` that selects the card glyph.
"""

import logging
from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from projects.scoping import owned_project_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification

logger = logging.getLogger("writerverse.notifications")

# The GET is polled every minute, so it returns only the newest rows of each
# list. The rail and the bell show a handful; older ones stay in the DB until
# pruned. `active_total` tells the client how many active ones exist in all.
LIST_LIMIT = 50
# Archived (dismissed / clicked) notifications are deleted after this many days.
# Active ones are never pruned: the author has not seen them yet.
ARCHIVED_RETENTION_DAYS = 30


def prune_archived(project_id) -> int:
    """Delete this project's archived notifications older than the retention."""
    cutoff = timezone.now() - timedelta(days=ARCHIVED_RETENTION_DAYS)
    deleted, _ = Notification.objects.filter(
        project_id=project_id,
        status=Notification.STATUS_ARCHIVED,
        archived_at__lt=cutoff,
    ).delete()
    return deleted


def _serialize(n: Notification) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "content": n.content,
        "target_url": n.target_url,
        "slug": n.slug,
        "status": n.status,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


def create_notification(
    project,
    content: str,
    target_url: str = "",
    slug: str = "",
    title: str = "",
) -> Notification:
    """Sender entry point. `project` is a Project instance or its id."""
    project_id = getattr(project, "id", project)
    n = Notification.objects.create(
        project_id=project_id,
        content=content or "",
        target_url=target_url or "",
        slug=slug or "",
        title=title or "",
    )
    logger.info("notification.create project=%s slug=%s id=%s",
                project_id, slug, n.id)
    # Tidy on write (same idea as activity.prune_old_events): every new
    # notification clears out the project's long-dismissed ones.
    prune_archived(project_id)
    return n


class NotificationsView(APIView):
    """GET  — { active: [...], archived: [...], active_total } for the rail +
           the bell; each list is the newest LIST_LIMIT rows.
    POST — create one {content, target_url?, slug?, title?} (sender)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, project_pk):
        project = owned_project_or_404(request, project_pk)
        qs = Notification.objects.filter(project=project).order_by("-created_at")
        active_qs = qs.filter(status=Notification.STATUS_ACTIVE)
        archived_qs = qs.filter(status=Notification.STATUS_ARCHIVED)
        return Response({
            "active": [_serialize(n) for n in active_qs[:LIST_LIMIT]],
            "archived": [_serialize(n) for n in archived_qs[:LIST_LIMIT]],
            "active_total": active_qs.count(),
        })

    def post(self, request, project_pk):
        project = owned_project_or_404(request, project_pk)
        content = (request.data.get("content") or "").strip()
        if not content:
            return Response({"error": "content is required"},
                            status=status.HTTP_400_BAD_REQUEST)
        n = create_notification(
            project,
            content=content,
            target_url=(request.data.get("target_url") or "").strip(),
            slug=(request.data.get("slug") or "").strip(),
            title=(request.data.get("title") or "").strip(),
        )
        return Response(_serialize(n), status=status.HTTP_201_CREATED)


class NotificationArchiveView(APIView):
    """POST — archive one (dismiss / click-through). Idempotent."""

    permission_classes = [IsAuthenticated]

    def post(self, request, project_pk, notif_pk):
        project = owned_project_or_404(request, project_pk)
        n = get_object_or_404(Notification, id=notif_pk, project=project)
        if n.status != Notification.STATUS_ARCHIVED:
            n.status = Notification.STATUS_ARCHIVED
            n.archived_at = timezone.now()
            n.save(update_fields=["status", "archived_at"])
        return Response(_serialize(n))
