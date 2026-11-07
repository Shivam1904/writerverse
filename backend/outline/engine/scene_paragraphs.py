"""Paragraph-level view of a scene's TipTap content.

A scene's prose is a TipTap `doc` whose top-level blocks are paragraphs. The AI
edits prose by paragraph index (plain text in, plain text out) — it never builds
or patches the TipTap tree, which is the failure mode that silently dropped an
edit (the 2026-06-06 `save_scene_content content:null` incident).

Pure dict helpers, no Django — shared by the read tool (`get_scene_paragraphs`),
the propose gather (anchor snapshots), and the accept commit (apply + carry
references forward). Text and reference extraction live in `common.tiptap`.
"""
from __future__ import annotations

import re
from typing import Any

from common.tiptap import node_refs, node_text

# Marker ref the AI stamps on a freshly-inserted paragraph. It is NOT an entity
# (no id, not a real type) — the write-page editor (AiGeneratedBlock) renders any
# paragraph whose `attrs.refs` carries this as a pending green block with an
# Accept button; accepting strips the ref and the paragraph becomes normal prose.
# Marginalia / the entity index skip it (handled by the entity-type + id guards).
AI_GENERATED_REF = {"entityType": "ai-generated"}


def paragraph_nodes(doc: Any) -> list[dict]:
    """Top-level paragraph blocks of a TipTap doc, in order."""
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        return []
    return [
        n for n in (doc.get("content") or [])
        if isinstance(n, dict) and n.get("type") == "paragraph"
    ]


def scene_paragraphs(scene: dict | None) -> list[dict]:
    """The AI-facing ordered paragraph list: `[{index, text, refs}]`. `refs` is
    read-only context (the entities the author already marked) — the AI never
    sets references; it only sees which paragraphs carry them."""
    doc = (scene or {}).get("content")
    return [
        {"index": i, "text": node_text(n), "refs": node_refs(n)}
        for i, n in enumerate(paragraph_nodes(doc))
    ]


def text_to_nodes(text: str, refs: list[dict] | None = None) -> list[dict]:
    """Plain text → one or more TipTap paragraph nodes (split on blank lines /
    newlines). `refs`, when given, attach as paragraph-level `attrs.refs` on the
    FIRST node — the carry-forward of an edited paragraph's references, coarsened
    to the whole paragraph (the AI never authors these; they are preserved)."""
    chunks = [c.strip() for c in re.split(r"\n+", text or "") if c.strip()]
    if not chunks:
        nodes: list[dict] = [{"type": "paragraph"}]
    else:
        nodes = [
            {"type": "paragraph",
             "content": [{"type": "text", "text": c}]}
            for c in chunks
        ]
    if refs:
        nodes[0].setdefault("attrs", {})["refs"] = list(refs)
    return nodes
