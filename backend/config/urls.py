"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.apps import apps
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from . import views

# Dev convenience (local dev only: DEBUG + local runtime + localhost frontend): surface EVERY model in the Django admin. This
# module is imported after admin.autodiscover() has run, so the hand-written
# ModelAdmins (projects/charts/accounts) are already registered and preserved —
# anything already registered is skipped; everything else gets a default admin.
if settings.LOCAL_DEV:
    for _model in apps.get_models():
        try:
            admin.site.register(_model)
        except admin.sites.AlreadyRegistered:
            pass

urlpatterns = [
    path("", views.root, name="root"),
    path("health/", views.health_check, name="health"),
    path('api/auth/', include('accounts.urls')),
    path('api/projects/', include('projects.urls')),
    # Story areas nest under a project; each app declares its own routes.
    path('api/projects/<int:project_pk>/characters/', include('characters.urls')),
    path('api/projects/<int:project_pk>/braindumps/', include('braindumps.urls')),
    path('api/projects/<int:project_pk>/worldbuildings/', include('worldbuilding.urls')),
    path('api/consistency/', include('actions.urls')),
    # Also under /api/consistency/ (old prefix kept for the frontend).
    path('api/consistency/', include('notifications.urls')),
    path('api/consistency/', include('night_eyes.urls')),
]

# API documentation: dev only, so the full API map isn't public in production.
if settings.DEV_SHORTCUTS_ENABLED:
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
        path("redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    ]

# Admin lives at settings.ADMIN_PATH (DJANGO_ADMIN_PATH); not routed at all when empty.
if settings.ADMIN_PATH:
    urlpatterns += [path(settings.ADMIN_PATH, admin.site.urls)]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
if settings.SILK_ENABLED:
    urlpatterns += [
        path("silk/", include("silk.urls", namespace="silk")),
    ]
