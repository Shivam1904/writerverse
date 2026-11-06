from decimal import Decimal

from django.conf import settings
from django.db import models


class AIUsage(models.Model):
    """What one piece of AI work used: one row per AI unit (a chat turn or a
    top-level action), plus one per nested feature with its own price.

    Written by `usage.services.settle` after the work ends, whether it
    succeeded or crashed. It is the one record of AI tokens and $ cost; an AI
    policy (settings.WRITERVERSE_AI_POLICY) may keep its own records on top."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_usage",
        db_index=False,  # the (user, -created_at) index covers it
    )
    feature = models.CharField(max_length=64)
    label = models.CharField(max_length=200, blank=True)
    model = models.CharField(max_length=128, blank=True)
    tokens_in = models.IntegerField(default=0)
    tokens_out = models.IntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal("0"))
    idempotency_key = models.CharField(max_length=256, unique=True)
    metadata = models.JSONField(default=dict, blank=True)  # {"turn_id": ...}
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "AI usage"
        verbose_name_plural = "AI usage"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"], name="aiusage_user_recent_idx")]

    def __str__(self) -> str:
        return f"{self.feature} {self.tokens_in}/{self.tokens_out} ${self.cost_usd}"
