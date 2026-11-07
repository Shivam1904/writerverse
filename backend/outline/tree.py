"""Walk the outline dict: `{"acts": [{"chapters": [{"scenes": [{"beats": [...]}]}]}]}`.

The one place that knows how acts, chapters, scenes and beats nest in the
dict `outline.store.load_outline` returns. Pure: no database access.
"""
from __future__ import annotations

from collections.abc import Iterator
from typing import Any, NamedTuple

_CHILDREN = {"act": "chapters", "chapter": "scenes", "scene": "beats"}


class ScenePlace(NamedTuple):
    """One scene with its act and chapter, and its 0-based index in each list."""
    act: dict
    chapter: dict
    scene: dict
    act_index: int
    chapter_index: int
    scene_index: int


def _dicts(items) -> Iterator[tuple[int, dict]]:
    for i, x in enumerate(items or []):
        if isinstance(x, dict):
            yield i, x


def iter_scenes(outline: Any) -> Iterator[ScenePlace]:
    """Every scene in book order, with its act and chapter. Skips non-dict items."""
    if not isinstance(outline, dict):
        return
    for ai, act in _dicts(outline.get("acts")):
        for ci, ch in _dicts(act.get("chapters")):
            for si, sc in _dicts(ch.get("scenes")):
                yield ScenePlace(act, ch, sc, ai, ci, si)


def _iter_nodes(outline: Any) -> Iterator[tuple[str, dict]]:
    if not isinstance(outline, dict):
        return
    stack = [("act", a) for _, a in _dicts(outline.get("acts"))][::-1]
    while stack:
        kind, node = stack.pop()
        yield kind, node
        child_key = _CHILDREN.get(kind)
        if child_key:
            child_kind = child_key[:-1]  # "chapters" -> "chapter"
            stack.extend(reversed([(child_kind, c) for _, c in _dicts(node.get(child_key))]))


def find_node(outline: Any, node_type: str, node_id: Any) -> dict | None:
    """The act / chapter / scene / beat dict with this id, or None."""
    if node_id is None:
        return None
    return next((n for kind, n in _iter_nodes(outline)
                 if kind == node_type and n.get("id") == node_id), None)


def scene_crumb(place: ScenePlace) -> str:
    """`Act → Chapter → Scene` breadcrumb that lets an LLM locate a scene."""
    return (f"{place.act.get('text') or 'Act'} → {place.chapter.get('text') or 'Chapter'}"
            f" → {place.scene.get('text', 'Scene')}")
