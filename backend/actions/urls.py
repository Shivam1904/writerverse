from django.urls import path

from .dev_logs import DevLogsView
from .facade import facade_urlpatterns
from .registry_view import RegistryView
from .staleness_stream import StalenessStreamView

# Mounted at /api/consistency/ (see config/urls.py). Notification and chat
# routes share that prefix but are mounted by config/urls.py directly.
urlpatterns = [
    # Dev-only log viewer — backs the /dev/logs page (Night Eyes activity stream).
    path("dev/logs/", DevLogsView.as_view()),
    # Dev-only capability registry — one filterable page listing every tool
    # (route/actor/tier/args/pages). DEBUG-gated. Replaced the throwaway
    # `manage.py dump_registry` command.
    path("dev/registry/", RegistryView.as_view()),
    # NOTE: the legacy POST /dispatch/ envelope endpoint was decommissioned
    # 2026-05-29 — use the facade (semantic routes + op/<capability>/). D33.
    # The legacy Lab pipeline endpoints (run/*, charts/*, outline, synopsis,
    # elements, taxonomy, scopes, analyse, awareness, braindumps, registry,
    # meta) were removed 2026-06-20 — their frontend page is gone and their
    # logic now lives in the capability registry + lens_binding.
    # Tier 1 — per-project staleness push (cross-tab / cross-actor refetch).
    path("projects/<int:project_pk>/staleness/stream/",
         StalenessStreamView.as_view()),
]

# Tier 2 — declarative semantic-resource facade over dispatch() (additive).
urlpatterns += facade_urlpatterns()
