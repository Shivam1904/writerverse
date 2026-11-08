from django.db import models


class LiveWorldbuildingManager(models.Manager):
    """Default manager: hides world entries the author deleted (soft delete, so
    the 10-second Undo can bring them back). Use `all_objects` to see them."""

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Worldbuilding(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('in-progress', 'In Progress'),
        ('completed', 'Completed'),
        ('archived', 'Archived'),
    ]

    title = models.CharField(max_length=200, help_text="Worldbuilding title")
    content = models.TextField(blank=True, help_text="Worldbuilding content/description")
    pnote = models.TextField(blank=True, help_text="Planning note")
    summary = models.TextField(blank=True, help_text="Summary")
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='worldbuildings', db_index=False)
    tags = models.JSONField(default=list, blank=True, help_text="List of tag strings for categorization")
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='draft', help_text="Worldbuilding status")
    color = models.CharField(
        max_length=32, blank=True, default='',
        help_text="Identity colour override (hex or CSS token). Empty = derive from the "
                  "entity's block/kind aspect colour on the frontend."
    )
    order = models.PositiveIntegerField(default=0, help_text="Display order for the worldbuilding")
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set when the author deletes the entry; cleared by Undo. "
                  "Deleted rows are hidden from `objects`.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = LiveWorldbuildingManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'planning_worldbuilding'
        ordering = ['order', '-created_at']
        indexes = [
            models.Index(fields=['project', 'created_at']),
            models.Index(fields=['project', 'order']),
            models.Index(fields=['project', 'status']),
        ]

    def __str__(self):
        return f"{self.title}"
