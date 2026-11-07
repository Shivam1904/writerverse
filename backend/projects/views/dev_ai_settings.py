"""
Dev-Only AI Tool Settings View
Allows developers to control which AI tools are available to the AI agent per project.
Only available in local dev (settings.LOCAL_DEV).
"""
import logging

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..scoping import owned_project_or_404

logger = logging.getLogger(__name__)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def dev_ai_settings(request, project_pk):
    """
    Get or update AI tool settings for a project.
    Only available in local dev (settings.LOCAL_DEV).
    """
    if not settings.LOCAL_DEV:
        return Response(
            {'error': 'This endpoint is only available in development mode'},
            status=status.HTTP_404_NOT_FOUND
        )

    project = owned_project_or_404(request, project_pk)

    if request.method == 'GET':
        settings_data = project.ai_tool_settings or {}
        return Response(settings_data)

    elif request.method == 'PATCH':
        data = request.data
        disabled_tools = data.get('disabled_tools', [])
        disabled_planners = data.get('disabled_planners', [])

        # Validate that inputs are lists
        if not isinstance(disabled_tools, list) or not isinstance(disabled_planners, list):
            return Response(
                {'error': 'disabled_tools and disabled_planners must be arrays'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Update the project
        project.ai_tool_settings = {
            'disabled_tools': disabled_tools,
            'disabled_planners': disabled_planners,
        }
        project.save()

        logger.info(
            f'Updated AI tool settings for project {project_pk}: '
            f'disabled_tools={disabled_tools}, disabled_planners={disabled_planners}'
        )

        return Response(project.ai_tool_settings, status=status.HTTP_200_OK)
