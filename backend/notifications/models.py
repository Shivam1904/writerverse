from django.db import models


class Notification(models.Model):
    """A lightweight, author-facing ping for a project.

    Not a Proposal (no accept/reject, no capability) — purely informational.
    A *sender* (background task, AI, system event) creates one with markdown
    `content`, an optional `target_url` to navigate to on click, and a `slug`
    that selects which glyph the card wears (see frontend
    modules/notification/slugs.ts — section slugs like "characters" or kind
    slugs like "info"/"success"/"warning").

    Two states only:
      - "active"   — shows in the SuggestionsRail as a subtle card.
      - "archived" — left the rail (clicked-through OR dismissed); only
                     visible from the bell in the topbar.

    No push — the frontend polls via TanStack on the usual cadence.
    """

    STATUS_ACTIVE = "active"
    STATUS_ARCHIVED = "archived"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_ARCHIVED, "Archived"),
    ]

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="notifications",
        db_index=False,  # covered by a composite index (see Meta)
    )
    title = models.CharField(max_length=200, blank=True)
    content = models.TextField(blank=True)  # markdown
    target_url = models.CharField(max_length=512, blank=True)
    slug = models.CharField(max_length=64, blank=True)
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["project", "status", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Notification({self.id}, {self.slug}, {self.status})"
