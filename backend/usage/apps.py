from django.apps import AppConfig


class UsageConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "usage"
    verbose_name = "AI usage"

    def ready(self) -> None:
        # In dev and tests, an LLM call with no AI unit open is an error
        # (ai_engine stays Django-free, so it reads a module flag).
        from ai_engine import usage_meter
        from django.conf import settings
        usage_meter.STRICT = bool(
            settings.DEBUG or getattr(settings, "RUNNING_TESTS", False)
        )
