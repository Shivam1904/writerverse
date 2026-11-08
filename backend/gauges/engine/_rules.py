"""Pure deterministic verdict registry for gauges.

Owns: all rule functions, the _RULE_FNS / _RULE_FAMILY_BY_TYPE registries,
and the public helpers lens_rules / compatible_rules / _verdict_text.
No LLM calls in this layer.
"""
from __future__ import annotations

from ._config import (
    _INVERSION_TOL,
    _RULE_FAMILY_BY_TYPE,
    GAUGE_SHARED,
    _rules_of,
)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _idx_seq(values: list[dict], y_items: list[str]) -> list[tuple]:
    """[{scene_id, value}] → [(scene_id, ladder_index|None)] in scene order."""
    by = {y.lower(): i for i, y in enumerate(y_items)}
    return [(v.get("scene_id"), by.get((v.get("value") or "").strip().lower())) for v in values]


def _rule_shape(direction: int, name: str):
    def fn(values, y_items):
        pts = [(sid, i) for sid, i in _idx_seq(values, y_items) if i is not None]
        if len(pts) < 2:
            return {"ok": True, "score": None, "offending": []}
        total = viol = 0
        for a in range(len(pts) - 1):
            for b in range(a + 1, len(pts)):
                total += 1
                d = pts[b][1] - pts[a][1]
                if (direction > 0 and d < 0) or (direction < 0 and d > 0):
                    viol += 1
        offending, prev = [], pts[0][1]
        for sid, i in pts[1:]:
            if (direction > 0 and i < prev) or (direction < 0 and i > prev):
                offending.append({"scene_id": sid, "detail": f"moves the wrong way for '{name}'"})
            prev = i
        ratio = viol / total if total else 0.0
        # Net progress: counting inversions only catches BACKWARD moves — a truly
        # flat line (no moves at all) has zero inversions and would pass as "climbs".
        # A rising arc must actually END higher than it STARTED (a falling arc lower);
        # if it doesn't, the arc never happened — flag it flat and fail.
        net = pts[-1][1] - pts[0][1]
        flat = (direction > 0 and net <= 0) or (direction < 0 and net >= 0)
        if flat:
            higher = "higher" if direction > 0 else "lower"
            offending.append({"scene_id": pts[-1][0],
                              "detail": f"ends no {higher} than it started — flat"})
        return {"ok": (ratio <= _INVERSION_TOL) and not flat,
                "score": 1.0 - ratio, "offending": offending}
    return fn


def _rule_flat(values, y_items):
    """Should hold steady — every present tick should sit on one level; any rung
    off that level is a swing. Zero-tolerance on purpose: `flat` is only used by
    the binary problem/good section lenses, where a SINGLE 'problem' must break
    the verdict (an absolute `abs(i - mean) > 1` threshold can never catch a
    deviation on a 2-rung ladder). The level = the most-common rung; ties break
    toward the higher rung so 'good' wins and a 'problem' always reads as off."""
    seq = _idx_seq(values, y_items)
    idx = [i for _, i in seq if i is not None]
    if len(idx) < 2:
        return {"ok": True, "score": None, "offending": []}
    level = max(set(idx), key=lambda x: (idx.count(x), x))
    offending = [{"scene_id": sid, "detail": "swings off the level"}
                 for sid, i in seq if i is not None and i != level]
    mean = sum(idx) / len(idx)
    var = sum((x - mean) ** 2 for x in idx) / len(idx)
    return {"ok": not offending, "score": -var, "offending": offending}


def _rule_monotone(direction: int, word: str):
    def fn(values, y_items):
        offending, bound = [], None
        for sid, i in _idx_seq(values, y_items):
            if i is None:
                continue
            if bound is not None and ((direction > 0 and i < bound) or (direction < 0 and i > bound)):
                offending.append({"scene_id": sid, "detail": word})
            bound = i if bound is None else (max(bound, i) if direction > 0 else min(bound, i))
        return {"ok": not offending, "score": None, "offending": offending}
    return fn


def _rule_single_occupancy(values, y_items):
    """One at a time. The tracker analyse returns a per-scene LIST of occupants —
    a DUPLICATE (>1) is the breach ('two holders / two places in one scene')."""
    offending = []
    for v in values:
        occ = v.get("values")
        if occ is None:
            occ = [v["value"]] if (v.get("value") or "").strip() else []
        if len(occ) > 1:
            offending.append({"scene_id": v.get("scene_id"),
                              "detail": f"in {len(occ)} at once: {', '.join(occ)}"})
    return {"ok": not offending, "score": None, "offending": offending}


def _rule_cover_once(values, y_items):
    seen, offending = set(), []
    for v in values:
        val = (v.get("value") or "").strip().lower()
        if not val:
            continue
        if val in seen:
            offending.append({"scene_id": v.get("scene_id"), "detail": f"'{v.get('value')}' repeats"})
        seen.add(val)
    return {"ok": not offending, "score": None, "offending": offending}


def _rule_cover_all(values, y_items):
    # values = coverage items [{label, present}] (checklist coverage / payoff pairs)
    offending = [{"label": c.get("label"), "detail": "not present / not paid off"}
                 for c in values if not c.get("present")]
    total = len(values)
    return {"ok": not offending,
            "score": ((total - len(offending)) / total if total else None),
            "offending": offending}


def _rule_deferred(values, y_items):
    return {"ok": None, "score": None, "offending": [], "deferred": True}


# ---------------------------------------------------------------------------
# Rule registry
# ---------------------------------------------------------------------------

# ─── Rule registry — DETERMINISTIC verdicts over LLM-produced data ─────────── #
# ONE open registry (mirrors _shared.yml `rules`, 3 families). Each rule is
#   fn(values, y_items) -> {ok, score, offending[]}     · `offending[]` IS the report.
# NO LLM in the verdict layer — the LLM only produces the DATA (scene values /
# coverage booleans / setup→payoff pairs). A rule needing inputs we don't yet
# produce returns {ok: None, deferred: True} → the chart reads as a MAP (NOT a
# fallback): arc/oscillate (fuzzy shape) · no_jump (needs a legal-adjacency map) ·
# cover_in_order (needs the covering-scene order from the producer). New rule = a fn + a row here.

# id → fn. `none`/missing → descriptive (no verdict). Mirrors _shared.yml `rules`.
_RULE_FNS = {
    "rising": _rule_shape(+1, "rising"), "falling": _rule_shape(-1, "falling"),
    "flat": _rule_flat, "arc": _rule_deferred, "oscillate": _rule_deferred,
    "monotone_up": _rule_monotone(+1, "knowledge goes backward"),
    "monotone_down": _rule_monotone(-1, "improves with no scene to earn it"),
    "single_occupancy": _rule_single_occupancy, "cover_once": _rule_cover_once,
    "no_jump": _rule_deferred,          # needs a legal-adjacency map (deferred, not a fallback)
    "cover_all": _rule_cover_all,
    "cover_in_order": _rule_deferred,   # needs the covering-scene order from the producer
}

# NOTE: _RULE_FAMILY_BY_TYPE is defined in _config to avoid circular imports;
# it is imported above and re-exported from __init__.py alongside the other public names.


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def lens_rules(lens: dict) -> list[str]:
    """The config's verdict rule LIST (already resolved on templates/presets)."""
    return _rules_of(lens, lens.get("type_id"))


def compatible_rules(type_id: str) -> list[str]:
    """Rule ids a type may offer = its family's rules + `none` (for the menu)."""
    fam = _RULE_FAMILY_BY_TYPE.get(type_id)
    rules = GAUGE_SHARED.get("rules") or {}
    out = [rid for rid, meta in rules.items()
           if isinstance(meta, dict) and meta.get("family") == fam]
    return [*out, "none"]


def _verdict_text(lens: dict, offending: list[dict], *, applied: bool, ok: bool = True) -> str | None:
    """Plain verdict from the MERGED rule results (FE refines via `output_language`).
    None when no live rule applied (→ reads as a map).

    Three states, not two (holds / wobble / needs a look):
      · no offending           → HOLDS       → the lens `good` text
      · passes (ok) + offending → WOBBLE      → "Holds — N dip(s) to check"
      · fails (not ok)          → NEEDS A LOOK → the lens `off` text / unresolved list

    The `off` text is authored for TOTAL failure ("it stays flat — ends the same
    person"), so it must never fire on a rule that actually PASSED within tolerance
    (a rising arc with one dip: ok=True, score 0.95). Only the shape rules can be
    ok-with-offending; every strict rule sets ok = not offending, so their offending
    still routes to the off/unresolved branch below. The dips always show as chart
    markers regardless — the verdict just stops crying failure over a wobble."""
    if not applied:
        return None  # all rules deferred / none → descriptive
    if not offending:
        return lens.get("good") or "holds"
    labels = [o.get("label") for o in offending if o.get("label")]
    if labels:
        names = ", ".join(f"“{x}”" for x in labels[:6])
        more = "" if len(labels) <= 6 else f" (+{len(labels) - 6} more)"
        return f"{len(offending)} unresolved: {names}{more}"
    if ok:
        n = len(offending)
        return f"Holds — {n} dip{'s' if n != 1 else ''} to check"
    return lens.get("off") or f"{len(offending)} issue(s) found"
