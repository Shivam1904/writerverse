from django.db import models


class Proposal(models.Model):
    """A pending write that needs human acceptance — regardless of who
    proposed it. One model, several sources, one accept flow: every surface
    (the bell, page cards) accepts or rejects it through the
    `accept_proposal` / `reject_proposal` capabilities
    (capabilities/commit/_proposals.py). See docs/how-it-works/proposals.md.

    Sources (`source` field):
      - "chat"       — Night Eyes called a PROPOSE tool. `thread_id` is set; the
                       chat turn does NOT pause, and accept never touches it.
      - "button"     — user clicked a UI button on a write+propose capability.
                       `thread_id` is null.
      - "cron"       — periodic background task (e.g. suggestion refresh).

    `page` records where the proposal was triggered (e.g. "characters",
    "plot-threads") so page-surface consumers can filter by their own
    surface. `project` is denormalised so the rehydration endpoint can
    query by project without going through the thread (nullable for
    button/cron paths).

    Fresh model — not the legacy `ai_generations.WriteProposal` (per D19
    + the Night-Eyes-builds-fresh rule)."""

    STATUS_PROPOSED = "PROPOSED"
    STATUS_APPLIED = "APPLIED"
    STATUS_REJECTED = "REJECTED"
    STATUS_FAILED = "FAILED"
    STATUS_CHOICES = [
        (STATUS_PROPOSED, "Proposed"),
        (STATUS_APPLIED, "Applied"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_FAILED, "Failed"),
    ]

    SOURCE_CHAT = "chat"
    SOURCE_BUTTON = "button"
    SOURCE_CRON = "cron"
    SOURCE_CHOICES = [
        (SOURCE_CHAT, "Chat"),
        (SOURCE_BUTTON, "Button"),
        (SOURCE_CRON, "Cron"),
    ]

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="proposals",
        db_index=False,  # covered by a composite index (see Meta)
    )
    # The chat thread's public id (`night_eyes.ChatThread.thread_id`, a UUID).
    # A plain value, not a foreign key, so this kernel table never depends on
    # the chat app. night_eyes deletes a thread's proposals when it deletes
    # the thread.
    thread_id = models.UUIDField(
        null=True,
        blank=True,
        db_index=False,  # the (thread_id, status) index covers it
    )
    source = models.CharField(
        max_length=16,
        choices=SOURCE_CHOICES,
        default=SOURCE_CHAT,
    )
    page = models.CharField(max_length=64, blank=True)
    capability = models.CharField(max_length=128)
    args = models.JSONField(default=dict, blank=True)
    proposal = models.JSONField(default=dict, blank=True)
    # What the target looked like when the AI made this proposal: {field_key:
    # value} for each field it would overwrite (see capabilities/stamps.py).
    # Accept compares it with the live value and refuses to clobber an author's
    # newer edit (SA-209). Null = made before stamping existed → not checked.
    base = models.JSONField(null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default=STATUS_PROPOSED,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["thread_id", "status"]),
            models.Index(fields=["project", "status"]),
        ]

    def __str__(self) -> str:
        return f"Proposal({self.id}, {self.capability}, {self.status})"


class ProjectDomainVersion(models.Model):
    """When a part ("domain") of a project last changed.

    One row per (project, domain), e.g. (project 7, "outline"). Every WRITE
    dispatch that touches a domain sets `changed_at` to now (see
    `actions/domain_versions.py`). Reads report it back, and Night Eyes
    compares it with what a chat last read to warn "[STALE] outline changed".
    Domains come from `actions/config/staleness.yml`.
    """

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="domain_versions",
    )
    domain = models.CharField(max_length=64)
    changed_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "domain"], name="uniq_project_domain_version",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.domain}@{self.changed_at.isoformat()} (project={self.project_id})"
