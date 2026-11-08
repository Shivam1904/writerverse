"""Worldbuilding REST routes. Mounted at /api/projects/<project_pk>/worldbuildings/ (config/urls.py)."""
from rest_framework.routers import DefaultRouter

from .views import WorldbuildingViewSet

app_name = 'worldbuilding'

router = DefaultRouter()
router.register(r'', WorldbuildingViewSet, basename='worldbuilding')

urlpatterns = router.urls
