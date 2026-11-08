"""Character CRUD — reads and writes for the Characters page."""
from __future__ import annotations

from actions.errors import _capability_error
from django.utils import timezone

from characters import fields as cf
from characters.models import Character


def get_characters(ctx) -> dict:
    rows = list(
        Character.objects.filter(project_id=ctx.project_id)
        .order_by("name")
        .values("id", *cf.COLUMN_READ_FIELDS)
    )
    return {"characters": cf.attach_relationships(ctx.project_id, rows)}


_INDEX_FIELDS = ("id", "name", "is_protagonist", "is_antagonist", "is_main_character")


def index(project_id) -> list[dict]:
    """The cast as a small map: id, name and the three tier flags, by name.
    No text columns, no relationships, so it stays cheap for a big cast.
    Use it when you only need to list or look up characters, not read them."""
    return [
        dict(zip(_INDEX_FIELDS, row, strict=True))
        for row in Character.objects.filter(project_id=project_id)
        .order_by("name")
        .values_list(*_INDEX_FIELDS)
    ]


def get_character(project_id, character_id):
    """One Character row scoped to the project (None if missing)."""
    return Character.objects.filter(project_id=project_id, id=character_id).first()


# Every field the Character Studio shows. The studio-only `get_character_full`
# wraps each one as {actual_value, proposal?, proposed_value?} so a pending AI
# enrichment can be reviewed field-by-field. `get_characters` (the shared reader
# Night Eyes / cast / threads use) stays FLAT and untouched.
_FULL_READ_FIELDS = cf.COLUMN_READ_FIELDS + cf.RELATION_FIELDS


def get_character_full(ctx, character_id=None) -> dict:
    """One character for the studio, every field wrapped as
    `{actual_value, proposal?, proposed_value?}`. A field carries the extra keys
    only when a pending `character_edit` proposal proposes a new value for it
    (latest pending wins). The DB still holds plain values; this is a read-time
    merge of the Character row + its pending Proposal(s)."""
    from actions.models import Proposal
    try:
        cid = int(character_id)
    except (TypeError, ValueError) as exc:
        raise _capability_error("character_id is required", 400) from exc

    char = (
        Character.objects.filter(project_id=ctx.project_id, id=cid)
        .values("id", *cf.COLUMN_READ_FIELDS).first()
    )
    if not char:
        raise _capability_error("character not found", 404)
    cf.attach_relationships(ctx.project_id, [char])

    # field -> (proposal_id, proposed_value), from this character's pending edits.
    # `appearance` is the one dict column the studio explodes into per-sub-key
    # cells, so it dedupes per SUB-KEY (appear_pending), not as one blob — each
    # sub-key independently latest-wins and keeps its own proposal id, exactly
    # like a flat field. Collapsing it whole would hide every sub-key proposed by
    # a non-latest proposal until the latest one resolved, then pop them back up.
    pending: dict[str, tuple] = {}
    appear_pending: dict[str, tuple] = {}  # appearance sub-key -> (proposal_id, value)
    rows = (
        Proposal.objects.filter(
            project_id=ctx.project_id, status=Proposal.STATUS_PROPOSED,
        )
        .order_by("created_at")  # later proposals overwrite earlier → latest wins
        .values("id", "proposal")
    )
    for p in rows:
        # Row JSON is {capability, args, preview:{type, character_id, fields}}.
        # Matches both enrichment proposals and propose_character_edit — both store
        # preview.type == "character_edit" with the same fields shape.
        preview = (p["proposal"] or {}).get("preview") or {}
        if preview.get("type") != "character_edit" or preview.get("character_id") != cid:
            continue
        for f, v in (preview.get("fields") or {}).items():
            if f == "appearance" and isinstance(v, dict):
                for sub, sv in v.items():
                    appear_pending[sub] = (p["id"], sv)
            else:
                pending[f] = (p["id"], v)

    out = {"id": char["id"]}
    for f in _FULL_READ_FIELDS:
        if f == "appearance":
            # appearance is a dict column — expose each sub-key as its own
            # {actual_value, proposal?, proposed_value?} cell so the studio can
            # edit / accept / reject each blank independently (field path
            # `appearance.<subkey>`). Each sub-key carries the proposal that owns it.
            out[f] = _wrap_appearance_field(char.get(f), appear_pending)
            continue
        entry = {"actual_value": char.get(f)}
        if f in pending:
            entry["proposal"] = pending[f][0]
            entry["proposed_value"] = pending[f][1]
        out[f] = entry
    return {"character": out}


def _wrap_appearance_field(actual, appear_pending) -> dict:
    """Per-sub-key wrap of the appearance dict: each key → {actual_value,
    proposal?, proposed_value?}. Keys are the union of live + proposed sub-keys,
    so a purely-proposed slot (no live value yet) still gets a cell. Each proposed
    sub-key carries the proposal that owns it (sub-keys may come from different
    proposals — `appear_pending` is `subkey -> (proposal_id, value)`)."""
    actual = actual or {}
    appear_pending = appear_pending or {}
    out: dict = {}
    for k in dict.fromkeys([*actual.keys(), *appear_pending.keys()]):
        cell = {"actual_value": actual.get(k)}
        if k in appear_pending:
            cell["proposal"] = appear_pending[k][0]
            cell["proposed_value"] = appear_pending[k][1]
        out[k] = cell
    return out


def create_character(project_id, *, name, type="", description="") -> dict:
    """Create a Character row. Returns the dict shape get_characters uses.

    The **first** character added to a project is always made the protagonist —
    every story has one, and the cast page is anchored by the protagonist
    spread. This overrides whatever tier the author or the AI suggested (a first
    "supporting" or "main" pick becomes the protagonist); the author can demote
    it later from the character page."""
    is_first = not Character.objects.filter(project_id=project_id).exists()
    char = Character.objects.create(
        project_id=project_id,
        name=name.strip(),
        type=(type or "").strip(),
        description=(description or "").strip(),
        is_protagonist=is_first,
        is_main_character=is_first,
    )
    return {
        "id": char.id, "name": char.name, "type": char.type,
        "description": char.description, "want": char.want,
        "need": char.need, "misbelief": char.misbelief, "story": char.story,
        "is_protagonist": char.is_protagonist,
        "is_main_character": char.is_main_character,
        "is_antagonist": char.is_antagonist,
    }


def patch_character(project_id, character_id, fields: dict) -> dict:
    """Sparse update of author-editable fields (see `characters.fields`).

    Each field is written by its kind (text stripped, bools coerced, JSON as-is,
    `relationships` replaced as rows). An unknown field is a 400, never a silent
    drop. `*_items` JSON arrays are deliberately NOT settable here — those are
    LLM-managed extractions."""
    char = Character.objects.filter(project_id=project_id, id=character_id).first()
    if char is None:
        raise _capability_error("character not found", 404)
    cf.apply_fields(char, fields)
    return _flat_row(project_id, char.id)


def _flat_row(project_id, character_id) -> dict:
    """One character in the flat reader shape (columns + relationships)."""
    row = (
        Character.objects.filter(project_id=project_id, id=character_id)
        .values("id", *cf.COLUMN_READ_FIELDS).first()
    )
    return cf.attach_relationships(project_id, [row])[0]


def delete_character(project_id: int, character_id: int) -> dict:
    """Delete a Character row. Returns {deleted: true, id}."""
    char = Character.objects.filter(project_id=project_id, id=character_id).first()
    if char is None:
        raise _capability_error("character not found", 404)
    # Soft delete: the row stays (hidden from `Character.objects`) so the
    # author's 10-second Undo can bring it back via `undelete_character`.
    char.deleted_at = timezone.now()
    char.save(update_fields=["deleted_at", "updated_at"])
    return {"deleted": True, "id": character_id}


def undelete_character(project_id: int, character_id: int) -> dict:
    """Undo a delete: clear `deleted_at` and return {id, name}."""
    char = Character.all_objects.filter(
        project_id=project_id, id=character_id, deleted_at__isnull=False,
    ).first()
    if char is None:
        raise _capability_error("deleted character not found", 404)
    if Character.objects.filter(project_id=project_id, name=char.name).exists():
        # A new character took the same name during the Undo window.
        raise _capability_error(f"a character named {char.name!r} already exists", 409)
    char.deleted_at = None
    char.save(update_fields=["deleted_at", "updated_at"])
    return {"id": char.id, "name": char.name}


def set_character_portrait(project_id, character_id, portrait_url: str) -> dict:
    """Persist an AI-generated portrait URL onto a Character row."""
    char = Character.objects.filter(project_id=project_id, id=character_id).first()
    if char is None:
        raise _capability_error("character not found", 404)
    char.portrait_url = (portrait_url or "").strip()
    char.save(update_fields=["portrait_url", "updated_at"])
    return {"id": char.id, "name": char.name, "portrait_url": char.portrait_url}


def get_character_detail(ctx, character_id=None) -> dict:
    """One character by id, FLAT (all fields) — the chat by-id reader. Unlike the
    studio's get_character_full it does NOT wrap fields with pending proposals.

    Resilient to the chat model passing a NAME instead of the numeric id — a
    common tool-call slip (`character_id="Mira"`) that used to raise and surface
    as a bare "[ERROR]" mid-consistency-check. A non-numeric argument (or an id
    that matches nothing) falls back to a case-insensitive name match against the
    project's cast before erroring, and the error now names the argument and
    points the model at get_characters instead of dead-ending the turn."""
    fields = ("id", *cf.COLUMN_READ_FIELDS)
    qs = Character.objects.filter(project_id=ctx.project_id)

    try:
        cid = int(character_id)
    except (TypeError, ValueError):
        cid = None

    row = qs.filter(id=cid).values(*fields).first() if cid is not None else None
    if row is None:
        name = str(character_id or "").strip()
        if name:
            row = qs.filter(name__iexact=name).values(*fields).first()

    if not row:
        raise _capability_error(
            f"no character matching {character_id!r} — call get_characters for "
            "the roster (id + name), then retry with a valid numeric character_id",
            404,
        )
    return {"character": cf.attach_relationships(ctx.project_id, [row])[0]}
