"""Deterministic signals for the nudge rules. Cheap; no LLM.

Counts come from columns (Project.total_scenes, the Character table), never from
loading the outline. "Days since visit" is the time since this project's last
logged nudge check. Add a signal here, reference it from a rule in evaluate.py.
"""
from activity.models import ActivityEvent
from activity.store import last_event_at
from characters.models import Character
from django.utils import timezone
from projects.models import Project


def compute_signals(ctx, events=None) -> dict:
    scenes = (Project.objects.filter(pk=ctx.project_id)
              .values_list("total_scenes", flat=True).first()) or 0
    last_check = last_event_at(ctx, ActivityEvent.NUDGE)
    return {
        "scene_count": scenes,
        "people_count": Character.objects.filter(project_id=ctx.project_id).count(),
        "chart_count": 0,
        # never checked before -> treat as long ago
        "days_since_visit": (timezone.now() - last_check).days if last_check else 9999,
        "events": set(events or []),
    }
