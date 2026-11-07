"""
Project Management ViewSets
Clean, consistent ViewSets following DRF best practices
"""
import logging

from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Project
from ..serializers import (
    ProjectListSerializer,
    ProjectSerializer,
)
from ..signals import domains_changed

logger = logging.getLogger(__name__)

PROJECT_TAG = "Projects"


@extend_schema_view(
    list=extend_schema(tags=[PROJECT_TAG]),
    retrieve=extend_schema(tags=[PROJECT_TAG]),
    create=extend_schema(tags=[PROJECT_TAG]),
    update=extend_schema(tags=[PROJECT_TAG]),
    partial_update=extend_schema(tags=[PROJECT_TAG]),
    destroy=extend_schema(tags=[PROJECT_TAG]),
)
class ProjectViewSet(viewsets.ModelViewSet):
    """
    Project ViewSet with clean CRUD operations and custom actions
    """
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    # The library shows every book at once, so the list is one plain array.
    # The global DRF page size (20) would hide book 21 and up (wrt-90).
    pagination_class = None

    def get_queryset(self):
        """Filter projects by authenticated user with optimized queries"""
        return Project.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == 'list':
            return ProjectListSerializer
        return ProjectSerializer

    def perform_create(self, serializer):
        """Set user on project creation"""
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        """Save, then tell the project's other open tabs it changed."""
        project = serializer.save()
        try:  # the edit is saved; a failed bump must not turn it into a 500
            domains_changed.send(sender=type(self), project_id=project.id,
                                 domains=["project_meta"])
        except Exception:  # noqa: BLE001
            logger.exception("project_meta version bump failed project=%s", project.id)

    def destroy(self, request, *args, **kwargs):
        """Permanent delete. Only a book already in "Deleted books" (archived)
        can be erased, so one stray click or request can't wipe a manuscript."""
        instance = self.get_object()
        if instance.archived_at is None:
            return Response(
                {'error': 'Move the book to Deleted books before deleting it permanently.'},
                status=status.HTTP_409_CONFLICT,
            )
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(tags=[PROJECT_TAG])
    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Move a book to "Deleted books". All its data is kept."""
        project = self.get_object()
        if project.archived_at is None:
            project.archived_at = timezone.now()
            project.save(update_fields=['archived_at'])
        return Response({'status': 'Project archived', 'archived_at': project.archived_at})

    @extend_schema(tags=[PROJECT_TAG])
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Bring a book back from "Deleted books" to the library."""
        project = self.get_object()
        project.archived_at = None
        project.save(update_fields=['archived_at'])
        return Response({'status': 'Project restored', 'archived_at': None})
