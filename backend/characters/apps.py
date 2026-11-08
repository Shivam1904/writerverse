from django.apps import AppConfig


class CharactersConfig(AppConfig):
    name = 'characters'

    def ready(self):
        from characters import signals  # noqa: F401 — connects the receivers
