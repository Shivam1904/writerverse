"""The ONE list of character fields, and how each kind is read and written.

Before this file, the editable-field list lived in six places (the gather
allow-list, `patch_character`, three readers, two tool schemas, the proposal
accept). They drifted: the gate dropped `internal_arc`, the writer dropped
`relationships`, and both returned 200 (SA-100). Everything now derives from the
tuples below, and `characters/tests/tests_character_fields.py` checks that every
field the frontend form sends is in here.

Field kinds:
  • text      — a string column, stripped on write.
  • bool      — the three tier flags.
  • json      — dict/list columns, written as-is.
  • relation  — not a column: `relationships` is rows in CharacterRelationship.
                Read as a list of `{character_id, name, label, note}` (this
                character's OUTGOING links); written by replacing that list.
"""
from __future__ import annotations

from typing import Any

TEXT_FIELDS = (
    "name", "type", "description",
    "want", "need", "misbelief", "story", "internal_arc", "backstory",
    "pnote", "summary", "status", "relationship_notes", "color",
)
BOOL_FIELDS = ("is_main_character", "is_protagonist", "is_antagonist")
JSON_FIELDS = ("appearance", "voice_profile", "aliases")
RELATION_FIELDS = ("relationships",)

# What the author may PATCH (update_character).
AUTHOR_EDITABLE = TEXT_FIELDS + BOOL_FIELDS + JSON_FIELDS + RELATION_FIELDS
# What an AI proposal may write. The tier flags stay the author's call.
AI_EDITABLE = TEXT_FIELDS + JSON_FIELDS + RELATION_FIELDS
# Real columns every reader returns (plus `id` and the relation fields).
COLUMN_READ_FIELDS = TEXT_FIELDS + BOOL_FIELDS + JSON_FIELDS + ("portrait_url",)

_ARG_TYPE = {
    **dict.fromkeys(TEXT_FIELDS, "string?"),
    **dict.fromkeys(BOOL_FIELDS, "bool?"),
    "appearance": "dict?", "voice_profile": "dict?", "aliases": "list?",
    "relationships": "list?",
}


def arg_schema(fields) -> dict[str, str]:
    """Tool-schema args for these fields (`{"want": "string?", ...}`)."""
    return {f: _ARG_TYPE[f] for f in fields}


def _error(msg: str, code: int):
    from actions.capabilities.spec import CapabilityError
    return CapabilityError(msg, code)


# ---- relationships -----------------------------------------------------------


def relationships_by_character(project_id, character_ids=None) -> dict[int, dict[str, list]]:
    """`{character_id: {"relationships": [...out], "relationships_in": [...in]}}`
    for the project (or just `character_ids`). One query. Links to a
    soft-deleted character are hidden."""
    from characters.models import CharacterRelationship
    qs = CharacterRelationship.objects.filter(
        project_id=project_id,
        from_character__deleted_at__isnull=True,
        to_character__deleted_at__isnull=True,
    ).select_related("from_character", "to_character")
    if character_ids is not None:
        ids = list(character_ids)
        from django.db.models import Q
        qs = qs.filter(Q(from_character_id__in=ids) | Q(to_character_id__in=ids))
    out: dict[int, dict[str, list]] = {}

    def slot(cid):
        return out.setdefault(cid, {"relationships": [], "relationships_in": []})

    for r in qs.order_by("from_character_id", "position", "id"):
        slot(r.from_character_id)["relationships"].append({
            "id": r.id, "character_id": r.to_character_id,
            "name": r.to_character.name, "label": r.label, "note": r.note,
        })
        slot(r.to_character_id)["relationships_in"].append({
            "id": r.id, "character_id": r.from_character_id,
            "name": r.from_character.name, "label": r.label, "note": r.note,
        })
    return out


def attach_relationships(project_id, rows: list[dict]) -> list[dict]:
    """Add `relationships` + `relationships_in` to reader rows (dicts with `id`)."""
    rels = relationships_by_character(project_id, [r["id"] for r in rows])
    for r in rows:
        got = rels.get(r["id"], {})
        r["relationships"] = got.get("relationships", [])
        r["relationships_in"] = got.get("relationships_in", [])
    return rows


def compare_form(items) -> list[dict]:
    """The part of a relationship list that matters for "did it change?":
    target id + label + note, in order. Names are display-only."""
    out = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        out.append({
            "character_id": it.get("character_id"),
            "label": str(it.get("label") or "").strip(),
            "note": str(it.get("note") or "").strip(),
        })
    return out


def normalize_relationships(project_id, from_id, items) -> list[dict]:
    """Validate a relationship list and resolve each target to a live character
    of the SAME project. Each item: `{character_id | name, label, note?}`
    (`relationship_type` is accepted as an old name for `label`). A target in
    another project, or no such character → 404. Self-links → 400. Duplicate
    (target, label) pairs collapse to the first."""
    from characters.models import Character
    if items is None:
        return []
    if not isinstance(items, list):
        raise _error("relationships must be a list", 400)
    live = Character.objects.filter(project_id=project_id)
    seen: set = set()
    out: list[dict] = []
    for it in items:
        if not isinstance(it, dict):
            raise _error("each relationship must be an object", 400)
        label = str(it.get("label") or it.get("relationship_type") or "").strip()[:60]
        if not label:
            raise _error("each relationship needs a label", 400)
        target = None
        raw_id = it.get("character_id")
        if raw_id not in (None, ""):
            try:
                target = live.filter(id=int(raw_id)).values("id", "name").first()
            except (TypeError, ValueError):
                target = None
        elif str(it.get("name") or "").strip():
            target = live.filter(name__iexact=str(it["name"]).strip()).values("id", "name").first()
        if target is None:
            raise _error("relationship target character not found", 404)
        if from_id is not None and target["id"] == int(from_id):
            raise _error("a character can't have a relationship with themselves", 400)
        key = (target["id"], label.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "character_id": target["id"], "name": target["name"],
            "label": label, "note": str(it.get("note") or "").strip(),
        })
    return out


def replace_relationships(char, items) -> None:
    """Make `char`'s outgoing links exactly `items` (validated first)."""
    from characters.models import CharacterRelationship
    clean = normalize_relationships(char.project_id, char.id, items)
    CharacterRelationship.objects.filter(from_character=char).delete()
    CharacterRelationship.objects.bulk_create([
        CharacterRelationship(
            project_id=char.project_id, from_character=char,
            to_character_id=it["character_id"], label=it["label"],
            note=it["note"], position=i,
        )
        for i, it in enumerate(clean)
    ])


# ---- generic read / write ----------------------------------------------------


def read_field(char, field: str) -> Any:
    """The live value of one field (column or relation) for stamps/compare."""
    if field == "relationships":
        rels = relationships_by_character(char.project_id, [char.id]).get(char.id, {})
        return compare_form(rels.get("relationships", []))
    return getattr(char, field)


def apply_fields(char, fields: dict, *, allowed=AUTHOR_EDITABLE) -> list[str]:
    """Write `fields` onto `char` by kind and save. Unknown fields raise 400 —
    never a silent drop. Returns the names written."""
    unknown = [f for f in fields if f not in allowed]
    if unknown:
        raise _error(f"not an editable character field: {', '.join(sorted(unknown))}", 400)
    cols: list[str] = []
    for f, v in fields.items():
        if f in TEXT_FIELDS:
            setattr(char, f, ("" if v is None else str(v)).strip())
            cols.append(f)
        elif f in BOOL_FIELDS:
            setattr(char, f, bool(v))
            cols.append(f)
        elif f in JSON_FIELDS:
            setattr(char, f, v)
            cols.append(f)
    from django.db import transaction
    with transaction.atomic():  # a bad relationship target writes nothing at all
        if cols:
            char.save(update_fields=cols + ["updated_at"])
        if "relationships" in fields:
            replace_relationships(char, fields["relationships"])
    return list(fields)
