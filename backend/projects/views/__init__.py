"""
Views package for projects app.

Only exports views that actually live in projects/views/.
All other views are imported directly from their domain apps in urls.py.
"""
from .dev_ai_settings import dev_ai_settings
from .project import ProjectViewSet

__all__ = [
    'ProjectViewSet',
    'dev_ai_settings',
]
