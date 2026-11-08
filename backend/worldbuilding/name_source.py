"""World entry titles for the character name-collision check (see characters/name_sources.py)."""


def active_world_titles(project) -> list[str]:
    from .models import Worldbuilding

    return list(
        Worldbuilding.objects.filter(project=project)
        .exclude(status='archived')
        .values_list('title', flat=True)
    )
