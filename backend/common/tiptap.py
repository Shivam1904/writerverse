"""Plain-text and reference helpers for TipTap (ProseMirror) JSON docs.

A scene's prose is stored as a TipTap doc: `{"type": "doc", "content": [...]}`,
where each block (paragraph, heading, list item ...) holds inline nodes (text,
@mentions, hard breaks). Pure: no Django, no WriterVerse app imports.
"""
from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

# Inline node types: their text runs on with the text next to them. Every
# other node type is a block, kept apart from its neighbours by a newline (so
# "end." + "Start" in two paragraphs never fuses into one word).
_INLINE = {"text", "mention", "hardBreak"}

# Entity types `node_refs` reports.
_REF_TYPES = ("character", "braindump", "worldbuilding")


def node_text(node: Any) -> str:
    """Plain text of a node, a list of nodes, or a whole doc. Text inside a
    block is joined with nothing (so bold/italic edges don't split a word);
    blocks are joined with a newline. A mention reads as its label."""
    if not node:
        return ""
    if isinstance(node, list):
        return _join(node)
    if isinstance(node, dict):
        kind = node.get("type")
        if kind == "text":
            return node.get("text", "") or ""
        if kind == "mention":
            return str((node.get("attrs") or {}).get("label") or "")
        if kind == "hardBreak":
            return "\n"
        return _join(node.get("content") or [])
    return ""


def _join(nodes: list) -> str:
    out: list[str] = []
    prev_block = False
    for n in nodes:
        block = not (isinstance(n, dict) and n.get("type") in _INLINE)
        if out and (block or prev_block):
            out.append("\n")
        out.append(node_text(n))
        prev_block = block
    return "".join(out)


def word_count(doc: Any) -> int:
    """Words in a doc (whitespace-separated runs of its plain text)."""
    return len(node_text(doc).split())


def mention_ref(node: dict) -> tuple[Any, Any, Any]:
    """(entity type, entity id, label) of one `mention` node, as stored (raw)."""
    attrs = node.get("attrs") or {}
    raw_id = attrs.get("id") if attrs.get("id") is not None else attrs.get("entityId")
    return (attrs.get("entityType") or attrs.get("entity_type"), raw_id, attrs.get("label"))


def iter_mentions(node: Any) -> Iterator[tuple[Any, Any, Any]]:
    """`mention_ref` of every `mention` node under `node`, in document order."""
    if isinstance(node, list):
        for n in node:
            yield from iter_mentions(n)
    elif isinstance(node, dict):
        if node.get("type") == "mention":
            yield mention_ref(node)
        yield from iter_mentions(node.get("content") or [])


def node_refs(node: Any) -> list[dict]:
    """Entity references carried by a paragraph — `mention` nodes (characters)
    and `spanRef` marks (braindumps / worldbuilding), plus any paragraph-level
    `attrs.refs` already attached by a prior AI edit. Returns
    `[{entityType, id, label}]`, de-duplicated on (entityType, id)."""
    out: list[dict] = []
    seen: set[tuple[str, int]] = set()

    def _add(entity_type: Any, raw_id: Any, label: Any) -> None:
        if entity_type not in _REF_TYPES or raw_id is None:
            return
        try:
            entity_id = int(raw_id)
        except (TypeError, ValueError):
            return
        key = (entity_type, entity_id)
        if key in seen:
            return
        seen.add(key)
        out.append({"entityType": entity_type, "id": entity_id, "label": str(label or "")})

    # Paragraph-level refs from a previous AI edit (carry-forward convention).
    for ref in (node.get("attrs") or {}).get("refs") or []:
        if isinstance(ref, dict):
            _add(ref.get("entityType") or ref.get("entity_type"),
                 ref.get("id") or ref.get("entityId"), ref.get("label"))

    def walk(n: Any) -> None:
        if isinstance(n, list):
            for c in n:
                walk(c)
            return
        if not isinstance(n, dict):
            return
        if n.get("type") == "mention":
            _add(*mention_ref(n))
        if n.get("type") == "text":
            for mark in n.get("marks") or []:
                if not isinstance(mark, dict) or mark.get("type") != "spanRef":
                    continue
                attrs = mark.get("attrs") or {}
                raw = attrs.get("entitiesJson") or attrs.get("entities_json")
                items: list = []
                if raw:
                    try:
                        parsed = json.loads(raw)
                        if isinstance(parsed, list):
                            items = parsed
                    except Exception:  # noqa: BLE001 — malformed mark, skip
                        items = []
                if not items and attrs.get("entityId"):
                    items = [{
                        "id": attrs.get("entityId"),
                        "entityType": attrs.get("entityType"),
                        "entityLabel": attrs.get("entityLabel"),
                    }]
                for it in items:
                    _add(it.get("entityType"), it.get("id"),
                         it.get("entityLabel") or it.get("label"))
        for c in n.get("content") or []:
            walk(c)

    walk(node)
    return out
