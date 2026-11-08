import logging

from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from projects.scoping import ProjectScopedMixin
from rest_framework import permissions, viewsets

from braindumps.models import Braindump
from braindumps.serializers import BraindumpCreateSerializer, BraindumpSerializer

logger = logging.getLogger(__name__)

BRAINDUMP_TAG = "Braindumps"


@extend_schema_view(
    list=extend_schema(tags=[BRAINDUMP_TAG]),
    retrieve=extend_schema(tags=[BRAINDUMP_TAG]),
    create=extend_schema(tags=[BRAINDUMP_TAG]),
    update=extend_schema(tags=[BRAINDUMP_TAG]),
    partial_update=extend_schema(tags=[BRAINDUMP_TAG]),
    destroy=extend_schema(tags=[BRAINDUMP_TAG]),
)
class BraindumpViewSet(ProjectScopedMixin, viewsets.ModelViewSet):
    """Project-nested CRUD; the project comes from the URL only (ProjectScopedMixin)."""
    stale_domain = "braindumps"
    queryset = Braindump.objects.all()
    # The frontend reads the whole list as one array; the global DRF page size
    # (20) would hide entry 21 and up (same as the book list, wrt-90).
    pagination_class = None
    serializer_class = BraindumpSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return BraindumpCreateSerializer
        return BraindumpSerializer

    def perform_destroy(self, instance):
        # Soft delete, same as the delete_braindump op (Undo can bring it back).
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['deleted_at', 'updated_at'])
