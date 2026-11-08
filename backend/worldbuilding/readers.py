"""Worldbuilding CRUD — reads and writes for the World page."""
from __future__ import annotations

from actions.errors import _capability_error
from django.utils import timezone

from worldbuilding.models import StoryItem, StoryRule, Worldbuilding


def _worldbuilding_row(w) -> dict:
    """One Worldbuilding row in the page's read shape — keeps add/update/get aligned."""
    return {
        "id": w.id,
        "title": w.title,
        "content": w.content,
        "pnote": w.pnote,
        "summary": w.summary,
        "tags": list(w.tags or []),
        "status": w.status,
        "color": w.color,
        "order": w.order,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
    }


def get_worldbuildings(ctx) -> dict:
    rows = list(
        Worldbuilding.objects
        .filter(project_id=ctx.project_id)
        .order_by("order", "-created_at")
        .values(
            "id", "title", "content", "pnote", "summary",
            "tags", "status", "color", "order",
            "created_at", "updated_at",
        )
    )
    for r in rows:
        for k in ("created_at", "updated_at"):
            if r.get(k) is not None:
                r[k] = r[k].isoformat()
    return {"worldbuildings": rows}


def create_worldbuilding(
    project_id: int,
    *,
    title: str,
    content: str = "",
    tags: list | None = None,
    pnote: str = "",
) -> dict:
    title = (title or "").strip()
    if not title:
        raise _capability_error("title is required", 400)
    w = Worldbuilding.objects.create(
        project_id=project_id,
        title=title,
        content=(content or "").strip(),
        pnote=(pnote or "").strip(),
        tags=list(tags or []),
    )
    return _worldbuilding_row(w)


def patch_worldbuilding(project_id: int, worldbuilding_id: int, fields: dict) -> dict:
    try:
        w = Worldbuilding.objects.get(project_id=project_id, id=worldbuilding_id)
    except Worldbuilding.DoesNotExist as exc:
        raise _capability_error("worldbuilding item not found", 404) from exc
    updated = []
    if "title" in fields:
        t = (fields["title"] or "").strip()
        if not t:
            raise _capability_error("title cannot be empty", 400)
        w.title = t
        updated.append("title")
    if "content" in fields:
        w.content = (fields["content"] or "").strip()
        updated.append("content")
    if "pnote" in fields:
        w.pnote = (fields["pnote"] or "").strip()
        updated.append("pnote")
    if "tags" in fields and isinstance(fields["tags"], list):
        w.tags = list(fields["tags"])
        updated.append("tags")
    if "status" in fields:
        w.status = (fields["status"] or "draft").strip()
        updated.append("status")
    if "color" in fields:
        w.color = (fields["color"] or "").strip()
        updated.append("color")
    if updated:
        w.save(update_fields=updated + ["updated_at"])
    return _worldbuilding_row(w)


def delete_worldbuilding(project_id: int, worldbuilding_id: int) -> dict:
    try:
        w = Worldbuilding.objects.get(project_id=project_id, id=worldbuilding_id)
    except Worldbuilding.DoesNotExist as exc:
        raise _capability_error("worldbuilding item not found", 404) from exc
    # Soft delete: the row stays (hidden from `Worldbuilding.objects`) so the
    # author's 10-second Undo can bring it back via `undelete_worldbuilding`.
    w.deleted_at = timezone.now()
    w.save(update_fields=["deleted_at", "updated_at"])
    return {"deleted": True, "id": worldbuilding_id}


def undelete_worldbuilding(project_id: int, worldbuilding_id: int) -> dict:
    """Undo a delete: clear `deleted_at` and return the row as it was."""
    try:
        w = Worldbuilding.all_objects.get(
            project_id=project_id, id=worldbuilding_id, deleted_at__isnull=False,
        )
    except Worldbuilding.DoesNotExist as exc:
        raise _capability_error("deleted worldbuilding item not found", 404) from exc
    w.deleted_at = None
    w.save(update_fields=["deleted_at", "updated_at"])
    return _worldbuilding_row(w)


# ---- story items / rules (accepted from the AI's first read) ------------- #

def get_items(ctx) -> dict:
    # Straight from the StoryItem table — not `load_elements`, which also loads
    # the project and the whole cast this reader never uses.
    rows = StoryItem.objects.filter(project_id=ctx.project_id).values("name", "description")
    items = [
        {
            "name": (it.get("name") or "").strip(),
            "description": (it.get("description") or "").strip(),
        }
        for it in rows
        if isinstance(it, dict) and (it.get("name") or "").strip()
    ]
    return {"items": items}


def get_rules(ctx) -> dict:
    # Straight from the StoryRule table (see get_items).
    rows = StoryRule.objects.filter(project_id=ctx.project_id).values("text", "scope")
    rules = [
        {
            "text": (r.get("text") or "").strip(),
            "scope": (r.get("scope") or "").strip(),
        }
        for r in rows
        if isinstance(r, dict) and (r.get("text") or "").strip()
    ]
    return {"rules": rules}
