import logging

from common.errors import error_response
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from projects.scoping import ProjectScopedMixin
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Character
from ..serializers import (
    CharacterCreateSerializer,
    CharacterSerializer,
)

logger = logging.getLogger(__name__)
CHARACTER_TAG = "Characters"


@extend_schema_view(
    list=extend_schema(tags=[CHARACTER_TAG]),
    retrieve=extend_schema(tags=[CHARACTER_TAG]),
    create=extend_schema(tags=[CHARACTER_TAG]),
    update=extend_schema(tags=[CHARACTER_TAG]),
    partial_update=extend_schema(tags=[CHARACTER_TAG]),
    destroy=extend_schema(tags=[CHARACTER_TAG]),
)
class CharacterViewSet(ProjectScopedMixin, viewsets.ModelViewSet):
    """Project-nested CRUD for characters; the project comes from the URL only (ProjectScopedMixin)."""
    stale_domain = "characters"
    queryset = Character.objects.all()
    # The frontend reads the whole list as one array; the global DRF page size
    # (20) would hide entry 21 and up (same as the book list, wrt-90).
    pagination_class = None
    serializer_class = CharacterSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        qs = queryset
        if self.action == 'list' and not self.request.query_params.get('include_archived'):
            qs = qs.exclude(status='archived')
        return qs

    def get_serializer_class(self):
        if self.action == 'create':
            return CharacterCreateSerializer
        return CharacterSerializer

    def perform_destroy(self, instance):
        # Soft delete, same as the delete_character op (Undo can bring it back).
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['deleted_at', 'updated_at'])

    @extend_schema(tags=[CHARACTER_TAG])
    @action(detail=False, methods=['get'])
    def main_characters(self, request):
        characters = self.get_queryset().filter(is_main_character=True)
        serializer = self.get_serializer(characters, many=True)
        return Response(serializer.data)

    @extend_schema(tags=[CHARACTER_TAG])
    @action(detail=False, methods=['post'], url_path='commit_generated')
    def commit_generated_characters(self, request, project_pk=None):
        """Persist a user-curated subset of AI-generated character previews."""
        project = self.get_project()
        characters_payload = request.data.get('characters') or []
        if not isinstance(characters_payload, list) or not characters_payload:
            return Response(
                {'error': 'characters must be a non-empty list'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            created_characters = []
            protagonist_assigned = False
            antagonist_assigned = False
            with transaction.atomic():
                for char_data in characters_payload:
                    role_type = (char_data.get('type') or '').strip()
                    role_key = role_type.lower()
                    is_protagonist = role_key == 'protagonist' and not protagonist_assigned
                    is_antagonist = role_key == 'antagonist' and not antagonist_assigned
                    is_main_character = is_protagonist or is_antagonist or role_key in {'main character', 'main'}
                    if is_protagonist:
                        protagonist_assigned = True
                    if is_antagonist:
                        antagonist_assigned = True
                    character = Character.objects.create(
                        project=project,
                        name=char_data['name'],
                        type=role_type,
                        story=char_data.get('story', ''),
                        want=char_data.get('want', ''),
                        need=char_data.get('need', ''),
                        misbelief=char_data.get('misbelief', ''),
                        is_protagonist=is_protagonist,
                        is_antagonist=is_antagonist,
                        is_main_character=is_main_character,
                    )
                    created_characters.append(character)
            serializer = self.get_serializer(created_characters, many=True)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return error_response(
                e,
                operation="character.commit_generated",
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                project_id=project.id,
                log=logger,
            )

    @extend_schema(tags=[CHARACTER_TAG])
    @action(detail=False, methods=['get'], url_path='name-collisions')
    def name_collisions(self, request, project_pk=None):
        """Return name-collision warnings for all active characters in the project."""
        from characters.name_sources import world_names
        from characters.services.name_collision_service import detect_name_collisions

        project = self.get_project()
        characters = list(
            Character.objects.filter(project=project)
            .exclude(status='archived')
            .values_list('name', flat=True)
        )
        collisions = detect_name_collisions(characters, world_names(project))
        return Response({'collisions': collisions})
