"""Gauge config loader + archetype→lens merge.

Owns: YAML loader, config resolution, module-level constants computed at import
time via _build(), and the small accessor helpers (type_by_id, etc.).
"""
from __future__ import annotations

import glob
import os
import re
from collections.abc import Callable  # noqa: F401 — re-exported via __init__
from pathlib import Path
from typing import Any

import yaml

# ---------------------------------------------------------------------------
# YAML loader that doesn't coerce off/on/yes/no to booleans
# ---------------------------------------------------------------------------

class _GaugeYamlLoader(yaml.SafeLoader):
    """SafeLoader that does NOT coerce ``off``/``on``/``yes``/``no`` to booleans.

    The config uses ``good:`` / ``off:`` as KEYS (the decide-card ✓/⚠ pair). YAML
    1.1's implicit bool resolver would turn ``off:`` into the key ``False`` and the
    value would silently vanish. We keep ``true``/``false`` as real booleans
    (``judges: false`` must stay bool) but treat off/on/yes/no as plain strings.
    """


# Strip the bool resolver from y/n/o/t/f start-chars, then re-add it for true/false only.
for _ch in "yYnNoOtTfF":
    _GaugeYamlLoader.yaml_implicit_resolvers[_ch] = [
        (tag, rx) for (tag, rx) in
        _GaugeYamlLoader.yaml_implicit_resolvers.get(_ch, [])
        if tag != "tag:yaml.org,2002:bool"
    ]
_GaugeYamlLoader.add_implicit_resolver(
    "tag:yaml.org,2002:bool",
    re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"),
    list("tTfF"),
)

# ---------------------------------------------------------------------------
# Module-level constants (shared with _rules and _serve via this module)
# ---------------------------------------------------------------------------

# Only these math rules have a LIVE verdict (the shape rules in _rules.py). arc /
# oscillate are demoable in the dialog but their verdict is DEFERRED — we never
# ship them to the shape check, so an `arc` lens reads as a plain map for now.
_LIVE_MATH_RULES = {"rising", "falling", "flat"}

# Verdict-rule resolution order per lens: explicit `rule` → `math_rule` (shape
# alias, arcs) → this type default → none. `checklist` defaults to cover_all;
# `setup_payoff` is TYPE-INTRINSIC (no registry rule — its verdict is the
# pairing: a setup with no payoff scene = hanging); trackers declare `rule:`.
_DEFAULT_RULE_BY_TYPE = {"checklist": "cover_all"}

# Which LLM role each gauge AI pass uses (a pass not listed uses "small").
# probe and coverage stay on "small" on purpose (owner, 2026-10-20, wrt-25): the
# answers look good and the cheapest role keeps lens reads affordable. Revisit
# with a side-by-side small vs draft run if lenses start missing subtle problems.
_ROLES = {"extract": "small", "probe": "small", "coverage": "small"}

_CFG_DIR = Path(__file__).resolve().parents[1] / "config"

# Tolerances used by the rule registry (defined here to avoid circular imports).
_INVERSION_TOL = 0.10
_FLAT_VAR_TOL = 0.5

# Beat placeholder sentinel (defined here to avoid circular imports between
# _analyse and _config; _analyse imports it from here).
_PLACEHOLDER_BEAT_TEXT = "author has not added any content yet"

# which rule FAMILY each type may pick from (gates the menu, like `visuals`).
# Defined here (not _rules) so _rules can import it without circular imports.
_RULE_FAMILY_BY_TYPE = {
    "arc": "shape", "map": "shape", "tracker": "constraint",
    "checklist": "coverage", "setup_payoff": "coverage",
}


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _deep_merge(base: Any, over: Any) -> Any:
    """Deep-merge two dicts (``over`` wins). Non-dict values replace outright."""
    if not isinstance(base, dict) or not isinstance(over, dict):
        return over if over is not None else base
    out = dict(base)
    for k, v in over.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _norm_y_items(raw: Any) -> list[dict]:
    """Normalise y_items to ``[{value, description}]`` (the one shared surface).

    Tolerant of bare strings and ``{value, source, …}`` dicts so config, the
    extract output, and user input all funnel through one shape.
    """
    out: list[dict] = []
    seen: set[str] = set()
    for v in raw or []:
        if isinstance(v, dict):
            val = (v.get("value") or "").strip()
            desc = (v.get("description") or "").strip()
        elif isinstance(v, str):
            val, desc = v.strip(), ""
        else:
            continue
        key = val.lower()
        if not val or key in seen:
            continue
        seen.add(key)
        out.append({"value": val, "description": desc})
    return out


def _rules_of(spec: dict, type_id: str | None) -> list[str]:
    """The verdict rule LIST for a config. Accepts either ``rules`` or ``rule`` as a
    LIST **or** a single string (the launch config authors ``rule: [ids]``; arcs use
    ``math_rule: rising``). Falls back to ``math_rule`` then the type default. Drops
    ``none``. Analyse runs ALL of them and merges their offending into one report."""
    raw = spec.get("rules")
    if raw is None:
        raw = spec.get("rule")          # launch uses `rule:` (a list, or a string)
    if isinstance(raw, str):
        out = [raw] if raw and raw != "none" else []
    elif isinstance(raw, list):
        out = [r for r in raw if isinstance(r, str) and r and r != "none"]
    else:
        out = []
    if not out:
        mr = (spec.get("math_rule") or "").strip()
        out = [mr] if mr and mr != "none" else []
    if not out:
        d = _DEFAULT_RULE_BY_TYPE.get(type_id)
        out = [d] if d else []
    return out


def _fill_axis(cfg: dict) -> dict:
    """Default-fill axis = {outline, scene} (today's behaviour) when absent."""
    ax = cfg.get("axis") or {}
    cfg["axis"] = {"walk": (ax.get("walk") or "outline").strip(),
                   "tick": (ax.get("tick") or "scene").strip()}
    return cfg


def _resolve_lens(arch: dict, arch_eyes: dict, lens: dict) -> dict:
    """One config lens deep-merged with its archetype → a flat resolved def.

    Structural fields stay top-level; the four-eyes copy is flattened onto the
    envelope so the loose chart object is a single bag the FE reads directly.
    """
    eyes = _deep_merge(arch_eyes, lens.get("eyes") or {})
    user = eyes.get("user") or {}
    ai = eyes.get("ai") or {}
    designer = eyes.get("designer") or {}
    # Start from a copy of the authored lens so ANY extra field the Writing team
    # adds (genre_presets / scope_presets / structure_presets / *_default / …)
    # flows through untouched (loose typing). Then overlay the computed fields.
    out = dict(lens)
    out.update({
        "id": lens.get("id"),
        "source": "bank",
        "name": (lens.get("name") or lens.get("id") or "").strip(),
        "type_id": arch.get("id"),
        "data_style": arch.get("data_style"),
        "display": arch.get("display"),
        # chart-visual menu (default first = display) + findings-form menu.
        # The user's actual pick lives on the BINDING, not here (see build_board).
        "visuals": list(arch.get("visuals") or ([arch["display"]] if arch.get("display") else [])),
        "report_views": list(arch.get("report_views") or []),
        "visual_default": lens.get("visual_default"),  # optional per-lens nudge
        "judges": bool(arch.get("judges")),
        "scope_type": (lens.get("scope_type") or "story"),
        "y_items_source": (lens.get("y_items_source") or "predefined"),
        # bank curation hint (launch/INDEX "two faces"): core = beginner working
        # set, range = shows the ceiling. Authored per-lens; carried so the bank
        # can lead with core. Defaults to "core" when unset.
        "tier": (lens.get("tier") or "core"),
        # which library PACK this lens ships in — "all bank" is a SUPERSET; launch
        # is the featured subset. Open set (launch | pro | extra | …); unset = launch.
        "pack": (lens.get("pack") or "launch"),
        # verdict RULE LIST (from _shared.yml `rules`); analyse runs ALL + merges.
        # legacy single `rule`/`math_rule` is wrapped; coverage types default cover_all.
        "rules": _rules_of(lens, arch.get("id")),
        "math_rule": lens.get("math_rule"),
        "math_rule_explain": (lens.get("math_rule_explain") or "").strip() or None,
        "y_items": _norm_y_items(lens.get("y_items")),
        # eyes.user — the human-facing copy
        "kind_word": user.get("kind_word"),
        "y_items_word": user.get("y_items_word"),
        "watches": user.get("watches"),
        "read_as": user.get("read_as"),
        "look_for": user.get("look_for"),
        "good": user.get("good"),
        "off": user.get("off"),
        "invariant": user.get("invariant"),
        "direction": user.get("direction"),
        "y_items_hint": user.get("y_items_hint"),
        # eyes.designer — render hints
        "glyph": designer.get("glyph"),
        "verdict_style": designer.get("verdict_style"),
        "empty_state": designer.get("empty_state"),
        "output_language": (designer.get("chart_view") or {}).get("output_language"),
        # eyes.ai — locked heads (shown 🔒 read-only in the custom dialog) + bodies
        "analyse_head": (ai.get("analyse_head") or "").strip() or None,
        "extract_head": (ai.get("extract_head") or "").strip() or None,
        "analyse_body": (ai.get("analyse_body") or "").strip() or None,
        "extract_body": (ai.get("extract_body") or "").strip() or None,
        # The full merged eyes blob — forward-compat: any field the Writing team
        # authors that isn't flattened above still reaches the FE here (loose
        # typing, no contract to renegotiate).
        "eyes": eyes,
        "is_custom": False,
    })
    return _fill_axis(out)


def _load_yaml(path: Path) -> dict:
    try:
        with open(path) as f:
            return yaml.load(f, _GaugeYamlLoader) or {}
    except FileNotFoundError:
        return {}


def _build() -> tuple[dict[str, dict], list[dict], dict]:
    """Load every config file → (lenses_by_id, types, shared).

    Two passes so lenses can be split across files:
      1. **Type files** (have an `archetype`) define the type + their own lenses.
      2. **Extension files** (have `extends: <type_id>`, no archetype) contribute
         extra lenses to an existing type — they inherit that type's archetype.
         This is how the post-launch `*-extended.yml` packs add to a type without
         duplicating the archetype (the launch/extended split stays clean in config).
    """
    shared = _load_yaml(_CFG_DIR / "_shared.yml")
    lenses_by_id: dict[str, dict] = {}
    types: list[dict] = []
    # type_id -> (arch, arch_eyes, type_dict) so pass 2 can resolve + append.
    type_index: dict[str, tuple[dict, dict, dict]] = {}

    docs = [
        _load_yaml(Path(fp))
        for fp in sorted(glob.glob(str(_CFG_DIR / "*.yml")))
        if not os.path.basename(fp).startswith("_")  # _shared.yml etc. aren't config
    ]

    def _add_lenses(arch: dict, arch_eyes: dict, type_dict: dict, raw_lenses) -> None:
        for lens in raw_lenses or []:
            if not isinstance(lens, dict) or not lens.get("id"):
                continue
            resolved = _resolve_lens(arch, arch_eyes, lens)
            lenses_by_id[resolved["id"]] = resolved
            type_dict["lenses"].append(resolved)

    # Pass 1 — type files (archetype present).
    for doc in docs:
        arch = doc.get("archetype") or {}
        if not arch.get("id"):
            continue
        arch_eyes = arch.get("eyes") or {}
        designer = arch_eyes.get("designer") or {}
        arch_ai = arch_eyes.get("ai") or {}
        type_dict = {
            "id": arch.get("id"),
            "data_style": arch.get("data_style"),
            "display": arch.get("display"),
            "visuals": list(arch.get("visuals") or ([arch["display"]] if arch.get("display") else [])),
            "report_views": list(arch.get("report_views") or []),
            "judges": bool(arch.get("judges")),
            "kind_word": (arch_eyes.get("user") or {}).get("kind_word"),
            "y_items_word": (arch_eyes.get("user") or {}).get("y_items_word"),
            "glyph": designer.get("glyph"),
            "verdict_style": designer.get("verdict_style"),
            "empty_state": designer.get("empty_state"),
            "output_language": (designer.get("chart_view") or {}).get("output_language"),
            "custom_dialog": designer.get("custom_dialog") or [],
            # locked AI heads, shown 🔒 read-only in the custom dialog (§1 map)
            "analyse_head": (arch_ai.get("analyse_head") or "").strip() or None,
            "extract_head": (arch_ai.get("extract_head") or "").strip() or None,
            "lenses": [],
        }
        _add_lenses(arch, arch_eyes, type_dict, doc.get("lenses"))
        types.append(type_dict)
        type_index[arch["id"]] = (arch, arch_eyes, type_dict)

    # Pass 2 — extension files (extends: <type_id>, no archetype of their own).
    for doc in docs:
        ext_id = doc.get("extends")
        if not ext_id or ext_id not in type_index:
            continue
        arch, arch_eyes, type_dict = type_index[ext_id]
        _add_lenses(arch, arch_eyes, type_dict, doc.get("lenses"))

    return lenses_by_id, types, shared


# ---------------------------------------------------------------------------
# Module-level constants — computed at import time (preserved behaviour)
# ---------------------------------------------------------------------------

GAUGE_LENSES_BY_ID: dict[str, dict]
GAUGE_TYPES: list[dict]
GAUGE_SHARED: dict
GAUGE_LENSES_BY_ID, GAUGE_TYPES, GAUGE_SHARED = _build()


# ---------------------------------------------------------------------------
# Public config accessors
# ---------------------------------------------------------------------------

def type_by_id(type_id: str) -> dict | None:
    return next((t for t in GAUGE_TYPES if t["id"] == type_id), None)


def type_by_display(display: str) -> dict | None:
    return next((t for t in GAUGE_TYPES if t["display"] == display), None)


def build_preset(preset_id: str, payload: dict) -> dict:
    """Build a resolved PRESET config (same shape as a template lens) from a
    payload — works for an authored custom lens, an invented AI spec, OR a copy
    of a template (the payload is already resolved). The archetype (by `type` or
    `display`) supplies the locked axes (data_style/display/judges), the locked
    AI heads, and the visuals/report_views menus; the payload supplies the copy,
    scale, and `rules` list. Raises ValueError on a bad type.
    """
    arch = type_by_id(payload.get("type") or payload.get("type_id")) \
        or type_by_display((payload.get("display") or "").strip())
    if arch is None:
        raise ValueError(f"unknown gauge type/display: "
                         f"{payload.get('type') or payload.get('display')!r}")
    cfg = dict(payload)
    cfg.update({
        "id": preset_id,
        "name": (payload.get("name") or preset_id).strip(),
        "type_id": arch["id"],
        "data_style": arch["data_style"],
        "display": (payload.get("display") or arch["display"]),
        "visuals": list(payload.get("visuals") or arch.get("visuals") or [arch["display"]]),
        "report_views": list(payload.get("report_views") or arch.get("report_views") or []),
        "judges": bool(arch["judges"]),
        "scope_type": (payload.get("scope_type") or "story").strip(),
        "y_items_source": (payload.get("y_items_source") or "user").strip(),
        "y_items": _norm_y_items(payload.get("y_items")),
        "rules": _rules_of(payload, arch["id"]),
        "kind_word": payload.get("kind_word") or arch.get("kind_word"),
        "y_items_word": payload.get("y_items_word") or arch.get("y_items_word"),
        "glyph": payload.get("glyph") or arch.get("glyph"),
        "verdict_style": payload.get("verdict_style") or arch.get("verdict_style"),
        "empty_state": payload.get("empty_state") or arch.get("empty_state"),
        "output_language": payload.get("output_language") or arch.get("output_language"),
        # locked heads always come from the archetype
        "analyse_head": arch.get("analyse_head"),
        "extract_head": arch.get("extract_head"),
        "is_custom": True,
    })
    return _fill_axis(cfg)


def resolve_config(ref_id: str, kind: str, presets: dict | None = None) -> dict | None:
    """Resolve a binding's ref to its config: a shared template (kind=template)
    or a user preset (kind=preset). Analyse/serving read THROUGH this."""
    if kind == "preset":
        return (presets or {}).get(ref_id)
    return GAUGE_LENSES_BY_ID.get(ref_id)
