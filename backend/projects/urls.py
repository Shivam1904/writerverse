"""
Project URLs. Mounted at /api/projects/ (config/urls.py).

Character, braindump and worldbuilding routes nest under /api/projects/<id>/
too, but each app declares them in its own urls.py; config/urls.py mounts them.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views.dev_ai_settings import dev_ai_settings
from .views.project import ProjectViewSet

app_name = 'projects'

router = DefaultRouter()
router.register(r'', ProjectViewSet, basename='project')

urlpatterns = [
    path('', include(router.urls)),
    path('<int:project_pk>/dev/ai-settings/', dev_ai_settings, name='dev-ai-settings'),
]
