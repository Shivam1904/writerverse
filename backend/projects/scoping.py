"""Project scoping for the plain REST viewsets nested under a project.

The rule: the project a record belongs to comes from the URL
(``/api/projects/<project_pk>/...``) and is checked against the logged-in
user. It never comes from the request body or the query string.

``ProjectScopedMixin`` is the one place that enforces this for the nested
viewsets (characters, braindumps, worldbuildings):

  - ``get_project()``: the caller's project from the URL, or 404.
  - ``get_queryset()``: only rows of that project, so ``get_object()`` 404s on
    an id from another project.
  - ``perform_create`` / ``perform_update``: always save with the URL project,
    so a body like ``{"project": 99}`` can't move a row into someone else's
    project. (Serializers also mark ``project`` read-only.)
"""
from __future__ import annotations

import logging

from django.shortcuts import get_object_or_404
from rest_framework.permissions import SAFE_METHODS

from projects.models import Project
from projects.signals import domains_changed

logger = logging.getLogger(__name__)


def owned_project_or_404(request, project_pk) -> Project:
    """The caller's project, or 404 (also for someone else's project)."""
    return get_object_or_404(Project, id=project_pk, user=request.user)


class ProjectScopedMixin:
    """For DRF viewsets routed under ``projects/<int:project_pk>/``.

    Subclasses set ``queryset`` (or override ``base_queryset``), and
    ``stale_domain`` (e.g. ``"characters"``): every successful write through
    the viewset bumps that domain's version so other open tabs refresh
    (see ``actions/staleness_stream.py``)."""

    stale_domain: str | None = None

    def get_project(self) -> Project:
        cached = getattr(self, "_scoped_project", None)
        if cached is None:
            cached = owned_project_or_404(self.request, self.kwargs.get("project_pk"))
            self._scoped_project = cached
        return cached

    def base_queryset(self):
        return self.queryset.all()

    def get_queryset(self):
        return (self.base_queryset()
                .filter(project=self.get_project())
                .select_related("project"))

    def perform_create(self, serializer):
        serializer.save(project=self.get_project())

    def perform_update(self, serializer):
        serializer.save(project=self.get_project())

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if (self.stale_domain and request.method not in SAFE_METHODS
                and response.status_code < 400):
            # The write is already saved; a failed bump must not turn it into a 500.
            try:
                domains_changed.send(sender=type(self), project_id=self.get_project().id,
                                     domains=[self.stale_domain])
            except Exception:  # noqa: BLE001
                logger.exception("version bump failed domain=%s", self.stale_domain)
        return response
