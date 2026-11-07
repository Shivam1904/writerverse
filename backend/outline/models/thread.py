from django.db import models


class PlotThread(models.Model):
    """One plot thread (storyline) — e.g. "Aelden's arc" or the main plot.

    `uid` is the string id the rest of the app uses ("ro-…"): outline scene
    beats point at it (`from_rough`), and so do proposals. `position` is the
    order on the Threads page (0 = top).
    """

    project = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, related_name="plot_threads",
        db_index=False,  # covered by a composite index (see Meta)
    )
    uid = models.CharField(max_length=40)
    title = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=100, blank=True)
    # Who the thread follows: ("story", "") for the whole book, or
    # ("character", "Aelden"). Both blank = no scope saved.
    scope_type = models.CharField(max_length=40, blank=True)
    scope_name = models.CharField(max_length=200, blank=True)
    # For a character thread: the real link, so a rename follows. scope_name
    # stays as the label if the character is ever hard-deleted.
    character = models.ForeignKey(
        "characters.Character", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="plot_threads",
    )
    # How it was made: "seed", "scaffold", "ai_thread", "user_wishes", …
    source = models.CharField(max_length=40, blank=True)
    template_id = models.CharField(max_length=100, null=True, blank=True)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "outline_plotthread"
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["project", "uid"], name="uniq_plot_thread_uid"),
        ]

    def __str__(self) -> str:
        return self.title or self.uid


class ThreadBeat(models.Model):
    """One beat inside a plot thread. `uid` is the app's string id ("ri-…" or
    "it-…"); outline scene beats point at it (`from_item`). `updated_at` drives
    the gauges' stale-bar colouring, so it changes only on a real edit."""

    KIND_CHOICES = [
        ("text", "Text"),
        ("heading", "Heading"),
        ("placeholder", "Placeholder"),
    ]

    thread = models.ForeignKey(PlotThread, on_delete=models.CASCADE, related_name="beats", db_index=False)
    uid = models.CharField(max_length=40)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default="text")
    text = models.TextField(blank=True)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "outline_threadbeat"
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["thread", "uid"], name="uniq_thread_beat_uid"),
        ]

    def __str__(self) -> str:
        return self.text[:60]
