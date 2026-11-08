"""Character REST routes. Mounted at /api/projects/<project_pk>/characters/ (config/urls.py)."""
from rest_framework.routers import DefaultRouter

from .views import CharacterViewSet

app_name = 'characters'

router = DefaultRouter()
router.register(r'', CharacterViewSet, basename='project-character')

urlpatterns = router.urls
