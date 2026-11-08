"""World store accessors — world-block and story-element reads."""
from __future__ import annotations

from characters.models import Character
from projects.models import Project

from worldbuilding.models import StoryItem, StoryRule, WorldBlock


def load_world_blocks(ctx) -> list[dict]:
    """The author's registered headings, oldest first, as `{name, label?, hint?,
    glyph?, color?}` dicts. Writes go row-by-row through the WorldBlock model."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return []
    return [b.to_dict() for b in WorldBlock.objects.filter(project_id=project_id)]


CAST_DESC_CHARS = 300


def load_elements(ctx) -> dict:
    """The story elements as `{story?, characters?, items?, rules?}` — the dict
    the gauge / suggestion prompts read. Keys are present only when non-empty,
    so `{}` means "no synopsis, no cast and nothing accepted yet"."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return {}
    out: dict = {}
    # The story is the author's own title + synopsis (setup's AI summary fills
    # an empty synopsis or proposes a change; there is no separate copy).
    p = Project.objects.filter(pk=project_id).values("title", "synopsis").first()
    if p and (p["synopsis"] or "").strip():
        out["story"] = {"title": p["title"], "summary": p["synopsis"]}
    # The live cast (the Character table is its only home), short descriptions
    # so the prompt stays bounded however big the cast gets.
    # Protagonist / antagonist / main come first (so a cap never drops them),
    # then by name. `role` is that flag, else the free-text `type`.
    cast = []
    for c in Character.objects.filter(project_id=project_id).order_by("name"):
        if not (c.name or "").strip():
            continue
        if c.is_protagonist:
            role, rank = "protagonist", 0
        elif c.is_antagonist:
            role, rank = "antagonist", 1
        elif c.is_main_character:
            role, rank = "main", 2
        else:
            role, rank = c.type or "", 3
        cast.append((rank, {"name": c.name, "role": role,
                            "description": (c.description or "")[:CAST_DESC_CHARS]}))
    cast = [d for _, d in sorted(cast, key=lambda t: t[0])]  # stable: name order kept
    if cast:
        out["characters"] = cast
    items = list(StoryItem.objects.filter(project_id=project_id).values("name", "description"))
    if items:
        out["items"] = items
    rules = list(StoryRule.objects.filter(project_id=project_id).values("text", "scope"))
    if rules:
        out["rules"] = rules
    return out
