"""World *blocks* — generic, named sections of the World page.

A "block" is just a heading with a list under it (Locations, Factions, the
author's own "Calendar"…). There's no new table and no new column: a block IS a
**tag** on ``Worldbuilding`` (the same ``tags`` list the World page already
groups by — see ``categorise()`` in the frontend ``world/data.ts``). Its items
are the worldbuilding rows whose tags include that heading. So:

  - ``get_world_block(name)`` → the list of items filed under that heading.
  - ``get_world_blocks()``    → every heading to render (known + custom + any
    tag already present on rows), each with its item count.

Headings come from three places, merged and de-duped by their canonical key:

  1. **Known** — ``KNOWN_WORLD_BLOCKS`` below. Suggested headings we expect most
     stories to want (Locations, …). Always offered, even when empty, so the
     page can ghost a "+ add your first location" affordance.
  2. **Custom** — headings the author added themselves. Persisted as
     ``WorldBlock`` rows (one per heading) so an *empty* custom section
     survives.
  3. **Implicit** — any tag already on a worldbuilding row that isn't covered by
     the two above (legacy / AI-added rows still surface as their own block).

Block names are matched case-insensitively; ``block_key`` is the canonical form.
A row tagged with several headings appears under each — multi-filing is fine.
"""
from __future__ import annotations

from worldbuilding.models import Worldbuilding
from worldbuilding.store import load_world_blocks

# Suggested headings — offered even when empty. Order here is the display order.
KNOWN_WORLD_BLOCKS: dict[str, dict[str, str]] = {
    "places": {"label": "Places", "hint": "where things happen"},
    "factions": {"label": "Factions", "hint": "groups and powers in play"},
    "things": {"label": "Things", "hint": "objects that matter"},
    "magic": {"label": "Magic", "hint": "how power works"},
    "creatures": {"label": "Creatures", "hint": "beings and species"},
    "history": {"label": "History", "hint": "what came before"},
    "culture": {"label": "Culture", "hint": "customs, language, daily life"},
}

def block_key(name) -> str:
    """Canonical key for a block name: trimmed, lower-cased, whitespace collapsed.

    ``"  Sacred  Sites "`` → ``"sacred sites"``. Used everywhere two block names
    are compared so "Places" / "places" are one block.
    """
    return " ".join(str(name or "").strip().lower().split())


def known_label(key: str) -> str | None:
    """The display label for a known block key, or None if it isn't known."""
    meta = KNOWN_WORLD_BLOCKS.get(key)
    return meta["label"] if meta else None


def _custom_label(custom, key: str) -> str | None:
    for b in custom or []:
        if isinstance(b, dict) and block_key(b.get("name", "")) == key:
            return (b.get("label") or "").strip() or None
    return None


def _wb_item(row: dict) -> dict:
    """One worldbuilding row in the block's read shape. Carries the real DB `id`
    so the page can update/delete it (unlike the id-less discovery extracts)."""
    return {
        "id": row.get("id"),
        "title": row.get("title") or "",
        "content": row.get("content") or "",
        "tags": list(row.get("tags") or []),
        "pnote": row.get("pnote") or "",
        "status": row.get("status") or "",
        "color": row.get("color") or "",
    }


_ROW_FIELDS = ("id", "title", "content", "tags", "pnote", "status", "color")
_DISPLAY_ORDER = ("order", "-created_at")


def _all_project_rows(project_id) -> list[dict]:
    """WHOLE-PROJECT load: every worldbuilding row. Only for readers whose job is
    the full list (chat's flat entity list). Prefer `_block_rows` for one block."""
    return list(
        Worldbuilding.objects
        .filter(project_id=project_id)
        .order_by(*_DISPLAY_ORDER)
        .values(*_ROW_FIELDS)
    )


def _row_tag_keys(row: dict) -> list[str]:
    return [k for k in (block_key(t) for t in (row.get("tags") or [])) if k]


def _in_block_qs(project_id, key: str):
    """Rows that MAY be filed under block `key` — a DB prefilter on the raw tags
    text (case-insensitive, one LIKE per word of the key). It only narrows: the
    exact, whitespace-normalised tag match is done in Python by the callers.
    Words with a quote or backslash are skipped (JSON escapes them in the text)."""
    qs = Worldbuilding.objects.filter(project_id=project_id)
    for word in key.split():
        if '"' not in word and "\\" not in word:
            qs = qs.filter(tags__icontains=word)
    return qs


def get_world_block(ctx, *, name: str = "", **_ignore) -> dict:
    """Items filed under one heading. The generic per-block reader.

    Returns ``{name, label, items, count}`` where ``items`` are the worldbuilding
    rows whose ``tags`` include ``name`` (case-insensitive). An unknown / empty
    block returns an empty list — never an error — so the page can render the
    heading regardless.
    """
    key = block_key(name)

    # 'characters' is a SYNTHETIC block: its items are the cast (Character table),
    # so a section-source lens can use the characters as its scale alongside the
    # real World blocks. Deliberately NOT listed in get_world_blocks → it never
    # shows as a World-page section; it's offered only in the lens scale picker.
    if key == "characters":
        from characters.models import Character
        names = (
            Character.objects.filter(project_id=ctx.project_id)
            .order_by("name").values_list("name", flat=True)
        )
        items = [
            {"id": None, "title": n.strip(), "content": "", "tags": [],
             "pnote": "", "status": "", "color": ""}
            for n in names if (n or "").strip()
        ]
        return {"name": "characters", "label": "Characters", "items": items, "count": len(items)}

    custom = load_world_blocks(ctx)

    items: list[dict] = []
    if key:
        items = [_wb_item(row) for row in _block_rows(ctx.project_id, key)]

    label = (
        known_label(key)
        or _custom_label(custom, key)
        or (str(name).strip() or key.title())
    )
    return {"name": key, "label": label, "items": items, "count": len(items)}


def _merge_blocks(counts: dict[str, int], labels: dict[str, str], custom) -> list[dict]:
    """Pure merge of known + custom + implicit headings (DB-free; unit-testable)."""
    out: list[dict] = []
    seen: set[str] = set()

    # Custom entries indexed by key, so a known block whose name the author also
    # registered (with a picked glyph/color) still gets those presentation hints.
    custom_by_key: dict[str, dict] = {}
    for b in custom or []:
        if isinstance(b, dict):
            ck = block_key(b.get("name", ""))
            if ck:
                custom_by_key.setdefault(ck, b)

    def add(
        key: str, label: str, *, known: bool, custom_flag: bool, hint: str = "",
    ):
        # presentation overrides the author picked (label / hint / glyph / color).
        # `*_override` carry the RAW author value (None when unset) so a consumer
        # with its OWN default — the structural Places/Things/Rules sections, whose
        # title/hint live in the frontend — can apply only what was actually
        # changed. `label`/`hint` are the resolved values (override → default).
        override = custom_by_key.get(key) or {}
        label_override = (override.get("label") or "").strip() or None
        hint_raw = override.get("hint")
        hint_override = hint_raw.strip() if isinstance(hint_raw, str) and hint_raw.strip() else None
        out.append({
            "name": key,
            "label": label_override or label,
            "count": counts.get(key, 0),
            "known": known,
            "custom": custom_flag,
            # `added` = the author explicitly registered this heading (it has a
            # WorldBlock row), regardless of whether its name
            # also happens to be a known one. This is the signal the page uses to
            # render a section even with zero items yet — a known-named add (e.g.
            # "Factions") must surface too, not just custom-named ones.
            "added": key in custom_by_key,
            "hint": hint_override if hint_override is not None else hint,
            "glyph": (override.get("glyph") or None),
            "color": (override.get("color") or None),
            "label_override": label_override,
            "hint_override": hint_override,
        })
        seen.add(key)

    for key, meta in KNOWN_WORLD_BLOCKS.items():
        add(key, meta["label"], known=True, custom_flag=False, hint=meta.get("hint", ""))

    for key, b in custom_by_key.items():
        if key in seen:
            continue
        label = (b.get("label") or "").strip() or labels.get(key) or key.title()
        add(key, label, known=False, custom_flag=True)

    for key in sorted(counts):
        if key in seen:
            continue
        add(key, labels.get(key) or key.title(), known=False, custom_flag=False)

    return out


def get_world_entities(ctx, **_ignore) -> dict:
    """Flat list of world entities for chat (ai_name: get_world_entities). One row
    per Worldbuilding item: `{entity_id, entity_type, name, description}` where
    entity_type is the item's primary tag (first). The lean sibling of get_world —
    chat edits an entity by entity_id via update_world_entity (no block/index).
    Whole-project on purpose: this IS the full list (the `get_world` capability)."""
    rows = _all_project_rows(ctx.project_id)
    entities = [
        {
            "entity_id": r.get("id"),
            "entity_type": (r.get("tags") or [""])[0] or "",
            "name": r.get("title") or "",
            "description": r.get("content") or "",
        }
        for r in rows
    ]
    return {"entities": entities}


def _block_rows(project_id, key: str) -> list[dict]:
    """Worldbuilding rows filed under one block key, in display order."""
    if not key:
        return []
    rows = _in_block_qs(project_id, key).order_by(*_DISPLAY_ORDER).values(*_ROW_FIELDS)
    return [r for r in rows if key in _row_tag_keys(r)]


def block_row_by_title(project_id, key: str, title: str) -> dict | None:
    """The first row in block `key` whose title matches `title` (trimmed,
    case-insensitive), or None. Reads only rows with that title, not the block."""
    want = (title or "").strip().lower()
    if not key or not want:
        return None
    rows = (
        _in_block_qs(project_id, key)
        .filter(title__icontains=want)
        .order_by(*_DISPLAY_ORDER)
        .values(*_ROW_FIELDS)
    )
    return next(
        (r for r in rows
         if (r.get("title") or "").strip().lower() == want and key in _row_tag_keys(r)),
        None,
    )


def get_world_blocks(ctx, **_ignore) -> dict:
    """Every heading to render on the World page, with per-block item counts.

    Returns ``{blocks: [{name, label, count, known, custom, hint, glyph, color}]}``
    ordered known → custom → implicit.
    """
    counts: dict[str, int] = {}
    labels: dict[str, str] = {}
    # Counts need every row's tags, but only the tags column (no content).
    all_tags = (
        Worldbuilding.objects.filter(project_id=ctx.project_id)
        .order_by(*_DISPLAY_ORDER)
        .values_list("tags", flat=True)
    )
    for tags in all_tags:
        for tag in tags or []:
            key = block_key(tag)
            if not key:
                continue
            counts[key] = counts.get(key, 0) + 1
            labels.setdefault(key, str(tag).strip())

    custom = load_world_blocks(ctx)
    return {"blocks": _merge_blocks(counts, labels, custom)}
