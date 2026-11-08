"""Braindump REST routes. Mounted at /api/projects/<project_pk>/braindumps/ (config/urls.py)."""
from rest_framework.routers import DefaultRouter

from .views import BraindumpViewSet

app_name = 'braindumps'

router = DefaultRouter()
router.register(r'', BraindumpViewSet, basename='project-braindump')

urlpatterns = router.urls
