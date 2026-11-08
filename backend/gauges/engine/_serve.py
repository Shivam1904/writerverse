"""Gauge serving + catalogue + AI-powered suggestions.

Owns: build_board, build_catalogue, shape_suggestion_item, shape_invention_item,
run_suggest_gauges, run_suggest_custom_gauges, flatten_suggestions,
flatten_inventions, and their private helpers.
"""
from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Callable

from ai_engine import llm_utils
from ai_engine.usage_meter import cost_usd, meter, total_tokens
from common.timeutil import now_iso
from outline.engine import _flatten_scenes

from ._analyse import order_fingerprint, resolve_ticks
from ._config import (
    _LIVE_MATH_RULES,
    _ROLES,
    GAUGE_LENSES_BY_ID,
    GAUGE_SHARED,
    GAUGE_TYPES,
    _norm_y_items,
    build_preset,
    resolve_config,
)
from ._rules import lens_rules

logger = logging.getLogger("writerverse.gauges")


# ---------------------------------------------------------------------------
# Board builder
# ---------------------------------------------------------------------------

def _any_text(ticks) -> bool:
    return any(isinstance(t, dict) and (t.get("text") or "").strip() for t in ticks or [])


def _has_content(cfg, ticks, grand_outline, threads, scope, thread_ref) -> bool:
    """True when the lens has written text to read. A scene-mapped lens checks
    its own walk's ticks; any other (coverage) lens reads the whole story, so it
    checks outline beats and scene prose."""
    if cfg.get("data_style") == "scene_mapped":
        return _any_text(ticks)
    return any(
        _any_text(resolve_ticks({"axis": {"walk": w, "tick": "scene"}}, grand_outline,
                                threads, scope, thread_ref))
        for w in ("outline", "story")
    )


def build_board(
    bindings: list[dict],
    presets: dict,
    analyses: dict,
    grand_outline: dict | None = None,
    threads: list[dict] | None = None,
    section_resolver: Callable[[str], list[dict]] | None = None,
) -> dict:
    """Materialise ``{charts:[…], scenes:[…]}`` by RESOLVING each binding's ref to
    its config (template or preset) — editing a config flows here. Attaches the
    instance's scope + per-instance picks + the live section read + the analysis,
    plus the per-chart configurable x-axis (``axis`` + ``ticks``).
    """
    scenes = _flatten_scenes(grand_outline)
    charts: list[dict] = []
    for b in bindings or []:
        if not isinstance(b, dict):
            continue
        bid = b.get("binding_id")
        ref = b.get("ref") or {}
        cfg = resolve_config(ref.get("id"), ref.get("kind"), presets)
        scope = {"type": b.get("scope_type"), "name": b.get("scope_name")}
        if isinstance(b.get("pair"), list):
            scope["pair"] = b["pair"]
        if cfg is None:  # stale ref (e.g. a deleted preset) — tombstone, not a crash
            charts.append({"id": bid, "binding_id": bid, "ref": ref,
                           "scope": scope, "source": b.get("source"),
                           "missing_config": True})
            continue
        chart = dict(cfg)
        # A lens IS a question (LANGUAGE.md). Presets saved before the `question`
        # field existed carry only the short `name`; backfill the question from
        # their origin template so bound lenses read as questions too. Serve-time
        # read merge — no migration, applies to every existing preset at once.
        if not chart.get("question"):
            origin = GAUGE_LENSES_BY_ID.get(chart.get("template_id") or ref.get("id"))
            if origin and origin.get("question"):
                chart["question"] = origin["question"]
        chart["id"] = bid
        chart["binding_id"] = bid
        chart["ref"] = ref
        chart["source"] = b.get("source") or cfg.get("source")
        chart["scope"] = scope
        chart["block_key"] = b.get("block_key")
        # the thread this instance walks (thread-walk lenses) — surfaced so the UI
        # can show which thread a gauge is watching (ref id + its title).
        tref = b.get("thread_ref") or ""
        chart["thread_ref"] = tref
        chart["thread_label"] = next(
            (t.get("title") for t in (threads or [])
             if isinstance(t, dict) and t.get("id") == tref), "") if tref else ""
        # effective per-instance picks
        chart["display"] = (b.get("visual") or cfg.get("display"))
        chart["report_view"] = (b.get("report_view")
                                or (cfg.get("report_views") or [None])[0])
        # the configurable x-axis — per-chart axis + ticks (scene_mapped only)
        chart["axis"] = cfg.get("axis") or {"walk": "outline", "tick": "scene"}
        if cfg.get("data_style") == "scene_mapped":
            chart["ticks"] = resolve_ticks(cfg, grand_outline, threads, scope,
                                           b.get("thread_ref", ""))
        else:
            chart["ticks"] = []
        # has_content: is there any written text this lens could read? The UI
        # shows "Nothing to read yet" (and hides the paid run button) when False.
        # Not derived from `ticks`: coverage lenses always send ticks=[] (SA-270).
        chart["has_content"] = _has_content(cfg, chart["ticks"], grand_outline, threads,
                                            scope, tref)
        # the ONE live read: section scales come from the bound World block
        if cfg.get("y_items_source") == "section" and b.get("block_key") and section_resolver:
            chart["y_items"] = section_resolver(b["block_key"])
        chart.setdefault("y_items", [])
        # analysis (offending IS the report)
        a = (analyses or {}).get(bid) or {}
        chart["data_points"] = a.get("data_points") or []
        chart["coverage"] = a.get("coverage") or []
        chart["pairs"] = a.get("pairs") or []
        chart["offending"] = a.get("offending") or []
        chart["score"] = a.get("score")
        chart["deferred"] = bool(a.get("deferred"))
        chart["partial"] = bool(a.get("partial"))
        chart["verdict"] = a.get("verdict")
        chart["analysed_at"] = a.get("analysed_at")
        # Per-tick staleness: a tick whose source (beat / scene / thread beat) was
        # edited AFTER this lens last scanned. The verdict card colours those bars
        # stale; `stale` (any tick stale) is the chart-level flag for charts whose
        # bars aren't 1:1 with ticks (payoff / checklist). now_iso() stamps are
        # UTC-ISO so the string compare is chronological. TODO(hash): a content
        # hash would also ignore no-op re-saves — swap the compare here.
        analysed = a.get("analysed_at")
        stale_ticks = (
            [str(t.get("id")) for t in (chart.get("ticks") or [])
             if isinstance(t, dict) and t.get("edited_at") and t["edited_at"] > analysed]
            if analysed else []
        )
        chart["stale_ticks"] = stale_ticks
        # Order staleness: the lens saved a fingerprint of the order it read
        # (acts / chapters / scenes / beats along its walk); a move since then
        # changes it. Only moves along this lens's own walk count.
        saved_fp = a.get("order_fp")
        order_changed = bool(analysed and saved_fp) and saved_fp != order_fingerprint(
            cfg, grand_outline, threads, tref)
        chart["stale"] = bool(stale_ticks) or order_changed
        chart["stale_reason"] = ("order changed since this lens ran" if order_changed
                                 else "edited since last scan" if stale_ticks else "")
        chart["rules"] = a.get("rules") or lens_rules(cfg)
        chart["rules_applied"] = a.get("rules_applied") or []
        chart["rules_deferred"] = a.get("rules_deferred") or []
        charts.append(chart)
    return {"charts": charts, "scenes": scenes or []}


# ---------------------------------------------------------------------------
# Catalogue + bank shaping
# ---------------------------------------------------------------------------

def shape_suggestion_item(entry: dict) -> dict | None:
    """A `suggested` store entry (template ref + scope hint) → a bank-shape list
    item tagged `source: suggested`. The full config is the referenced template."""
    base = GAUGE_LENSES_BY_ID.get(entry.get("lens_id"))
    if not base:
        return None
    scope_type = entry.get("scope_type") or base.get("scope_type")
    return {
        **base, "source": "suggested", "id": entry.get("id"),
        "lens_id": entry.get("lens_id"),
        "scope": {"type": scope_type, "name": entry.get("scope_name")},
        "scope_type": scope_type, "scope_name": entry.get("scope_name"),
        "reason": entry.get("reason"), "fit": entry.get("fit"),
        "visual": entry.get("visual"),
    }


def shape_invention_item(entry: dict) -> dict | None:
    """An `invented` store entry (the full AI spec) → a bank-shape list item
    tagged `source: invented` (so 'try on' reads the config straight from here)."""
    name = (entry.get("name") or "").strip()
    if not name or not (entry.get("display") or entry.get("type")):
        return None
    try:
        cfg = build_preset(entry.get("id") or _slug_inv(name), entry)
    except ValueError:
        return None
    cfg["source"] = "invented"
    cfg["id"] = entry.get("id")
    cfg["reason"] = entry.get("reason")
    return cfg


def _slug_inv(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-") or "invented"


# Lens keys the bank never ships. `eyes` is the raw four-eyes blob: every field a
# reader uses is already flattened onto the lens (watches, read_as, analyse_head…),
# and the rest (designer bank_card/decide_card/chart_view/custom_dialog) has no
# reader. It was ~45% of the payload (SA-261).
_CATALOGUE_DROP = frozenset({"eyes"})


def build_catalogue() -> dict:
    """The shared lens bank, grouped by type → ``{types:[{id, kind_word, lenses}], shared}``.

    Static: it is built from the config files only, so it is the same for every
    project and the frontend caches it for the whole session (`get_gauge_catalogue`).

    Each lens is the resolved lens the bank card, decide card and custom dialog
    read (good/off/read_as/look_for/invariant/direction/y_items + the AI heads),
    minus the keys in ``_CATALOGUE_DROP``. A type carries only its id and
    ``kind_word``: everything else it holds is already copied onto each lens.
    """
    types = [{
        "id": t["id"],
        "kind_word": t["kind_word"],
        "lenses": [{k: v for k, v in lens.items() if k not in _CATALOGUE_DROP}
                   for lens in t["lenses"]],
    } for t in GAUGE_TYPES]
    return {"types": types, "shared": GAUGE_SHARED}


# ---------------------------------------------------------------------------
# Suggesters
# ---------------------------------------------------------------------------

def _suggest_catalogue_menu() -> list[dict]:
    """The library-lens menu the suggester scores — one compact row per config
    lens (never custom). Carries the per-lens `watches` + the type's kind_word,
    so the prompt is grounded in the authored copy (your point: the AI-eyes copy
    in the config covers most of the prompting)."""
    return [{
        "lens_id": lens["id"],
        "name": lens["name"],
        "type": lens.get("type_id"),
        "kind_word": lens.get("kind_word"),
        "scope_type": lens.get("scope_type"),
        "data_style": lens.get("data_style"),
        "watches": lens.get("watches"),
    } for lens in GAUGE_LENSES_BY_ID.values()
        # Section-bound lenses need a World-block pick the user makes when binding —
        # a one-click suggestion-accept can't infer it, so leave them out of suggest.
        if lens.get("y_items_source") != "section"]


def _elements_summaries(elements: dict) -> tuple[dict, list, list, list]:
    elements = elements if isinstance(elements, dict) else {}
    story = elements.get("story") or {}
    chars = [
        {"name": c.get("name"), "role": c.get("role"), "description": c.get("description")}
        for c in (elements.get("characters") or []) if c.get("name")
    ]
    items = [
        {"name": i.get("name"), "description": i.get("description")}
        for i in (elements.get("items") or []) if i.get("name")
    ]
    return story, chars, items, (elements.get("rules") or [])


def run_suggest_gauges(
    elements: dict, synopsis: str = "", braindumps: list[str] | None = None,
) -> dict:
    """Rank which LIBRARY gauge lenses fit the story, per scope (returns gauge
    `lens_id`s). Returns ``{suggestions:{story:[…], characters:{…}, items:{…}}, …}``.
    """
    t0 = time.time()
    ran_at = now_iso()
    story, chars, items, _rules = _elements_summaries(elements)
    menu = _suggest_catalogue_menu()
    scope_by_id = {m["lens_id"]: m["scope_type"] for m in menu}

    prompt = f"""You recommend STORY-ANALYSIS LENSES for a writer. The writer picks
the ones that fit each subject; they can pick none. Score each lens's fit (0-1)
and give a one-line reason in the writer's terms.

STRICT SCOPE MATCHING — categorical, no exceptions:
  • STORY scope: ONLY lenses whose scope_type=="story".
  • a CHARACTER: ONLY lenses whose scope_type=="character".
  • an ITEM: ONLY lenses whose scope_type=="object".
  • NEVER suggest a `relationship` lens here (it needs a pair, not in this menu).

Each lens's `watches` says what it looks at — use it to judge fit. Suggest a
lens only when the subject actually has that thing to track. Order each scope's
list by fit_score descending. For STORY, give your top few; for a character,
only high-confidence fits (>=0.6); skip minor/dead/offscreen characters.

STORY:
  title:   {story.get('title', '(none)')}
  summary: {story.get('summary', '(none)')}

CHARACTERS:
{json.dumps(chars, indent=2)}

ITEMS:
{json.dumps(items, indent=2)}

LENS MENU (score these — use lens_id exactly):
{json.dumps(menu, indent=2)}

SYNOPSIS:
{synopsis or '(none)'}

Return ONLY a JSON object (no prose, no fences):
{{
  "story":      [{{"lens_id": "...", "fit_score": 0-1, "reason": "..."}}],
  "characters": {{"<character name>": [{{"lens_id": "...", "fit_score": 0-1, "reason": "..."}}]}},
  "items":      {{"<item name>":      [{{"lens_id": "...", "fit_score": 0-1, "reason": "..."}}]}}
}}
"""
    with meter() as _cb:
        sug = llm_utils.ask_json(prompt, role=_ROLES.get("suggest", "small"),
                        tag="suggest_gauges", expect=dict)
    if not isinstance(sug, dict):
        sug = {"story": [], "characters": {}, "items": {}}

    def _clean(rows, expected_scope):
        out = []
        for r in rows or []:
            if not isinstance(r, dict):
                continue
            lid = (r.get("lens_id") or "").strip()
            if not lid or lid not in scope_by_id:
                continue
            if scope_by_id[lid] != expected_scope:
                continue  # drop scope mismatches the LLM may emit
            out.append({"lens_id": lid, "fit_score": r.get("fit_score"),
                        "reason": (r.get("reason") or "").strip()})
        return sorted(out, key=lambda x: -(x.get("fit_score") or 0))

    suggestions = {
        "story": _clean(sug.get("story"), "story"),
        "characters": {n: _clean(v, "character")
                       for n, v in (sug.get("characters") or {}).items()},
        "items": {n: _clean(v, "object")
                  for n, v in (sug.get("items") or {}).items()},
    }
    usage = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    logger.info("run_suggest_gauges in %.1fs", time.time() - t0)
    return {"suggestions": suggestions, "ran_at": ran_at, "usage": usage}


def run_suggest_custom_gauges(
    elements: dict, synopsis: str = "", braindumps: list[str] | None = None,
) -> dict:
    """Invent BESPOKE gauge lenses the library can't express — the LLM picks the
    display type per invented lens (constrained to the valid gauge types) and
    grounds each in the writer's own words. Emits gauge-shaped lenses (display +
    scale + optional math_rule/invariant). Returns ``{custom_gauges:[…], …}``."""
    t0 = time.time()
    ran_at = now_iso()
    braindumps = [b for b in (braindumps or []) if isinstance(b, str) and b.strip()]
    story, chars, items, _rules = _elements_summaries(elements)
    char_names = [c["name"] for c in chars]
    # The type menu the LLM chooses from (one per gauge type) + what each is for.
    type_menu = [{
        "display": t["display"],
        "kind_word": t.get("kind_word"),
        "data_style": t["data_style"],
        "judges": t["judges"],
        "what_it_is": t.get("output_language"),
    } for t in GAUGE_TYPES]
    valid_displays = {t["display"] for t in GAUGE_TYPES}
    # Lenses the library ALREADY covers — don't re-propose these (soft rule).
    covered = sorted({lens["name"] for lens in GAUGE_LENSES_BY_ID.values() if lens.get("name")})

    prompt = f"""You invent BESPOKE story-analysis lenses a writer could track that
the fixed library does NOT already cover. Read the story and surface what's worth
watching. For EACH idea, choose the lens TYPE that fits (its `display`) from the
menu, then fill that type's fields.

CHOOSE THE TYPE BY WHAT YOU'RE WATCHING:
  • An ordered quality that should climb/fall across the story → an ARC
    (ladder_line). Give an ordered `y_items` scale (low→high) AND a `math_rule`
    ("rising" | "falling" | "flat") — that's its verdict.
  • A quality you just want to SEE move, no right answer → a MAP (contour_line).
    Ordered `y_items`, NO math_rule.
  • A categorical STATE per scene with a rule that must hold (one holder, no
    teleport, knowledge only grows) → a TRACKER (state_lanes). Give the states as
    `y_items` (unordered ok) AND an `invariant` sentence.
  • A required set each of which should appear somewhere → a CHECKLIST. `y_items`
    are the things to hit.
  • Things planted that must pay off → a SETUP→PAYOFF (payoff_arcs). Leave
    `y_items` empty (the engine extracts the pairs).

DON'T re-propose what the library already offers (soft rule):
{json.dumps(covered, indent=2)}

GROUND every idea in the story — name the phrase/beat it came from in `reason`.
`y_items` are 3-6 short labels in the writer's register, each with a one-line
`description`. A `relationship` scope needs TWO named characters from: {char_names}.
Aim for 2-4 strong ideas; return AT LEAST ONE.

TYPE MENU (pick `display` from these exactly):
{json.dumps(type_menu, indent=2)}

STORY:
  title:   {story.get('title', '(none)')}
  summary: {story.get('summary', '(none)')}
CHARACTERS:
{json.dumps(chars, indent=2)}
ITEMS:
{json.dumps(items, indent=2)}
SYNOPSIS:
{synopsis or '(none)'}
BRAINDUMPS:
{json.dumps(braindumps, indent=2)}

Return ONLY a JSON list (no prose, no fences):
[{{"display": "<one of the menu displays>", "name": "...", "watches": "...",
   "scope_type": "story|character|object|relationship", "scope_name": "...",
   "y_items": [{{"value": "...", "description": "..."}}],
   "math_rule": "rising|falling|flat|null", "invariant": "... or null",
   "reason": "grounded in: ..."}}]
"""
    with meter() as _cb:
        resp = llm_utils.ask_json(prompt, role=_ROLES.get("suggest", "small"),
                         tag="suggest_custom_gauges", expect=list)
    out: list[dict] = []
    if isinstance(resp, list):
        for r in resp:
            if not isinstance(r, dict):
                continue
            display = (r.get("display") or "").strip()
            name = (r.get("name") or "").strip()
            if display not in valid_displays or not name:
                continue
            mr = (r.get("math_rule") or "").strip().lower()
            inv = (r.get("invariant") or "").strip()
            out.append({
                "display": display,
                "name": name,
                "watches": (r.get("watches") or "").strip(),
                "scope_type": (r.get("scope_type") or "story").strip(),
                "scope_name": (r.get("scope_name") or "").strip(),
                "y_items": _norm_y_items(r.get("y_items")),
                "math_rule": mr if mr in _LIVE_MATH_RULES or mr == "arc" else None,
                "invariant": inv or None,
                "reason": (r.get("reason") or "").strip(),
            })
    usage = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    logger.info("run_suggest_custom_gauges n=%d in %.1fs",
                len(out), time.time() - t0)
    return {"custom_gauges": out, "ran_at": ran_at, "usage": usage}


def run_invent_lens_from_ask(
    ask: str, elements: dict, synopsis: str = "", braindumps: list[str] | None = None,
) -> dict:
    """Shape ONE lens from the writer's plain-words ask (the "shape it" flow). The
    LLM makes one decision — which of the gauge TYPES fits — then fills that type's
    fields, grounded in the story. Returns ``{lens: spec | None, …}``; the spec is a
    ``build_preset`` payload (type + name + watches + y_items + math_rule/invariant)
    PLUS the binding's ``scope_type``/``scope_name``/``pair``. Persists nothing — the
    caller binds it lazily through the attach box.
    """
    t0 = time.time()
    ran_at = now_iso()
    ask = (ask or "").strip()
    if not ask:
        return {"lens": None, "ran_at": ran_at, "usage": None}
    braindumps = [b for b in (braindumps or []) if isinstance(b, str) and b.strip()]
    story, chars, items, _rules = _elements_summaries(elements)
    char_names = [c["name"] for c in chars]
    item_names = [i["name"] for i in items]
    valid_types = {t["id"] for t in GAUGE_TYPES}

    prompt = f"""You turn a writer's one-line request into ONE "lens" — something the
app will watch across their whole story and chart. The writer gave you only the
request below; you do the rest. Don't ask questions; make confident choices.

THE REQUEST:
"{ask}"

STEP 1 — Pick the ONE shape that fits. This is your only big decision.
  • arc          a quality that should RISE or FALL across the story (courage,
                 trust, corruption). It gets a pass/fail verdict.
  • map          a quality you just want to SEE move — no right answer (mood,
                 tension, pace). No verdict.
  • tracker      a STATE that changes scene to scene and must obey a rule
                 (who holds the X, where someone is, what they know).
  • checklist    a SET of things that should each appear SOMEWHERE (genre beats,
                 the promises a blurb makes).
  • setup_payoff things PLANTED early that must pay off later.

STEP 2 — Fill the fields your shape needs; leave the rest null/[].
  name        2-4 words, the writer's register. e.g. "Courage", "The Gun".
  watches     one plain sentence — what this lens watches.
  scope       whole story → scope_type "story", scope_name ""; one character →
              "character" + scope_name (a CAST name); one object/place →
              "object" + scope_name (an OBJECT name); a bond between two →
              "relationship" + pair ["NameA","NameB"]. If the request names no
              one, use "story".
  y_items     3-6 short labels, LOWEST→HIGHEST, each with a one-line description.
                arc / map     → the steps the quality moves through.
                tracker       → the possible states.
                checklist     → the things that must each show up.
                setup_payoff  → leave as []  (the app finds the pairs itself).
  math_rule   arc only → "rising" | "falling" | "flat". Otherwise null.
  invariant   tracker only → one sentence for the rule that must hold, e.g.
              "only one person holds it at a time; it can't teleport." Else null.

CAST: {json.dumps(char_names)}
OBJECTS/PLACES: {json.dumps(item_names)}
STORY: title={story.get('title', '(none)')!r} summary={story.get('summary', '(none)')!r}
SYNOPSIS: {synopsis or '(none)'}
BRAINDUMPS: {json.dumps(braindumps)}

Return ONLY this JSON object — no prose, no fences:
{{"type": "arc|map|tracker|checklist|setup_payoff", "name": "...", "watches": "...",
  "scope_type": "story|character|object|relationship", "scope_name": "...",
  "pair": ["NameA","NameB"] or null,
  "y_items": [{{"value": "...", "description": "..."}}],
  "math_rule": "rising|falling|flat" or null, "invariant": "... or null"}}
"""
    with meter() as _cb:
        resp = llm_utils.ask_json(prompt, role=_ROLES.get("suggest", "small"),
                                  tag="invent_lens_from_ask", expect=dict)
    lens = None
    if isinstance(resp, dict):
        type_id = (resp.get("type") or "").strip()
        name = (resp.get("name") or "").strip()
        if type_id in valid_types and name:
            mr = (resp.get("math_rule") or "").strip().lower()
            inv = (resp.get("invariant") or "").strip()
            pair = resp.get("pair")
            lens = {
                "type": type_id,
                "name": name,
                "watches": (resp.get("watches") or "").strip(),
                "scope_type": (resp.get("scope_type") or "story").strip(),
                "scope_name": (resp.get("scope_name") or "").strip(),
                "pair": pair if isinstance(pair, list) and pair else None,
                "y_items": _norm_y_items(resp.get("y_items")),
                "math_rule": mr if mr in _LIVE_MATH_RULES or mr == "arc" else None,
                "invariant": inv or None,
            }
    usage = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    logger.info("run_invent_lens_from_ask hit=%s in %.1fs",
                bool(lens), time.time() - t0)
    return {"lens": lens, "ran_at": ran_at, "usage": usage}


# ---------------------------------------------------------------------------
# Suggest result → store-list entries
# ---------------------------------------------------------------------------

def flatten_suggestions(result: dict) -> list[dict]:
    """`run_suggest_gauges` result → flat `suggested` entries (one per lens×scope).
    Each references a template (lens_id) + the suggested scope + reason/fit."""
    sug = result.get("suggestions") or {}
    entries: list[dict] = []

    def _emit(fit, scope_type, scope_name):
        if isinstance(fit, dict) and (fit.get("lens_id") or "").strip():
            entries.append({
                "lens_id": fit["lens_id"], "scope_type": scope_type,
                "scope_name": scope_name, "reason": (fit.get("reason") or "").strip(),
                "fit": fit.get("fit_score"),
            })

    for fit in sug.get("story") or []:
        _emit(fit, "story", "the whole story")
    for grp, scope_type in (("characters", "character"), ("items", "object")):
        d = sug.get(grp)
        if isinstance(d, dict):
            for nm, fits in d.items():
                for fit in fits or []:
                    _emit(fit, scope_type, str(nm).strip())
    return entries


def flatten_inventions(result: dict) -> list[dict]:
    """`run_suggest_custom_gauges` result → flat `invented` entries (each IS a spec)."""
    return [cg for cg in (result.get("custom_gauges") or [])
            if isinstance(cg, dict) and cg.get("name") and cg.get("display")]
