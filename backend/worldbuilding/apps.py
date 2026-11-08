from django.apps import AppConfig


class WorldbuildingConfig(AppConfig):
    name = 'worldbuilding'

    def ready(self):
        from characters.name_sources import register_world_name_source

        from .name_source import active_world_titles

        register_world_name_source(active_world_titles)
