from django.apps import AppConfig


class ActionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "actions"
    # The app was called `consistency` before. The label stays "consistency" so
    # DB table names, migration history and content types are unchanged (no DB
    # wipe needed). Model labels are therefore still "consistency.Proposal" etc.
    label = "consistency"

    def ready(self):
        from django.core import checks
        from django.utils.module_loading import autodiscover_modules

        # Import `<app>.capabilities` for every installed app, so each domain
        # app can register its own capabilities. Python caches modules, so a
        # later `from actions.capabilities import ...` never registers twice.
        autodiscover_modules("capabilities")

        # projects sits below actions, so it signals plain REST writes instead
        # of calling domain_versions.bump itself.
        from projects.signals import domains_changed
        domains_changed.connect(_bump_on_domains_changed,
                                dispatch_uid="actions.bump_on_domains_changed")

        from .checks import check_capability_contract
        checks.register(check_capability_contract)


def _bump_on_domains_changed(sender, project_id, domains, **kwargs):
    from . import domain_versions  # module lookup, so tests can patch bump
    domain_versions.bump(project_id, domains)
