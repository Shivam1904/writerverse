"""Pure helpers that turn one outline dict item (act / chapter / scene / beat)
into table columns, and back. No database access here: `outline.store` uses
them, and so does the data migration that copied the old JSON blob into the
tables (0013), so both convert the same way.

The rule that keeps a round trip exact: a key with a column goes in the column
only when its value fits the column; anything else (an unknown key, or a value
of an odd type) is kept as-is in the row's `extra` JSON and written back on load.
"""
from __future__ import annotations

import hashlib
import json

from common.timeutil import iso, parse_iso
from common.tiptap import iter_mentions

# Keys each level stores in columns or child rows (everything else → `extra`).
ACT_KEYS = {"id", "text", "chapters", "created_at", "updated_at"}
CHAPTER_KEYS = {"id", "text", "scenes", "pov", "created_at", "updated_at"}
SCENE_KEYS = {"id", "text", "beats", "content", "words", "analysis", "entity_links",
              "mention_counts", "created_at", "updated_at"}
BEAT_KEYS = {"id", "kind", "text", "from_rough", "from_item", "written",
             "created_at", "updated_at"}
_STAMPS = ("created_at", "updated_at")


def content_hash(content) -> str:
    """A stable hash of a JSON value (key order does not matter)."""
    canonical = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _extra(raw: dict, known: set) -> dict:
    return {k: v for k, v in raw.items() if k not in known}


def _text(raw: dict, extra: dict):
    v = raw.get("text")
    if v is None or isinstance(v, str):
        return v
    extra["text"] = v
    return None


def _stamps(raw: dict, extra: dict) -> dict:
    out = {}
    for key in _STAMPS:
        v = raw.get(key)
        # Only a stamp that comes back as the exact same text goes in the
        # column; any other value is kept as-is in `extra`.
        dt = parse_iso(v, exact=True)
        if v is not None and dt is None:
            extra[key] = v
        out[key] = dt
    return out


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def act_fields(raw: dict, position: int) -> dict:
    extra = _extra(raw, ACT_KEYS)
    return {"title": _text(raw, extra), "position": position, **_stamps(raw, extra),
            "extra": extra}


def chapter_fields(raw: dict, position: int, character_ok) -> dict:
    """`character_ok(id)` says whether a POV character id is a character of
    this project (only then is it stored as the real link)."""
    extra = _extra(raw, CHAPTER_KEYS)
    pov_mode, pov_name, pov_char = None, "", None
    pov = raw.get("pov")
    if pov is not None:
        keys = set(pov) if isinstance(pov, dict) else None
        cid = pov.get("character_id") if keys else None
        if (keys in ({"mode", "character"}, {"mode", "character", "character_id"})
                and isinstance(pov.get("mode"), str) and isinstance(pov.get("character"), str)
                and ("character_id" not in keys or (_is_int(cid) and character_ok(cid)))):
            pov_mode, pov_name, pov_char = pov["mode"], pov["character"], cid
        else:
            extra["pov"] = pov  # an unusual POV: kept exactly as it was
    return {"title": _text(raw, extra), "position": position, "pov_mode": pov_mode,
            "pov_name": pov_name, "pov_character_id": pov_char, **_stamps(raw, extra),
            "extra": extra}


def scene_fields(raw: dict, position: int) -> dict:
    extra = _extra(raw, SCENE_KEYS)
    words = raw.get("words")
    if words is not None and not (_is_int(words) and words >= 0):
        extra["words"] = words
        words = None
    return {"title": _text(raw, extra), "position": position, "words": words,
            "analysis": raw.get("analysis"), "entity_links": raw.get("entity_links"),
            **_stamps(raw, extra), "extra": extra}


def mention_counts(doc) -> dict | None:
    """How many times each entity is @mentioned in a scene's prose, read from
    the TipTap `mention` nodes: `{"character": {"51": 3}, "world": {"7": 1}}`
    (ids as strings, since they are JSON keys). None when there are none.

    Stored on the scene each time its prose is written, so screens that show
    "where does this character appear" read one small column and never the
    prose itself (series scale)."""
    counts: dict[str, dict[str, int]] = {}
    for kind, raw_id, _label in iter_mentions(doc):
        if isinstance(kind, str) and kind and raw_id is not None and str(raw_id).strip():
            per_kind = counts.setdefault(kind, {})
            key = str(raw_id).strip()
            per_kind[key] = per_kind.get(key, 0) + 1
    return counts or None


def scene_doc(raw: dict):
    """(has_prose, doc). A missing or None `content` means "no prose given"."""
    doc = raw.get("content")
    return doc is not None, doc


def beat_fields(raw: dict, position: int, resolve) -> dict:
    """`resolve(from_rough, from_item)` → (thread pk | None, thread beat pk | None).
    A link to a thread or thread beat that does not exist is dropped."""
    extra = _extra(raw, BEAT_KEYS)
    kind = raw.get("kind")
    if kind is not None and not isinstance(kind, str):
        extra["kind"] = kind
        kind = None
    written = raw.get("written")
    if written is not None and not isinstance(written, bool):
        extra["written"] = written
        written = None
    rough = raw.get("from_rough")
    item = raw.get("from_item")
    thread_id, thread_beat_id = resolve(
        rough if isinstance(rough, str) and rough else None,
        item if isinstance(item, str) and item else None,
    )
    return {"kind": kind, "text": _text(raw, extra), "position": position,
            "written": written, "thread_id": thread_id, "thread_beat_id": thread_beat_id,
            **_stamps(raw, extra), "extra": extra}


# ---- rows → dict ---------------------------------------------------------- #
# Each takes a `.values()` row (a dict of column values).

def _with_stamps(d: dict, row: dict) -> dict:
    for key in _STAMPS:
        if row[key] is not None:
            d[key] = iso(row[key])
    return d


def act_dict(row: dict, chapters: list) -> dict:
    d = _with_stamps({"id": row["uid"], "text": row["title"]}, row)
    d["chapters"] = chapters
    d.update(row["extra"] or {})
    return d


def chapter_dict(row: dict, scenes: list) -> dict:
    d = {"id": row["uid"], "text": row["title"]}
    if row["pov_mode"] is not None:
        pov = {"mode": row["pov_mode"],
               # Linked character: its CURRENT name, so a rename shows up everywhere.
               "character": row["pov_character__name"] if row["pov_character_id"] else row["pov_name"]}
        if row["pov_character_id"]:
            pov["character_id"] = row["pov_character_id"]
        d["pov"] = pov
    _with_stamps(d, row)
    d["scenes"] = scenes
    d.update(row["extra"] or {})
    return d


def scene_dict(row: dict, beats: list, doc=None, has_doc: bool = False) -> dict:
    d = {"id": row["uid"], "text": row["title"]}
    for key in ("words", "analysis", "entity_links", "mention_counts"):
        if row[key] is not None:
            d[key] = row[key]
    if has_doc:
        d["content"] = doc
    _with_stamps(d, row)
    d["beats"] = beats
    d.update(row["extra"] or {})
    return d


def beat_dict(row: dict) -> dict:
    d = {"id": row["uid"]}
    if row["kind"] is not None:
        d["kind"] = row["kind"]
    d["text"] = row["text"]
    if row["thread__uid"]:
        d["from_rough"] = row["thread__uid"]
    if row["thread_beat__uid"]:
        d["from_item"] = row["thread_beat__uid"]
    if row["written"] is not None:
        d["written"] = row["written"]
    _with_stamps(d, row)
    d.update(row["extra"] or {})
    return d
