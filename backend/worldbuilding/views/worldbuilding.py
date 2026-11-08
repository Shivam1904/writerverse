import logging

from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from projects.scoping import ProjectScopedMixin
from rest_framework import permissions, viewsets

from worldbuilding.models import Worldbuilding
from worldbuilding.serializers import (
    WorldbuildingCreateSerializer,
    WorldbuildingSerializer,
)

logger = logging.getLogger(__name__)

WORLD_BUILDING_TAG = "Worldbuilding"


@extend_schema_view(
    list=extend_schema(tags=[WORLD_BUILDING_TAG]),
    retrieve=extend_schema(tags=[WORLD_BUILDING_TAG]),
    create=extend_schema(tags=[WORLD_BUILDING_TAG]),
    update=extend_schema(tags=[WORLD_BUILDING_TAG]),
    partial_update=extend_schema(tags=[WORLD_BUILDING_TAG]),
    destroy=extend_schema(tags=[WORLD_BUILDING_TAG]),
)
class WorldbuildingViewSet(ProjectScopedMixin, viewsets.ModelViewSet):
    """Project-nested CRUD; the project comes from the URL only (ProjectScopedMixin)."""
    stale_domain = "worldbuilding"
    queryset = Worldbuilding.objects.all()
    # The frontend reads the whole list as one array; the global DRF page size
    # (20) would hide entry 21 and up (same as the book list, wrt-90).
    pagination_class = None
    serializer_class = WorldbuildingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'list' and not self.request.query_params.get('include_archived'):
            qs = qs.exclude(status='archived')
        return qs

    def get_serializer_class(self):
        if self.action == 'create':
            return WorldbuildingCreateSerializer
        return WorldbuildingSerializer

    def perform_destroy(self, instance):
        # Soft delete, same as the delete_worldbuilding op (Undo can bring it back).
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['deleted_at', 'updated_at'])
