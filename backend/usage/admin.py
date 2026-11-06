from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import AIUsage


@admin.register(AIUsage)
class AIUsageAdmin(ModelAdmin):
    """Read-only: what each AI call cost, so a self-hoster sees their AI spend."""

    list_display = ("created_at", "user", "feature", "tokens_in", "tokens_out", "cost_usd")
    readonly_fields = (
        "user", "feature", "label", "model", "tokens_in", "tokens_out",
        "cost_usd", "idempotency_key", "metadata", "created_at",
    )
    list_filter = ("feature",)
    search_fields = ("user__email", "feature", "idempotency_key")
