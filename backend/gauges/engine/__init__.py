"""Gauges engine — split into submodules for maintainability.

Re-exports every public symbol from the four submodules so all callers that do:
    from gauges import engine as gengine
    import gauges.engine as g
continue to work with zero changes. The module-level constants (GAUGE_LENSES_BY_ID,
GAUGE_TYPES, GAUGE_SHARED) are computed at import time inside _config.py and
re-exported here — same semantics as the original single-file module.

Submodule layout:
  _config.py  — YAML loader, config resolution, build() constants, accessors
  _rules.py   — pure deterministic verdict registry
  _analyse.py — LLM-backed analysis (state + payoff), tick providers
  _serve.py   — board builder, catalogue, suggest/invent runners
"""
from __future__ import annotations

from ._analyse import (
    _TICK_PROVIDERS,
    _aggregate_beats,
    _axis_of,
    _beat_display_text,
    _find_thread,
    _group_by_heading,
    _leaf_beats,
    _payoff_haystack,
    _run_gauge_state_analyse,
    _run_payoff_analyse,
    _scenes_block,
    _ticks_block,
    _ticks_outline_act,
    _ticks_outline_beat,
    _ticks_outline_chapter,
    _ticks_outline_heading,
    _ticks_outline_scene,
    _ticks_thread_beat,
    _ticks_thread_heading,
    order_fingerprint,
    resolve_ticks,
    run_gauge_analyse,
    run_gauge_extract,
)
from ._config import (
    _CFG_DIR,
    _DEFAULT_RULE_BY_TYPE,
    _FLAT_VAR_TOL,
    _INVERSION_TOL,
    _LIVE_MATH_RULES,
    _PLACEHOLDER_BEAT_TEXT,
    _RULE_FAMILY_BY_TYPE,
    GAUGE_LENSES_BY_ID,
    GAUGE_SHARED,
    GAUGE_TYPES,
    _build,
    _deep_merge,
    _fill_axis,
    _GaugeYamlLoader,
    _load_yaml,
    _norm_y_items,
    _resolve_lens,
    _rules_of,
    build_preset,
    resolve_config,
    type_by_display,
    type_by_id,
)
from ._rules import (
    _RULE_FNS,
    _idx_seq,
    _rule_cover_all,
    _rule_cover_once,
    _rule_deferred,
    _rule_flat,
    _rule_monotone,
    _rule_shape,
    _rule_single_occupancy,
    _verdict_text,
    compatible_rules,
    lens_rules,
)
from ._serve import (
    _elements_summaries,
    _slug_inv,
    _suggest_catalogue_menu,
    build_board,
    build_catalogue,
    flatten_inventions,
    flatten_suggestions,
    run_invent_lens_from_ask,
    run_suggest_custom_gauges,
    run_suggest_gauges,
    shape_invention_item,
    shape_suggestion_item,
)

__all__ = [
    # _config — public constants
    "GAUGE_LENSES_BY_ID",
    "GAUGE_TYPES",
    "GAUGE_SHARED",
    # _config — public functions
    "type_by_id",
    "type_by_display",
    "build_preset",
    "resolve_config",
    # _config — private (used by callers or tests)
    "_norm_y_items",
    "_deep_merge",
    "_rules_of",
    "_fill_axis",
    "_resolve_lens",
    "_build",
    "_load_yaml",
    "_LIVE_MATH_RULES",
    "_DEFAULT_RULE_BY_TYPE",
    "_INVERSION_TOL",
    "_FLAT_VAR_TOL",
    "_PLACEHOLDER_BEAT_TEXT",
    "_RULE_FAMILY_BY_TYPE",
    "_CFG_DIR",
    "_GaugeYamlLoader",
    # _rules — public
    "lens_rules",
    "compatible_rules",
    "_verdict_text",
    # _rules — registry
    "_RULE_FNS",
    "_idx_seq",
    "_rule_shape",
    "_rule_flat",
    "_rule_monotone",
    "_rule_single_occupancy",
    "_rule_cover_once",
    "_rule_cover_all",
    "_rule_deferred",
    # _analyse — public
    "run_gauge_analyse",
    "run_gauge_extract",
    "order_fingerprint",
    "resolve_ticks",
    # _analyse — private helpers
    "_axis_of",
    "_scenes_block",
    "_ticks_block",
    "_beat_display_text",
    "_group_by_heading",
    "_leaf_beats",
    "_aggregate_beats",
    "_find_thread",
    "_TICK_PROVIDERS",
    "_ticks_outline_scene",
    "_ticks_outline_beat",
    "_ticks_outline_heading",
    "_ticks_outline_act",
    "_ticks_outline_chapter",
    "_ticks_thread_beat",
    "_ticks_thread_heading",
    "_run_gauge_state_analyse",
    "_payoff_haystack",
    "_run_payoff_analyse",
    # _serve — public
    "build_board",
    "build_catalogue",
    "shape_suggestion_item",
    "shape_invention_item",
    "run_suggest_gauges",
    "run_suggest_custom_gauges",
    "run_invent_lens_from_ask",
    "flatten_suggestions",
    "flatten_inventions",
    # _serve — private helpers
    "_slug_inv",
    "_suggest_catalogue_menu",
    "_elements_summaries",
]
