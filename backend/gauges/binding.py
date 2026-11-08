"""Pure transforms over the per-project ``gauges`` store (the NEW route).

**3-layer reference model** (PLAN §3.5 / DEVELOPER_PLAN §1.7):

    templates  — shared, read-only config (in ai_engine.gauges; not stored here)
    presets    — the user's reusable lens definitions (the personal bank)
    bindings   — INSTANCES that REFERENCE a template or a preset + a scope
    suggested  — thin metadata candidates (accept → a preset); NOT proposals
    invented   — thin AI-spec candidates (accept → a preset)

Bindings reference their config; analyse resolves the ref at run time, so editing
a preset flows to its instances. Each fn takes a ``gauges`` dict, returns a NEW one
(the commit layer persists). Validation failures raise ``ValueError`` →
``CapabilityError``.

``gauges`` shape (loose JSON):
    presets:   { preset_id: {…full config, source:"preset"…} }
    bindings:  [ {binding_id, ref:{kind, id}, source, scope_name, pair?, block_key?,
                  visual?, report_view?, bound_at} ]
    suggested: [ {id, lens_id, scope_type, scope_name, visual?, reason, fit} ]
    invented:  [ {id, …full AI spec…} ]
    analyses:  { binding_id: {…} }
"""
from __future__ import annotations

import json
import re

from common.timeutil import now_iso

import gauges.engine as gengine

_SECTIONS = ("presets", "bindings", "suggested", "invented", "analyses")


def _norm(gauges) -> dict:
    g = dict(gauges) if isinstance(gauges, dict) else {}
    out: dict = {"presets": {}, "bindings": [], "suggested": [], "invented": [], "analyses": {}}
    for k in _SECTIONS:
        v = g.get(k)
        if k in ("presets", "analyses") and isinstance(v, dict):
            out[k] = dict(v)
        elif k in ("bindings", "suggested", "invented") and isinstance(v, list):
            out[k] = list(v)
    return out


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s or "lens"


def _uid(g: dict, section: str, base: str) -> str:
    """A unique id within a store section."""
    existing = (set(g["presets"]) if section == "presets"
                else {e.get("id") for e in g.get(section) or [] if isinstance(e, dict)}
                | {b.get("binding_id") for b in g.get("bindings") or [] if isinstance(b, dict)})
    base = _slug(base)
    cid, n = base, 2
    while cid in existing:
        cid, n = f"{base}-{n}", n + 1
    return cid


# --------------------------------------------------------------------------- #
# Presets — the user's reusable lens library                                   #
# --------------------------------------------------------------------------- #

# identity-irrelevant keys: the id, its provenance, and the candidate `reason`
# blurb. Two presets with the same lens config are the SAME preset regardless of
# these, so they're excluded from the fingerprint.
_FP_DROP = ("id", "from", "reason")


def _preset_fingerprint(preset: dict) -> str:
    """A stable signature of a preset's CONFIG fields (everything that defines what
    it measures). build_preset normalises the config, so two equivalent payloads
    fingerprint identically."""
    clean = {k: v for k, v in preset.items() if k not in _FP_DROP}
    return json.dumps(clean, sort_keys=True, default=str)


def _materialise_preset(g: dict, config: dict, *, from_: str) -> tuple[dict, str]:
    """Build a preset config from a payload + store it. ``from_`` records
    provenance (custom | suggested | invented | template:<id>).

    IDEMPOTENT: if a preset with identical config fields already exists, it is
    reused (no duplicate) — so attaching the same lens twice can't fork the bank,
    which in turn keeps bindings unique per (preset, scope, thread)."""
    name = (config.get("name") or "").strip()
    if not name:
        raise ValueError("name required")
    preset = gengine.build_preset(name, config)  # normalise; raises on a bad type
    preset["source"] = "preset"
    fp = _preset_fingerprint(preset)
    for epid, ep in g["presets"].items():
        if isinstance(ep, dict) and _preset_fingerprint(ep) == fp:
            return g, epid  # an identical preset already exists — reuse it
    pid = _uid(g, "presets", name)
    preset["id"] = pid
    preset["from"] = from_
    g["presets"][pid] = preset
    return g, pid


def apply_create_preset(gauges, *, config: dict) -> tuple[dict, str]:
    """Author a custom preset, or save an edited template as a preset."""
    g = _norm(gauges)
    src = (config.get("from") or ("template:" + config["id"]
           if config.get("source") == "bank" and config.get("id") else "custom"))
    return _materialise_preset(g, config, from_=src)


def apply_update_preset(gauges, *, preset_id: str, patch: dict) -> dict:
    g = _norm(gauges)
    cur = g["presets"].get(preset_id)
    if cur is None:
        raise ValueError("no such preset")
    merged = {**cur, **(patch or {})}
    if "y_items" in (patch or {}):
        merged["y_items"] = gengine._norm_y_items(patch.get("y_items"))
    merged["id"] = preset_id
    merged["source"] = "preset"
    g["presets"][preset_id] = merged
    # config changed → every bound instance's stored analysis was computed under
    # the OLD config (axis / y_items / rule) and is now invalid. Wipe them all;
    # the FE re-runs analyse for each binding.
    for b in g["bindings"]:
        if isinstance(b, dict) and (b.get("ref") or {}).get("id") == preset_id:
            g["analyses"].pop(b.get("binding_id"), None)
    return g


def apply_delete_preset(gauges, *, preset_id: str) -> dict:
    """Remove a preset. Bindings that reference it are left (they resolve to a
    stale ref → the board can show 'deleted preset'); unbinding is the user's
    separate action."""
    g = _norm(gauges)
    g["presets"].pop((preset_id or "").strip(), None)
    return g


# --------------------------------------------------------------------------- #
# Suggested / invented — thin candidate lists (NOT proposals)                  #
# --------------------------------------------------------------------------- #

def apply_add_candidates(gauges, *, kind: str, entries: list[dict]) -> dict:
    """Append generated candidates to the `suggested` or `invented` list. No
    dedup (same lens+scope may repeat across runs)."""
    if kind not in ("suggested", "invented"):
        raise ValueError(f"bad candidate kind: {kind!r}")
    g = _norm(gauges)
    for e in entries or []:
        if not isinstance(e, dict):
            continue
        item = dict(e)
        item["id"] = _uid(g, kind, e.get("name") or e.get("lens_id") or kind)
        g[kind].append(item)
    return g


def apply_add_invention(gauges, *, spec: dict) -> tuple[dict, str]:
    """Add ONE fully-specified invented lens to the `invented` list, deterministically
    (no LLM) — the section-lens path authors the whole spec on the client. The spec is
    a build_preset payload (so accept_invention can materialise it). Returns its id."""
    if not isinstance(spec, dict) or not (spec.get("name") or "").strip():
        raise ValueError("name required")
    g = _norm(gauges)
    item = dict(spec)
    item["id"] = _uid(g, "invented", spec.get("name") or "lens")
    g["invented"].append(item)
    return g, item["id"]


def apply_dismiss_candidate(gauges, *, kind: str, id: str) -> dict:
    if kind not in ("suggested", "invented"):
        raise ValueError(f"bad candidate kind: {kind!r}")
    g = _norm(gauges)
    g[kind] = [e for e in g[kind] if not (isinstance(e, dict) and e.get("id") == id)]
    return g


def apply_accept_suggestion(gauges, *, id: str) -> tuple[dict, str]:
    """Materialize a preset from a suggested entry (a template + scope hint). The
    entry STAYS in the list."""
    g = _norm(gauges)
    entry = next((e for e in g["suggested"] if isinstance(e, dict) and e.get("id") == id), None)
    if entry is None:
        raise ValueError("no such suggestion")
    base = gengine.GAUGE_LENSES_BY_ID.get(entry.get("lens_id"))
    if base is None:
        raise ValueError(f"suggestion references unknown template: {entry.get('lens_id')!r}")
    config = dict(base)
    config["from"] = f"suggested:{id}"
    return _materialise_preset(g, config, from_=f"suggested:{id}")


def apply_accept_invention(gauges, *, id: str) -> tuple[dict, str]:
    """Materialize a preset from an invented entry (the AI authored the full spec)."""
    g = _norm(gauges)
    entry = next((e for e in g["invented"] if isinstance(e, dict) and e.get("id") == id), None)
    if entry is None:
        raise ValueError("no such invention")
    return _materialise_preset(g, dict(entry), from_=f"invented:{id}")


# --------------------------------------------------------------------------- #
# Bindings — instances that REFERENCE a template or a preset                    #
# --------------------------------------------------------------------------- #

def apply_bind(
    gauges, *, ref: dict | None = None, source: str = "", scope_name: str = "",
    scope_type: str = "", pair=None, block_key: str = "",
    visual: str = "", report_view: str = "", lens_id: str = "", thread_ref: str = "",
) -> tuple[dict, str]:
    """Create an instance referencing a **preset**. ``ref`` is
    ``{kind:"preset", id}`` (a bare ``lens_id`` that names a preset is also
    accepted). Idempotent per (ref, scope_name).

    INVARIANT: a binding must reference a user preset — never a bare library
    template. Callers materialise a preset first (``create_preset`` from the
    template/lens config, or ``accept_suggestion``), then bind its ``preset_id``.
    This keeps every instance backed by an editable, user-owned config (and is
    why binding a template used to silently inherit the template's scope while a
    preset bind needed an explicit ``scope_type``)."""
    g = _norm(gauges)
    if isinstance(ref, dict) and ref.get("id"):
        kind = ref.get("kind") or ("preset" if (ref["id"] in g["presets"]) else "template")
        rid = ref["id"]
    elif lens_id:
        rid = lens_id
        kind = "preset" if rid in g["presets"] else "template"
    else:
        raise ValueError("ref {kind,id} (or lens_id) required")
    if kind != "preset":
        raise ValueError(
            f"a binding must reference a preset, not a {kind} (got {kind}:{rid}) — "
            "create_preset from the config first, then bind its preset_id"
        )
    cfg = gengine.resolve_config(rid, kind, g["presets"])
    if cfg is None:
        raise ValueError(f"ref not found: {kind}:{rid}")
    scope_type = (scope_type or cfg.get("scope_type") or "story").strip()
    scope_name = (scope_name or "").strip()
    if scope_type == "story":
        scope_name = scope_name or "the whole story"
    if not scope_name and isinstance(pair, list) and len(pair) == 2:
        scope_name = " – ".join(str(x).strip() for x in pair)
    if not scope_name:
        raise ValueError("scope_name (or a pair) required")
    if cfg.get("y_items_source") == "section" and not (block_key or "").strip():
        raise ValueError("block_key required for a section-bound lens")
    walk = ((cfg.get("axis") or {}).get("walk") or "outline").strip()
    if walk == "thread" and not (thread_ref or "").strip():
        raise ValueError("thread_ref required for a thread-walk lens")

    # thread_ref is part of identity: the same scope walked along two different
    # threads ("Mara across Romance" vs "Mara across Heist") are distinct bindings.
    bid = f"{rid}|{scope_type}|{scope_name}"
    if (thread_ref or "").strip():
        bid += f"|{thread_ref.strip()}"
    # binding_id is set once and never rebuilt, so after a character rename the
    # existing gauge's id still holds the old name. Match on the scope itself
    # (case-insensitive) so binding the same lens again reuses that gauge.
    same = next((b for b in g["bindings"] if isinstance(b, dict) and b.get("binding_id")
                 and (b.get("ref") or {}).get("id") == rid
                 and b.get("scope_type") == scope_type
                 and str(b.get("scope_name") or "").strip().lower() == scope_name.lower()
                 and str(b.get("thread_ref") or "").strip() == (thread_ref or "").strip()),
                None)
    if same is not None:
        bid = same["binding_id"]
    binding = {
        "binding_id": bid,
        "ref": {"kind": kind, "id": rid},
        "source": (source or cfg.get("source") or kind).strip(),
        "scope_type": scope_type,
        "scope_name": scope_name,
        "bound_at": now_iso(),
    }
    if isinstance(pair, list) and len(pair) == 2:
        binding["pair"] = [str(x).strip() for x in pair]
    if (block_key or "").strip():
        binding["block_key"] = block_key.strip()
    if (thread_ref or "").strip():
        binding["thread_ref"] = thread_ref.strip()
    if (visual or "").strip():
        binding["visual"] = visual.strip()
    if (report_view or "").strip():
        binding["report_view"] = report_view.strip()

    g["bindings"] = [b for b in g["bindings"]
                     if not (isinstance(b, dict) and b.get("binding_id") == bid)]
    g["bindings"].append(binding)
    return g, bid


def apply_unbind(gauges, *, binding_id: str) -> dict:
    """Delete the instance. The referenced preset/template is untouched."""
    bid = (binding_id or "").strip()
    g = _norm(gauges)
    g["bindings"] = [b for b in g["bindings"]
                     if not (isinstance(b, dict) and b.get("binding_id") == bid)]
    g["analyses"].pop(bid, None)
    return g


def apply_update_binding(gauges, *, binding_id: str, patch: dict) -> dict:
    """Per-instance overrides only (scope_name / pair / block_key / visual /
    report_view). Config edits go to the preset, not here."""
    bid = (binding_id or "").strip()
    if not bid:
        raise ValueError("binding_id required")
    g = _norm(gauges)
    target = next((b for b in g["bindings"]
                   if isinstance(b, dict) and b.get("binding_id") == bid), None)
    if target is None:
        raise ValueError("no such bound gauge")
    allowed = {"scope_name", "pair", "block_key", "visual", "report_view", "thread_ref"}
    merged = {**target, **{k: v for k, v in (patch or {}).items() if k in allowed}}
    g["bindings"] = [merged if b is target else b for b in g["bindings"]]
    return g


def store_analysis(gauges, *, binding_id: str, analysis: dict) -> dict:
    g = _norm(gauges)
    g["analyses"][binding_id] = {
        "data_points": analysis.get("data_points") or [],
        "coverage": analysis.get("coverage") or [],
        "pairs": analysis.get("pairs") or [],
        "rules": analysis.get("rules") or [],
        "rules_applied": analysis.get("rules_applied") or [],
        "rules_deferred": analysis.get("rules_deferred") or [],
        "offending": analysis.get("offending") or [],
        "score": analysis.get("score"),
        "deferred": bool(analysis.get("deferred")),
        "partial": bool(analysis.get("partial")),
        "verdict": analysis.get("verdict"),
        "analysed_at": analysis.get("ran_at") or now_iso(),
        # order of what the lens read (engine.order_fingerprint) — served
        # against the live outline to flag "order changed since this lens ran"
        "order_fp": analysis.get("order_fp") or "",
    }
    return g
