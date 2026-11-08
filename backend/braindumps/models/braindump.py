from django.db import models


class LiveBraindumpManager(models.Manager):
    """Default manager: hides braindumps the author deleted (soft delete, so
    the 10-second Undo can bring them back). Use `all_objects` to see them."""

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Braindump(models.Model):
    title = models.CharField(max_length=200, help_text="Braindump title")
    content = models.TextField(blank=True, help_text="Braindump content/description")
    pnote = models.TextField(blank=True, help_text="Planning note")
    summary = models.TextField(blank=True, help_text="Summary")
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='braindumps', db_index=False)
    tags = models.JSONField(default=list, blank=True, help_text="List of tag strings for categorization")
    ai_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Full AI annotation payload (phrases, packs, entities, tags, meta). "
                  "Shape is intentionally loose — written by annotate_braindump.",
    )
    pinned = models.BooleanField(default=False, help_text="The author starred this idea.")
    order = models.PositiveIntegerField(default=0, help_text="Display order for the braindump")
    ai_generated = models.BooleanField(
        default=False,
        help_text="True when this entry was created by the AI (Night Eyes) rather "
                  "than typed by the author. Drives the quiet hover-only 'ai' marker; "
                  "the author still owns the star/highlight.",
    )
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set when the author deletes the entry; cleared by Undo. "
                  "Deleted rows are hidden from `objects`.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = LiveBraindumpManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'planning_braindump'
        ordering = ['order', '-created_at']
        indexes = [
            models.Index(fields=['project', 'created_at']),
            models.Index(fields=['project', 'order']),
        ]

    def __str__(self):
        return self.title
