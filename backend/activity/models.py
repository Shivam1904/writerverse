from django.db import models
from django.utils import timezone


class ActivityEvent(models.Model):
    """Developer debug log: one row per thing the app did behind the scenes.

    Not shown to authors. Read it in the Django admin to understand how the AI
    and the app behaved for a project. Rows older than RETENTION_DAYS are pruned
    (see activity.store.prune_old_events). AI cost is not logged here:
    `usage.AIUsage` is the one record of tokens and $.
    """

    STEP = "step"          # an AI pipeline step finished (extract, merge, generate_thread…)
    NUDGE = "nudge"        # a shadow nudge check: what WOULD have been suggested
    KIND_CHOICES = [(STEP, "AI step"), (NUDGE, "Nudge check")]

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="activity_events",
        db_index=False,  # covered by the (project, -created_at) index
    )
    kind = models.CharField(max_length=16, choices=KIND_CHOICES)
    name = models.CharField(max_length=64)  # step name or nudge rule set
    created_at = models.DateTimeField(default=timezone.now)
    details = models.JSONField(default=dict, blank=True)      # small, kind-specific extras

    class Meta:
        db_table = "activity_event"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["project", "-created_at"], name="activity_project_recent_idx")]

    def __str__(self) -> str:
        return f"{self.kind}:{self.name} (project {self.project_id})"
