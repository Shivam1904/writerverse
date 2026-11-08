"""Braindump tag taxonomy — the canonical ROOT > group > tag vocabulary.

Pure config loader (no Django imports), so any backend layer can use it for
classification / validation / suggestion. Reads ``braindumps/ai/braindump_tags.yml``
once and caches it. The frontend fetches the same data via the
``get_braindump_tag_categories`` reader op.

Public API:
    tag_categories()  -> {name: {"color": str, "tags": [str]}}  (ordered)
    all_tags()        -> {tag, …}  every active craft tag + the category names
    categories_list() -> [{"name", "color", "tags"}]            (ordered, for the API)
    archived()        -> {name: {"color", "tags"}}   (e.g. the pulled-out Entity group)
"""
from __future__ import annotations

from pathlib import Path

import yaml

_CONFIG_PATH = Path(__file__).resolve().parent / "braindump_tags.yml"

_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        raw = yaml.safe_load(_CONFIG_PATH.read_text()) or {}
        _cache = {
            "categories": raw.get("categories") or {},
            "archived": raw.get("archived") or {},
        }
    return _cache



def tag_categories() -> dict:
    """{category_name: {"color": str, "tags": [str]}} in definition order."""
    return _load()["categories"]


def all_tags() -> set[str]:
    """Every active craft tag, plus the category names (they are tags too)."""
    out: set[str] = set()
    for name, grp in tag_categories().items():
        out.add(name)
        out.update(grp.get("tags") or [])
    return out


def archived() -> dict:
    """Archived groups (kept out of the active categories), e.g. Entity."""
    return _load()["archived"]


def categories_list() -> list:
    """Ordered list form — the shape the frontend consumes."""
    return [
        {"name": name, "color": grp.get("color", ""), "tags": list(grp.get("tags") or [])}
        for name, grp in tag_categories().items()
    ]
