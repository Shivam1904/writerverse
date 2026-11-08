"""Braindumps / Braindump CRUD — reads and writes for the Braindumps page."""
from __future__ import annotations

import logging

from actions.errors import _capability_error
from characters.models import Character
from django.utils import timezone
from worldbuilding.models import Worldbuilding

from braindumps.models import Braindump

logger = logging.getLogger("writerverse.consistency")


def _braindump_row(b) -> dict:
    """One Braindump row in the page's read shape — keeps add/update/get aligned."""
    return {
        "id": b.id,
        "title": b.title,
        "content": b.content,
        "pnote": b.pnote,
        "summary": b.summary,
        "tags": list(b.tags or []),
        "pinned": b.pinned,
        "order": b.order,
        "ai_data": dict(b.ai_data or {}),
        "ai_generated": bool(b.ai_generated),
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }


def _strip_kind(tag) -> str:
    """A typed entity tag `kind[Name]` → its bare `Name` for plain-text labels;
    any other tag passes through unchanged."""
    t = str(tag or "")
    i = t.find("[")
    if i > 0 and t.endswith("]") and t[:i].isalpha():
        return t[i + 1:-1]
    return t


def _braindump_brief(b) -> dict:
    return {"id": b.id, "text": b.content, "tag": (_strip_kind(b.tags[0]) if b.tags else None)}


def get_braindumps(ctx) -> dict:
    from actions.capabilities.spec import Actor
    rows = list(
        Braindump.objects
        .filter(project_id=ctx.project_id)
        .order_by("order", "-created_at")
        .values(
            "id", "title", "content", "pnote", "summary",
            "tags", "pinned", "order", "ai_data",
            "ai_generated", "created_at", "updated_at",
        )
    )
    # `ai_data` is the annotator's internal phrase/pack breakdown. The chat model
    # has no use for it (the human-meaningful projection — entity names + craft
    # tags — is already mirrored onto `tags`) and was pasting the raw JSON blob
    # verbatim into its replies. Drop it for the AI; the Braindumps page reads
    # this same op as USER_BUTTON and still needs the full payload for its tag UI
    # / PackBreakdown.
    drop_ai_data = getattr(ctx, "actor", None) == Actor.CHAT
    for r in rows:
        if drop_ai_data:
            r.pop("ai_data", None)
        for k in ("created_at", "updated_at"):
            if r.get(k) is not None:
                r[k] = r[k].isoformat()
    return {"braindumps": rows}


def get_braindump_tag_categories(ctx) -> dict:
    """The braindump tag taxonomy from config (project-independent — ctx unused).
    Categories in definition order, each with its colour + ordered leaf tags;
    `archived` carries pulled-out groups (e.g. Entity). Canonical source for the
    frontend, which keeps a hardcoded copy only as an offline fallback."""
    from braindumps.ai import tags as braindump_tags
    return {
        "categories": braindump_tags.categories_list(),
        "archived": [
            {"name": name, "color": grp.get("color", ""), "tags": list(grp.get("tags") or [])}
            for name, grp in braindump_tags.archived().items()
        ],
    }


def create_braindump(
    project_id: int,
    *,
    body: str,
    subtext: str | None = None,
    tags: list | None = None,
    pinned: bool = False,
    ai_generated: bool = False,
) -> dict:
    """Create one Braindump row. Title is derived from body (<=200 chars).
    `ai_generated` flags an AI (Night Eyes) creation — it drives the quiet hover
    marker but never the star: an AI add is created un-pinned (the author owns it)."""
    body = (body or "").strip()
    if not body:
        raise _capability_error("body is required", 400)
    b = Braindump.objects.create(
        project_id=project_id,
        title=body[:200] or "braindump",
        content=body,
        pnote=(subtext or "").strip(),
        tags=list(tags or []),
        pinned=bool(pinned),
        ai_generated=bool(ai_generated),
    )
    return _braindump_row(b)


def patch_braindump(project_id: int, braindump_id: int, fields: dict) -> dict:
    """Partial-update one Braindump. Only the page's editable fields land — body,
    subtext, tags, pinned, ai_data — others are ignored (the writer doesn't see
    them yet). ai_data is overwritten wholesale (used to retag a single phrase)."""
    try:
        b = Braindump.objects.get(project_id=project_id, id=braindump_id)
    except Braindump.DoesNotExist as exc:
        raise _capability_error("braindump not found", 404) from exc
    updated = []
    if "body" in fields:
        body = (fields["body"] or "").strip()
        if not body:
            raise _capability_error("body cannot be empty", 400)
        b.content = body
        b.title = body[:200] or "braindump"
        updated += ["content", "title"]
    if "subtext" in fields:
        b.pnote = (fields["subtext"] or "").strip()
        updated.append("pnote")
    if "tags" in fields and isinstance(fields["tags"], list):
        b.tags = list(fields["tags"])
        updated.append("tags")
    if "ai_data" in fields and isinstance(fields["ai_data"], dict):
        b.ai_data = fields["ai_data"]
        updated.append("ai_data")
    if "pinned" in fields:
        b.pinned = bool(fields["pinned"])
        updated.append("pinned")
    if updated:
        b.save(update_fields=updated + ["updated_at"])
    return _braindump_row(b)


def annotate_braindump(
    project_id: int,
    braindump_id: int,
    *,
    ai_data: dict,
    tags: list | None = None,
) -> dict:
    """Write an AI annotation onto one Braindump. `ai_data` is the full payload
    (phrases / packs / entities / tags / meta, shape loose). `tags` is the merged
    projection the tag UI renders (craft tags + entity names); when None the
    existing tags are left untouched (e.g. a failed annotation still records its
    ai_data for a later re-run)."""
    try:
        b = Braindump.objects.get(project_id=project_id, id=braindump_id)
    except Braindump.DoesNotExist as exc:
        raise _capability_error("braindump not found", 404) from exc
    prev = b.ai_data if isinstance(b.ai_data, dict) else {}
    if (ai_data or {}).get("status") == "failed" and prev.get("status") == "ok":
        # A failed re-run must not wipe the last good annotation.
        logger.warning("braindump %s annotation failed; keeping previous ai_data (%s)",
                       braindump_id, (ai_data or {}).get("error"))
        return _braindump_row(b)
    b.ai_data = dict(ai_data or {})
    fields = ["ai_data"]
    if tags is not None:
        b.tags = list(tags)
        fields.append("tags")
    b.save(update_fields=fields + ["updated_at"])
    return _braindump_row(b)


def _norm_name(s) -> str:
    return " ".join(str(s or "").split()).lower()


def known_entities_for(
    project_id: int,
    *,
    exclude_braindump_id: int | None = None,
    threads: list | None = None,
    include_aliases: bool = False,
) -> list:
    """The project's known entity names — REAL entities (characters, worldbuilding
    items, plot threads) plus entities already extracted on OTHER braindumps —
    deduped by normalised name. Real entities are added first so their casing wins;
    among the rest, first-seen wins. `threads` is the discovery `rough_outlines`
    list (thread names live in the blob, not a table). Used to bias + canonicalise
    annotation so the entity set self-reinforces (no link/promotion here — D-sep).

    `include_aliases` also adds each character's aliases (the `Character.aliases`
    entries). Off by default so the braindump-annotation path is unchanged; the
    scene `resolve_nouns` pipeline turns it on (a 'Wayfarer' must resolve too)."""
    canon: dict[str, str] = {}

    def add(name) -> None:
        n = _norm_name(name)
        if n and n not in canon:
            canon[n] = str(name).strip()

    # Real entities first (their canonical casing wins any later collision).
    chars = Character.objects.filter(project_id=project_id)
    if include_aliases:
        for name, aliases in chars.values_list("name", "aliases"):
            add(name)
            for a in (aliases or []):
                add(a.get("name") if isinstance(a, dict) else a)
    else:
        for name in chars.values_list("name", flat=True):
            add(name)
    for nm in Worldbuilding.objects.filter(project_id=project_id).values_list("title", flat=True):
        add(nm)
    for t in threads or []:
        if isinstance(t, dict):
            add(t.get("title") or t.get("name"))
    # Then entities harvested from other braindumps' annotations (fill the gaps).
    qs = Braindump.objects.filter(project_id=project_id)
    if exclude_braindump_id is not None:
        qs = qs.exclude(id=exclude_braindump_id)
    for ai in qs.values_list("ai_data", flat=True):
        for e in (ai or {}).get("entities") or []:
            # v2 entities are {kind,name} dicts; tolerate legacy bare-name strings.
            add(e.get("name") if isinstance(e, dict) else e)
    return list(canon.values())


def known_entity_index_for(
    project_id: int,
    *,
    threads: list | None = None,
    include_aliases: bool = True,
) -> dict[str, dict]:
    """`normalised_name -> {"type", "id", "name"}` for the project's REAL entities
    (characters + aliases, worldbuilding items, plot threads). The id-bearing
    sibling of `known_entities_for`: where that biases the LLM by name, this lets a
    caller resolve an extracted noun BACK to its entity — e.g. attach a character
    id to a scene mention. Primary names are added before aliases so a character's
    own name wins a collision with another's alias; first writer wins thereafter.
    Threads live in the discovery blob, so their id is whatever the dict carries
    (often None). A noun that matches nothing here simply has no entry."""
    index: dict[str, dict] = {}

    def add(name, *, type_: str, id_) -> None:
        n = _norm_name(name)
        if n and n not in index:
            index[n] = {"type": type_, "id": id_, "name": str(name).strip()}

    chars = Character.objects.filter(project_id=project_id)
    if include_aliases:
        rows = list(chars.values_list("id", "name", "aliases"))
    else:
        rows = [(cid, name, None) for cid, name in chars.values_list("id", "name")]
    for cid, name, _aliases in rows:
        add(name, type_="character", id_=cid)
    for cid, _name, aliases in rows:
        for a in (aliases or []):
            add(a.get("name") if isinstance(a, dict) else a, type_="character", id_=cid)
    for wid, title in Worldbuilding.objects.filter(project_id=project_id).values_list("id", "title"):
        add(title, type_="worldbuilding", id_=wid)
    for t in threads or []:
        if isinstance(t, dict):
            add(t.get("title") or t.get("name"), type_="thread", id_=t.get("id"))
    return index


def delete_braindump(project_id: int, braindump_id: int) -> dict:
    try:
        b = Braindump.objects.get(project_id=project_id, id=braindump_id)
    except Braindump.DoesNotExist as exc:
        raise _capability_error("braindump not found", 404) from exc
    # Soft delete: the row stays (hidden from `Braindump.objects`) so the
    # author's 10-second Undo can bring it back via `undelete_braindump`.
    b.deleted_at = timezone.now()
    b.save(update_fields=["deleted_at", "updated_at"])
    return {"deleted": True, "id": braindump_id}


def undelete_braindump(project_id: int, braindump_id: int) -> dict:
    """Undo a delete: clear `deleted_at` and return the row as it was."""
    try:
        b = Braindump.all_objects.get(
            project_id=project_id, id=braindump_id, deleted_at__isnull=False,
        )
    except Braindump.DoesNotExist as exc:
        raise _capability_error("deleted braindump not found", 404) from exc
    b.deleted_at = None
    b.save(update_fields=["deleted_at", "updated_at"])
    return _braindump_row(b)


def all_braindump_texts(project_id) -> list[str]:
    """Every non-empty idea text in the project, in page order. One column only —
    what the generation gathers feed the LLM. Loaded by the gathers that need it,
    never on every dispatch."""
    if project_id is None:
        return []
    return [
        t for t in Braindump.objects.filter(project_id=project_id)
        .order_by("order", "created_at").values_list("content", flat=True)
        if t
    ]


def lab_braindumps(project_id) -> list:
    """The lab's braindumps, read from the Braindump table (canonical)."""
    return [
        _braindump_brief(b)
        for b in Braindump.objects.filter(project_id=project_id).order_by("order", "created_at")
    ]
