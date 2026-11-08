"""LLM-backed gauge analysis: state, checklist coverage, payoff, scale extract.

Owns: run_gauge_analyse, run_gauge_extract, and all supporting helpers
(_scenes_block, _ticks_block, _axis_of, tick providers, _run_gauge_state_analyse,
_run_coverage_analyse, _run_payoff_analyse, _run_extract_scale, resolve_ticks).
"""
from __future__ import annotations

import hashlib
import logging
import time

from ai_engine import llm_utils
from ai_engine.usage_meter import cost_usd, meter, total_tokens
from common.timeutil import now_iso
from common.tiptap import node_text
from outline.engine import (
    _flatten_scenes,
    _format_grand_outline_for_extract,
    _format_plot_threads_for_extract,
)
from outline.tree import iter_scenes, scene_crumb

from ._config import _PLACEHOLDER_BEAT_TEXT, _ROLES
from ._rules import _RULE_FNS, _verdict_text, lens_rules

logger = logging.getLogger("writerverse.gauges")

# ---------------------------------------------------------------------------
# Tick block formatters
# ---------------------------------------------------------------------------

def _scenes_block(scenes: list[dict]) -> str:
    return "\n".join(
        f'  - {{"id": "{s["id"]}", "label": "{s["label"]}"'
        + (f', "beats": "{s["beats"]}"' if s.get("beats") else "")
        + "}"
        for s in scenes
    )


def _ticks_block(ticks: list[dict]) -> str:
    return "\n".join(
        f'  - {{"id": "{t["id"]}", "label": "{t["label"]}"'
        + (f', "notes": "{t["text"]}"' if t.get("text") else "")
        + "}"
        for t in ticks
    )


# ---------------------------------------------------------------------------
# Configurable x-axis — the tick registry (AXIS.md)
# A gauge tags one value per TICK. `walk` = the corpus + text read; `tick` =
# granularity. The engine is tick-shape-indifferent: every provider returns
# the SAME [{id, label, text}] shape `_run_gauge_state_analyse` consumes.
# ---------------------------------------------------------------------------

def _axis_of(lens: dict) -> tuple[str, str]:
    """Effective (walk, tick); default {outline, scene} = today's behaviour."""
    ax = lens.get("axis") or {}
    return ((ax.get("walk") or "outline").strip(),
            (ax.get("tick") or "scene").strip())


def _edit_of(item) -> str:
    """The per-item edit stamp set by the commit layer (_touch). '' if never
    stamped (pre-existing items). Used to mark a tick stale vs analysed_at."""
    return (item.get("updated_at") or "") if isinstance(item, dict) else ""


def _max_edit(items) -> str:
    """Latest edit stamp across a list of items — the edit time of an aggregate
    tick (act / chapter / heading) that rolls several items into one bar."""
    return max((_edit_of(b) for b in (items or [])), default="")


def _beat_display_text(b: dict) -> str | None:
    """Return the text to send to the AI for a beat, or None to skip it.
    Headings are skipped (they become tick labels, not content).
    Placeholder beats get a fixed sentinel so the AI can flag them as gaps.
    Only text and placeholder kinds are forwarded; unknown kinds are dropped."""
    kind = b.get("kind") or "text"
    if kind == "heading":
        return None
    if kind == "placeholder":
        return _PLACEHOLDER_BEAT_TEXT
    if kind == "text":
        t = (b.get("text") or "").strip()
        return t if t else None
    return None


def _group_by_heading(items: list[dict], prefix: str) -> list[dict]:
    """Each heading item + the non-heading items until the next heading = one
    tick. Items before the first heading are dropped (no group to attach to)."""
    groups: list[dict] = []
    cur: dict | None = None
    for i, b in enumerate(items or []):
        if b.get("kind") == "heading":
            cur = {"id": b.get("id") or f"{prefix}#h{i}",
                   "label": (b.get("text") or "Heading").strip(), "_buf": [],
                   "_edits": [_edit_of(b)]}
            groups.append(cur)
        elif cur is not None:
            t = _beat_display_text(b)
            if t is not None:
                cur["_buf"].append(t)
                cur["_edits"].append(_edit_of(b))
    return [{"id": grp["id"], "label": grp["label"], "text": " · ".join(grp["_buf"]),
             "edited_at": max(grp["_edits"], default="")}
            for grp in groups]


def _leaf_beats(beats: list[dict], prefix: str, label: str) -> list[dict]:
    out: list[dict] = []
    for i, b in enumerate(beats or []):
        t = _beat_display_text(b)
        if t is None:
            continue
        out.append({"id": b.get("id") or f"{prefix}#b{i}", "label": label, "text": t,
                    "edited_at": _edit_of(b)})
    return out


def _ticks_outline_scene(grand_outline, threads, scope, thread_ref):
    return [{"id": s["id"], "label": s["label"], "text": s.get("beats", ""),
             "edited_at": s.get("edited_at", "")}
            for s in _flatten_scenes(grand_outline)]


def _ticks_outline_beat(grand_outline, threads, scope, thread_ref):
    out: list[dict] = []
    for p in iter_scenes(grand_outline):
        crumb = scene_crumb(p)
        out.extend(_leaf_beats(p.scene.get("beats") or [], p.scene.get("id") or crumb, crumb))
    return out


def _ticks_outline_heading(grand_outline, threads, scope, thread_ref):
    out: list[dict] = []
    for p in iter_scenes(grand_outline):
        out.extend(_group_by_heading(p.scene.get("beats") or [], p.scene.get("id") or "sc"))
    return out


def _aggregate_beats(scenes: list[dict]) -> str:
    parts: list[str] = []
    for sc in scenes or []:
        for b in sc.get("beats") or []:
            t = _beat_display_text(b)
            if t is not None:
                parts.append(t)
    return " · ".join(parts)


def _ticks_outline_act(grand_outline, threads, scope, thread_ref):
    out: list[dict] = []
    for n, a in enumerate((grand_outline or {}).get("acts") or []):
        scenes = [sc for ch in a.get("chapters") or [] for sc in ch.get("scenes") or []]
        beats = [b for sc in scenes for b in sc.get("beats") or []]
        out.append({"id": a.get("id") or a.get("text") or f"act{n}",
                    "label": a.get("text") or "Act", "text": _aggregate_beats(scenes),
                    "edited_at": _max_edit(beats)})
    return out


def _ticks_outline_chapter(grand_outline, threads, scope, thread_ref):
    out: list[dict] = []
    for a in (grand_outline or {}).get("acts") or []:
        aL = a.get("text") or "Act"
        for n, ch in enumerate(a.get("chapters") or []):
            beats = [b for sc in ch.get("scenes") or [] for b in sc.get("beats") or []]
            out.append({"id": ch.get("id") or f"{aL}#ch{n}",
                        "label": f"{aL} → {ch.get('text', 'Chapter')}",
                        "text": _aggregate_beats(ch.get("scenes") or []),
                        "edited_at": _max_edit(beats)})
    return out


def _find_thread(threads, thread_ref):
    return next((t for t in threads or []
                 if isinstance(t, dict) and t.get("id") == thread_ref), None)


def _ticks_thread_beat(grand_outline, threads, scope, thread_ref):
    t = _find_thread(threads, thread_ref)
    if not t:
        return []
    label = t.get("title") or "Thread"
    return _leaf_beats(t.get("items") or [], thread_ref or "ro", label)


def _ticks_thread_heading(grand_outline, threads, scope, thread_ref):
    t = _find_thread(threads, thread_ref)
    if not t:
        return []
    return _group_by_heading(t.get("items") or [], thread_ref or "ro")


# The STORY walk reads the scene PROSE (scene["content"], a TipTap doc that rides
# in the same grand_outline blob), not the planning beats the outline walk reads.
# `story/scene` tags one value per scene's prose; `story/chapter` per chapter
# (its scenes' prose concatenated). (AXIS.md §2 — the prose-fed walk.)
def _ticks_story_scene(grand_outline, threads, scope, thread_ref):
    out: list[dict] = []
    for p in iter_scenes(grand_outline):
        sc = p.scene
        if not sc.get("id"):
            continue
        out.append({
            "id": sc["id"],
            "label": scene_crumb(p),
            "text": node_text(sc.get("content")).strip(),
            # prose walk reads scene CONTENT → the scene node's own stamp.
            "edited_at": _edit_of(sc),
        })
    return out


def _ticks_story_chapter(grand_outline, threads, scope, thread_ref):
    out: list[dict] = []
    for a in (grand_outline or {}).get("acts") or []:
        aL = a.get("text") or "Act"
        for n, ch in enumerate(a.get("chapters") or []):
            prose = " ".join(node_text(sc.get("content"))
                             for sc in ch.get("scenes") or []).strip()
            out.append({
                "id": ch.get("id") or f"{aL}#ch{n}",
                "label": f"{aL} → {ch.get('text', 'Chapter')}",
                "text": prose,
                # prose walk per chapter → latest scene-content stamp in the chapter.
                "edited_at": _max_edit(ch.get("scenes") or []),
            })
    return out


_TICK_PROVIDERS = {
    ("outline", "scene"): _ticks_outline_scene,
    ("outline", "beat"): _ticks_outline_beat,
    ("outline", "heading"): _ticks_outline_heading,
    ("outline", "act"): _ticks_outline_act,
    ("outline", "chapter"): _ticks_outline_chapter,
    ("thread", "beat"): _ticks_thread_beat,
    ("thread", "heading"): _ticks_thread_heading,
    ("story", "scene"): _ticks_story_scene,
    ("story", "chapter"): _ticks_story_chapter,
}


def resolve_ticks(lens, grand_outline, threads, scope, thread_ref=""):
    """The ordered tick list for a lens's effective axis. Unknown (walk, tick)
    or a coverage lens → the {outline, scene} default."""
    walk, tick = _axis_of(lens)
    fn = _TICK_PROVIDERS.get((walk, tick)) or _TICK_PROVIDERS[("outline", "scene")]
    return fn(grand_outline, threads, scope, thread_ref)


def _walk_ids(lens, grand_outline, threads, thread_ref="") -> list[str]:
    """The ids a lens reads along its walk, in reading order. thread walk → the
    thread's items; story walk → act / chapter / scene (it reads prose, not
    beats); outline walk (and coverage lenses) → act / chapter / scene / beat."""
    walk, _ = _axis_of(lens)
    if walk == "thread":
        t = _find_thread(threads, thread_ref)
        return [str(b.get("id") or "") for b in (t or {}).get("items") or []]
    ids: list[str] = []
    for a in (grand_outline or {}).get("acts") or []:
        ids.append(f"a:{a.get('id') or ''}")
        for ch in a.get("chapters") or []:
            ids.append(f"c:{ch.get('id') or ''}")
            for sc in ch.get("scenes") or []:
                ids.append(f"s:{sc.get('id') or ''}")
                if walk != "story":
                    ids.extend(f"b:{b.get('id') or ''}" for b in sc.get("beats") or [])
    return ids


def order_fingerprint(lens, grand_outline, threads, thread_ref="") -> str:
    """A short hash of the ORDER of what this lens reads. Saved with each
    analysis; when the served value differs, an act / chapter / scene / beat
    the lens reads was moved (or added / removed) since it ran → outdated.
    A lens is only affected by moves along its own walk."""
    joined = "\n".join(_walk_ids(lens, grand_outline, threads, thread_ref))
    return hashlib.sha1(joined.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# LLM analysis backends
# ---------------------------------------------------------------------------

def _run_gauge_state_analyse(
    lens: dict, scope: dict, y_items: list[dict], ticks: list[dict],
    synopsis: str, braindumps: list[str],
) -> dict:
    """One value per tick from the scale — a fork of the engine's state analyse
    that renders y_items as ``value — description`` so the AI tags against the
    MEANING, not bare labels (the schema: the scale is the one field user+AI read).
    Includes the lens's locked `analyse_head` + per-lens `analyse_body`."""
    if not ticks:
        return {"data_points": [], "verdict": "no ticks on this axis yet"}
    if not y_items:
        return {"data_points": [], "verdict": "no scale yet — add or extract one first"}

    # Only ticks with REAL text get scored. An empty tick (e.g. an unwritten scene
    # on the prose walk) has no content to read — scoring it would mean judging its
    # label (the scene heading / breadcrumb), so we mark it null/unread and never
    # send it to the model. The FE renders null-value ticks as faint "not read
    # here" ghosts, so the x-axis still shows every scene.
    scored = [t for t in ticks if (t.get("text") or "").strip()]

    def _null_point(t: dict) -> dict:
        return {"tick_id": t["id"], "scene_id": t["id"], "value": None,
                "values": [], "confidence": 0.0, "reasoning": ""}

    # Nothing written yet → every tick is null/unread; no LLM call.
    if not scored:
        return {"data_points": [_null_point(t) for t in ticks]}

    values = [yi["value"] for yi in y_items if yi.get("value")]
    y_set = {v.lower() for v in values}
    scale_block = "\n".join(
        f"  - {yi['value']}" + (f" — {yi['description']}" if yi.get("description") else "")
        for yi in y_items
    )
    braindumps_text = ("\n".join(f"  {i + 1}. {t}" for i, t in enumerate(braindumps))
                       if braindumps else "  (none)")
    # The PROSE walk judges ONLY the written scene text — strip story-level context
    # (synopsis / braindumps) so the model can't attribute a synopsis fact to a
    # scene whose prose doesn't contain it. Every other walk keeps the context.
    walk, _tick = _axis_of(lens)
    context_block = "" if walk == "story" else f"""
SYNOPSIS:
{synopsis or "(none)"}

BRAINDUMPS:
{braindumps_text}
"""
    head = (lens.get("analyse_head") or "").strip()
    body = (lens.get("analyse_body") or "").strip()
    prompt = f"""You are scoring a "{lens.get('name')}" chart for a writer's story.
Scope: {scope.get('type')} = "{scope.get('name')}"
{head}
{body}

THE SCALE (use the meaning, not just the label):
{scale_block}

For each scene below, give the scale value(s) that fit "{scope.get('name')}" in that
scene — usually ONE; a LIST of values if the scene genuinely has more than one at once
(e.g. two holders / two places); or null if the subject isn't present.

For each tick, judge ONLY from its `notes` (the actual text). NEVER infer a value
from a tick's `label` (the scene heading / breadcrumb) — the label is only there
to identify the tick.

TICKS (ordered):
{_ticks_block(scored)}

Note: any tick whose text contains "{_PLACEHOLDER_BEAT_TEXT}" means the author
has left that beat empty. Treat it as a content gap and flag it in your reasoning.
{context_block}
Return ONLY a JSON list aligned to the ticks (same order, same length):
[{{"tick_id": "...", "value": <one scale value, OR a list of values, OR null>, "confidence": 0..1, "reasoning": "<=15 words"}}, …]
No markdown fences. No prose."""


    resp = llm_utils.ask_json(prompt, role=_ROLES.get("probe", "small"),
                     tag="gauge_state", expect=list)
    # index the model's answers by tick id (its return order isn't trusted).
    scored_ids = {t["id"] for t in scored}
    by_id: dict = {}
    if isinstance(resp, list):
        for r in resp:
            if not isinstance(r, dict):
                continue
            sid = r.get("tick_id") or r.get("scene_id")
            if sid in scored_ids:
                by_id[sid] = r

    # Build data_points IN TICK ORDER. Renderers that plot by array index (the
    # mini-charts) rely on this; the verdict maps by tick_id and is order-agnostic.
    # Empty ticks → null/unread; a scored tick the model skipped → null too.
    points: list[dict] = []
    for t in ticks:
        r = by_id.get(t["id"])
        if r is None:
            points.append(_null_point(t))
            continue
        raw = r.get("value")
        cands = raw if isinstance(raw, list) else [raw]
        vals: list[str] = []
        for c in cands:
            if isinstance(c, str) and c.strip() and c.strip().lower() in y_set:
                s = c.strip()
                if s not in vals:
                    vals.append(s)   # on-menu only; the scale is canonical
        try:
            conf = float(r.get("confidence", 0.5) or 0.5)
        except (TypeError, ValueError):
            conf = 0.5
        points.append({
            "tick_id": t["id"],
            "scene_id": t["id"],   # alias for FE back-compat
            "value": vals[0] if vals else None,   # primary — shape/monotone rules
            "values": vals,                        # full per-tick list — single_occupancy
            "confidence": max(0.0, min(1.0, conf)),
            "reasoning": str(r.get("reasoning") or "").strip()[:200],
        })
    return {"data_points": points}


def _payoff_haystack(scope: dict, plot_threads: list[dict], grand_outline: dict | None) -> str:
    """Candidate text for pairing: plot threads on this scope + the grand outline
    (mirrors the thread-coverage haystack)."""
    scope_type = scope.get("type") or ""
    scope_name = scope.get("name") or ""
    lines: list[str] = []
    for t in plot_threads or []:
        if not isinstance(t, dict):
            continue
        sc = t.get("scope") or {}
        if sc.get("type") == scope_type and sc.get("name") == scope_name:
            for it in t.get("items") or []:
                kind = it.get("kind") or "text"
                if kind == "heading":
                    continue
                text = _beat_display_text(it)
                if text is not None:
                    lines.append(f"  - {kind}: {text}")
    for p in iter_scenes(grand_outline):
        sc = p.scene
        beats = " · ".join(
            t for b in (sc.get("beats") or [])
            if (t := _beat_display_text(b)) is not None
        )
        lines.append(f"  - scene [{sc.get('id')}]: {sc.get('text', '')}"
                     + (f" — {beats}" if beats else ""))
    return "\n".join(lines) if lines else "  (no plot points or outline content yet)"


def _run_payoff_analyse(
    lens: dict, scope: dict, plot_threads: list[dict], grand_outline: dict | None,
    synopsis: str, braindumps: list[str], y_items: list[dict],
) -> dict:
    """Find each SETUP and its PAYOFF; pair them; flag every setup with no payoff.
    Delivers the catalogue's promised verdict — "N setups still hanging", BY NAME
    in the story's own words. Grounded by the lens's locked extract/analyse heads
    + per-lens bodies (what counts as a setup/payoff for THIS lens)."""
    known = [yi["value"] for yi in (y_items or []) if yi.get("value")]
    analyse_head = (lens.get("analyse_head") or "").strip()
    extract_head = (lens.get("extract_head") or "").strip()
    body = " ".join(x for x in (lens.get("analyse_body"), lens.get("extract_body")) if x)
    known_text = (", ".join(known) if known else "(none found yet — discover them)")
    prompt = f"""You are pairing SETUPS with PAYOFFS for "{lens.get('name')}" in a story.
Scope: {scope.get('type')} = "{scope.get('name')}"
{extract_head}
{analyse_head}
{body}

Name each setup and payoff in the STORY'S OWN words (e.g. "the unsent postcards"),
NEVER the generic words "plant"/"payoff". A setup with no scene that resolves it
is "hanging".

Setups noticed so far (extend if you find more): {known_text}

CANDIDATE TEXT (plot threads + the outline):
{_payoff_haystack(scope, plot_threads, grand_outline)}

SYNOPSIS:
{synopsis or "(none)"}

Return ONLY a JSON list, ONE object per setup. Give the scene id(s) where each is
PLANTED and where it's PAID OFF (empty payoff list = still hanging):
[{{"setup": "<named in the story's words>",
   "planted": ["<scene id(s) where it's set up>"],
   "payoff":  ["<scene id(s) where it's paid off — empty list if none yet>"],
   "evidence": "<=20 words"}}, …]
No markdown fences. No prose."""
    resp = llm_utils.ask_json(prompt, role=_ROLES.get("coverage", "small"),
                     tag="gauge_payoff", expect=list)

    def _idlist(x):
        if isinstance(x, list):
            return [str(i).strip() for i in x if str(i).strip()]
        s = str(x or "").strip()
        return [s] if s else []

    pairs: list[dict] = []
    if isinstance(resp, list):
        for r in resp:
            if not isinstance(r, dict):
                continue
            setup = (r.get("setup") or "").strip()
            if not setup:
                continue
            payoff = _idlist(r.get("payoff"))
            pairs.append({
                "setup": setup,
                "planted": _idlist(r.get("planted")),
                "payoff": payoff,                       # scene id(s)
                "scene_id": (payoff[0] if payoff else None),  # first payoff (visual)
                "paid": bool(payoff),
                "evidence": str(r.get("evidence") or "").strip()[:240],
            })
    hanging = [p for p in pairs if not p["paid"]]
    if not pairs:
        verdict = "no setups found to check"
    elif not hanging:
        verdict = f"all {len(pairs)} setups pay off"
    else:
        names = ", ".join(f"“{p['setup']}”" for p in hanging[:6])
        more = "" if len(hanging) <= 6 else f" (+{len(hanging) - 6} more)"
        verdict = f"{len(hanging)} setup(s) still hanging: {names}{more}"
    return {"pairs": pairs, "hanging_count": len(hanging), "verdict": verdict}


# ---------------------------------------------------------------------------
# Checklist coverage + scale extraction
# ---------------------------------------------------------------------------

def _run_coverage_analyse(
    lens: dict,
    scope: dict,
    y_items: list[str],
    plot_threads: list[dict],
    grand_outline: dict | None,
    synopsis: str,
) -> dict:
    """Checklist coverage: is each y_item fulfilled SOMEWHERE in the scope's plot
    threads + the grand outline? One LLM call, semantic matching.

    Returns {coverage: [{y_item, covered, evidence, confidence}],
             missing_count, verdict}."""
    if not y_items:
        return {
            "coverage": [],
            "missing_count": 0,
            "verdict": "no y_items to check",
        }

    lens_id = lens.get("id") or ""
    scope_type = scope.get("type") or ""
    scope_name = scope.get("name") or ""
    relevant_threads = [
        t for t in (plot_threads or [])
        if isinstance(t, dict)
        and (t.get("scope") or {}).get("type") == scope_type
        and (t.get("scope") or {}).get("name") == scope_name
    ]

    haystack_lines: list[str] = []
    for t in relevant_threads:
        tid = t.get("template_id") or t.get("source") or "?"
        for it in (t.get("items") or []):
            text = (it.get("text") or "").strip()
            if not text:
                continue
            kind = it.get("kind", "text")
            haystack_lines.append(f"  - [{tid}] {kind}: {text}")

    if isinstance(grand_outline, dict):
        for a in grand_outline.get("acts") or []:
            haystack_lines.append(f"  - grand act: {a.get('text', '')}")
            for ch in a.get("chapters") or []:
                haystack_lines.append(
                    f"    - grand chapter: {ch.get('text', '')}"
                )
                for sc in ch.get("scenes") or []:
                    haystack_lines.append(
                        f"      - grand scene: {sc.get('text', '')}"
                    )
                    for b in sc.get("beats") or []:
                        haystack_lines.append(
                            f"        - grand beat: {b.get('text', '')}"
                        )

    haystack = ("\n".join(haystack_lines) if haystack_lines
                else "  (no plot points or grand-outline content yet)")
    chart_label = lens.get("name") or lens_id

    prompt = f"""You are checking COVERAGE for a thread-type consistency chart.

Chart: "{chart_label}"  (template={lens_id})
Scope: {scope_type} = "{scope_name}"

Y_ITEMS (each one must be covered): {y_items}

For each y_item, decide whether the CANDIDATE TEXT below contains any
plot point, scene, beat, or label that fulfils that y_item's role.
Use SEMANTIC matching — exact words are not required (e.g. "first
obstacle" can fulfil "Inciting Incident"; "Light writes a name and
someone dies" can fulfil "plant" for a Chekhov-style thread).
Be strict: if nothing clearly fulfils a y_item, mark covered=false.

CANDIDATE TEXT (plot threads + grand outline structural elements):
{haystack}

SYNOPSIS:
{synopsis or "(none)"}

Return ONLY a JSON list aligned to Y_ITEMS (same order, same length):
[{{"y_item": "<exact y_item label>", "covered": true|false, "evidence": "<≤20 words quoting the matching text, or empty if covered=false>", "confidence": 0..1}}, …]
No markdown fences. No prose."""
    resp = llm_utils.ask_json(prompt, role=_ROLES.get("coverage", "small"),
                     tag="analyse_thread", expect=list)
    by_item: dict[str, dict] = {}
    if isinstance(resp, list):
        for r in resp:
            if not isinstance(r, dict):
                continue
            yi = (r.get("y_item") or "").strip()
            if yi:
                by_item[yi.lower()] = r

    coverage: list[dict] = []
    for yi in y_items:
        r = by_item.get(yi.lower())
        if r:
            try:
                conf = float(r.get("confidence", 0.5) or 0.5)
            except (TypeError, ValueError):
                conf = 0.5
            coverage.append({
                "y_item": yi,
                "covered": bool(r.get("covered")),
                "evidence": str(r.get("evidence") or "").strip()[:240],
                "confidence": max(0.0, min(1.0, conf)),
            })
        else:
            coverage.append({
                "y_item": yi,
                "covered": False,
                "evidence": "",
                "confidence": 0.0,
            })
    missing = [c for c in coverage if not c["covered"]]
    if not coverage:
        verdict = "no y_items to check"
    elif not missing:
        verdict = f"all {len(coverage)} y_item(s) covered"
    else:
        missing_str = ", ".join(c["y_item"] for c in missing[:6])
        suffix = "" if len(missing) <= 6 else f" (+{len(missing) - 6} more)"
        verdict = (
            f"{len(missing)} of {len(coverage)} y_item(s) MISSING: "
            f"{missing_str}{suffix}"
        )
    return {
        "coverage": coverage,
        "missing_count": len(missing),
        "verdict": verdict,
    }


def _run_extract_scale(
    lens: dict,
    scope: dict,
    synopsis: str,
    braindumps: list[str],
    plot_threads: list[dict],
    grand_outline: dict | None,
    prior_y_items: list[str] | None = None,
) -> dict:
    """One LLM call → a lens's y_items vocabulary (its scale), from the synopsis,
    braindumps, plot-thread headings and grand-outline scene labels. Passing
    the current y_items as ``prior_y_items`` keeps labels stable across runs.

    Returns {y_items: [{value, source, confidence}, …], ran_at, usage}. Output
    is the scale, NOT data points — those come later at analyse."""
    t0 = time.time()
    ran_at = now_iso()
    chart_label = lens.get("name") or lens.get("id") or "this chart"
    chart_def_id = lens.get("id") or ""
    backend = "coverage" if lens.get("data_style") == "coverage" else "trajectory"
    scope_type = scope.get("type") or "?"
    scope_name = scope.get("name") or ""

    hint = (f"List the distinct values \"{chart_label}\" could plausibly take "
            f"for {scope_type} \"{scope_name}\" across the story.")
    braindumps_text = ("\n".join(f"  {i + 1}. {t}" for i, t in enumerate(braindumps))
                  if braindumps else "  (none)")
    thread_text = _format_plot_threads_for_extract(plot_threads)
    outline_text = _format_grand_outline_for_extract(grand_outline)
    prior_text = ""
    if prior_y_items:
        prior_text = (
            "\nEXISTING LABELS — prefer these; only add new if clearly "
            "distinct in the braindumps:\n"
            f"  {', '.join(prior_y_items)}\n"
        )

    prompt = f"""You are populating the Y-AXIS VOCABULARY for a consistency
chart in a writer's story-bible.

Chart: "{chart_label}"  (id={chart_def_id}, backend={backend})
Scope: {scope_type} = "{scope_name}"

{hint}

Return 3-12 SHORT labels (1-3 words each, lowercase preferred). Concrete and
distinct — no duplicates, no flavor, no themes. If the braindumps + outline don't
imply any labels, return an empty list.

SYNOPSIS:
{synopsis or "(none)"}

BRAINDUMPS:
{braindumps_text}

PLOT THREADS (headings only, for structure):
{thread_text}

GRAND OUTLINE (scene labels only):
{outline_text}
{prior_text}
Return ONLY a JSON list of objects:
[{{"value": "<short label>", "source": "braindumps|plot_thread|grand_outline|existing", "confidence": 0..1}}, …]
No markdown fences. No prose."""

    with meter() as _cb:
        resp = llm_utils.ask_json(prompt, role=_ROLES.get("extract", "small"),
                         tag="extract_y_items", expect=list)
    out: list[dict] = []
    seen: set[str] = set()
    if isinstance(resp, list):
        for r in resp:
            if not isinstance(r, dict):
                continue
            v = (r.get("value") or "").strip()
            key = v.lower()
            if not v or key in seen:
                continue
            seen.add(key)
            try:
                conf = float(r.get("confidence", 0.5) or 0.5)
            except (TypeError, ValueError):
                conf = 0.5
            out.append({
                "value": v,
                "source": str(r.get("source") or "braindumps"),
                "confidence": max(0.0, min(1.0, conf)),
            })
    usage = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    logger.info(
        "_run_extract_scale lens=%s scope=%s/%s → %d items in %.1fs",
        chart_def_id, scope_type, scope_name,
        len(out), time.time() - t0,
    )
    return {"y_items": out, "ran_at": ran_at, "usage": usage}


# ---------------------------------------------------------------------------
# Public analysis entry points
# ---------------------------------------------------------------------------

def run_gauge_analyse(
    lens: dict,
    scope: dict,
    y_items: list[dict],
    grand_outline: dict | None,
    plot_threads: list[dict],
    synopsis: str,
    braindumps: list[str],
    thread_ref: str = "",
) -> dict:
    """Analyse one chart = produce DATA (LLM) then apply the lens's RULE
    (deterministic registry verdict). **No LLM in the verdict layer.**

      coverage · setup_payoff → `_run_payoff_analyse` (pairs)   ─┐
      coverage · checklist    → `_run_coverage_analyse`          ├▶ rule(values, y_items)
      scene_mapped            → `_run_gauge_state_analyse`       ─┘   → {ok, score, offending}

    Returns the data (`data_points` | `coverage` | `pairs`) + the verdict layer
    (`rule`, `offending`, `score`, `deferred`, `verdict`) + ran_at/usage/records.
    `offending[]` IS the report's findings."""
    t0 = time.time()
    ran_at = now_iso()
    data_style = lens.get("data_style")
    type_id = lens.get("type_id")
    ticks = resolve_ticks(lens, grand_outline, plot_threads, scope, thread_ref)
    values_str = [yi["value"] for yi in (y_items or []) if yi.get("value")]
    rules = lens_rules(lens)
    result: dict = {}

    # ---- DATA (LLM) + the rule's input ----
    with meter() as _cb:
        if data_style == "coverage":
            if type_id == "setup_payoff":
                data = _run_payoff_analyse(lens, scope, plot_threads, grand_outline,
                                           synopsis, braindumps, y_items)
                result["pairs"] = data.get("pairs") or []
                rule_input = [{"label": p["setup"], "present": p["paid"]} for p in result["pairs"]]
            else:
                data = _run_coverage_analyse(lens, scope, values_str, plot_threads,
                                             grand_outline, synopsis)
                result["coverage"] = data.get("coverage") or []
                rule_input = [{"label": c.get("y_item"), "present": bool(c.get("covered"))}
                              for c in result["coverage"]]
        else:  # scene_mapped
            data = _run_gauge_state_analyse(lens, scope, y_items, ticks, synopsis, braindumps)
            result["data_points"] = data.get("data_points") or []
            by_id = {d["tick_id"]: d for d in result["data_points"]}
            rule_input = [{"scene_id": t["id"],
                           "value": (by_id.get(t["id"]) or {}).get("value"),
                           "values": (by_id.get(t["id"]) or {}).get("values")}
                          for t in ticks]

    # ---- VERDICT ----
    if type_id == "setup_payoff":
        # TYPE-INTRINSIC (no registry rule): a setup with no payoff scene = hanging.
        pairs = result.get("pairs") or []
        offending = [{"label": p["setup"], "detail": "still hanging — no payoff"}
                     for p in pairs if not p.get("paid")]
        result["rules"] = []
        result["rules_applied"] = []
        result["rules_deferred"] = []
        result["offending"] = offending
        result["score"] = ((len(pairs) - len(offending)) / len(pairs)) if pairs else None
        result["deferred"] = False
        result["partial"] = False
        result["verdict"] = data.get("verdict") or _verdict_text(lens, offending, applied=True)
    else:
        # Run EVERY rule (deterministic), merge offending into one report. ALL-must-hold;
        # a rule whose engine support is deferred (arc/oscillate/no_jump/cover_in_order) is
        # skipped + listed in `rules_deferred` → that part renders as a map, and
        # `partial: true` when SOME rules are live and some deferred (B1).
        offending = []
        scores: list[float] = []
        oks: list = []
        applied_ids: list[str] = []
        deferred_ids: list[str] = []
        for rid in rules:
            fn = _RULE_FNS.get(rid)
            res = fn(rule_input, values_str) if fn else {"deferred": True}
            if res.get("deferred"):
                deferred_ids.append(rid)
                continue
            applied_ids.append(rid)
            for o in res.get("offending") or []:
                offending.append({**o, "rule": rid})
            if res.get("score") is not None:
                scores.append(res["score"])
            oks.append(res.get("ok"))
        # Aggregate pass/fail: a rule passes when its ok is True or None. ALL applied
        # rules must hold. A shape rule that tolerates a small dip reports ok=True
        # WITH offending → the wobble tier (not the total-failure `off` text).
        agg_ok = all(o is not False for o in oks)
        result["rules"] = rules
        result["rules_applied"] = applied_ids
        result["rules_deferred"] = deferred_ids
        result["offending"] = offending
        result["score"] = (min(scores) if scores else None)
        result["deferred"] = bool(rules) and not applied_ids   # nothing live → a map
        result["partial"] = bool(applied_ids) and bool(deferred_ids)
        result["verdict"] = _verdict_text(lens, offending, applied=bool(applied_ids), ok=agg_ok)

    result["ran_at"] = ran_at
    result["order_fp"] = order_fingerprint(lens, grand_outline, plot_threads, thread_ref)
    result["usage"] = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    logger.info("run_gauge_analyse lens=%s rules=%s offending=%d in %.1fs",
                lens.get("id"), rules, len(result["offending"]), time.time() - t0)
    return result


def run_gauge_extract(
    lens: dict,
    scope: dict,
    synopsis: str,
    braindumps: list[str],
    plot_threads: list[dict],
    grand_outline: dict | None,
    prior_values: list[str] | None = None,
) -> dict:
    """Extract a chart's scale (its y_items) with one LLM call.

    Returns ``{y_items: [{value, source, confidence}], ran_at, usage}``;
    descriptions stay empty for extracted items.
    """
    return _run_extract_scale(lens, scope, synopsis, braindumps, plot_threads,
                              grand_outline, prior_values or None)
