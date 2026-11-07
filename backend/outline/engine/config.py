"""Grand-outline config: scaffolds, base scaffolds, story templates, LLM roles."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


def _load_cfg() -> dict:
    """Grand-outline config (outline/config/grand_outline.yml)."""
    p = Path(__file__).resolve().parents[1] / "config" / "grand_outline.yml"
    try:
        with open(p) as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}


_CFG = _load_cfg()

SCAFFOLD: dict[str, list[str]] = _CFG.get("scaffold", {})

# v3 §6 — nested act→chapter→scene base trees, one per grand_outline_base_fit
# template. Authoritative source for default_grand_outline(); see outline/config/grand_outline.yml.
BASE_SCAFFOLD: dict[str, list[dict]] = _CFG.get("base_scaffold", {})


def _resolve_template(t: dict) -> dict:
    """Inline scaffold-key refs (`scaffold:`, chart `required:`) to beat lists
    so downstream code sees fully-resolved data."""
    t = dict(t)
    if isinstance(t.get("scaffold"), str):
        t["scaffold"] = SCAFFOLD.get(t["scaffold"], [])
    charts = []
    for c in t.get("charts", []):
        c = dict(c)
        if isinstance(c.get("required"), str):
            c["required"] = SCAFFOLD.get(c["required"], [])
        charts.append(c)
    t["charts"] = charts
    return t


ALL_TEMPLATES: list[dict[str, Any]] = [
    _resolve_template(t) for t in _CFG.get("templates", [])
]
_TEMPLATES_BY_ID = {t["id"]: t for t in ALL_TEMPLATES}

# Which LLM role each outline AI pass uses (a pass not listed uses "small").
_ROLES = {"outline": "small"}

