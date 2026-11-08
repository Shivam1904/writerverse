from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver


class ChatThread(models.Model):
    """Night Eyes conversation metadata. LangGraph's PostgresSaver stores the
    opaque checkpoint blobs; this table holds the human-facing fields needed
    to render a thread list (title + last activity + the page the chat started
    on)."""

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="chat_threads",
    )
    thread_id = models.UUIDField(unique=True, db_index=True)
    title = models.CharField(max_length=120, blank=True)
    page = models.CharField(max_length=64, blank=True)
    # D31: {domain: version_string} captured the last time Night Eyes ran a
    # read whose capability mapped to `domain`. Compared on each new turn to
    # the project's current domain versions; any drift produces a
    # `[STALE]` system warning before the LLM call.
    read_baseline = models.JSONField(default=dict, blank=True)
    # Agentic-core routing state: the role that answered the last turn (resume
    # paths reuse it so a paused plan never switches models mid-flight) + the
    # escalate flag (recursion-limit hit or plan_multi_step fired → next Auto
    # turn goes expert).
    last_role = models.CharField(max_length=16, blank=True, default="")
    escalate_next = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-last_message_at"]

    def __str__(self) -> str:
        return f"ChatThread({self.thread_id})"


@receiver(post_delete, sender=ChatThread)
def _delete_thread_proposals(sender, instance, **kwargs):
    """Proposal.thread_id is a plain value, not a foreign key (the actions
    kernel doesn't depend on chat), so a deleted thread takes its proposals
    with it here. Runs for cascades and admin bulk deletes too."""
    from actions.models import Proposal

    Proposal.objects.filter(thread_id=instance.thread_id).delete()
