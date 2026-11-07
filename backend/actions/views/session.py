from projects.scoping import owned_project_or_404

from actions.capabilities.spec import ProjectScope


def _scope(request, project_pk: int) -> ProjectScope:
    """Ownership guard: 404 unless the project is the caller's. Returns the
    scope to dispatch against."""
    return ProjectScope(owned_project_or_404(request, project_pk).id)
