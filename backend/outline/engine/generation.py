"""Generation submodule — outline + naming.

Public symbols:
    generate_title
    run_user_wishes_rough
    run_generate_thread
    run_merge_rough_into_grand
"""
from __future__ import annotations

import logging
import time

from ai_engine import llm_utils
from ai_engine.usage_meter import cost_usd, meter, total_tokens
from common.ids import new_id
from common.timeutil import now_iso

from outline.engine import (
    _apply_merge_placements,
    _format_plot_threads_for_extract,
    _grand_scene_index,
    _placed_item_ids,
)
from outline.engine.config import _ROLES

logger = logging.getLogger("writerverse.consistency")


def generate_title(description: str, case: str = "title") -> dict:
    """Name something in a few words from a free-text description. One LLM call.

    Pure utility: no story context, no DB. Returns a primary title plus a
    couple of alternatives in the same spirit, so a caller can offer choices.
    The caller decides what (if anything) to do with the result.

    `case` picks the casing rule: "title" (default — book/project titles) or
    "sentence" (scene/outline headings, which match the app's sentence-case
    headings rather than Title Case).

    Returns {title, alternatives, ran_at, usage, records}."""
    ran_at = now_iso()
    desc = (description or "").strip()
    case_rule = (
        "Sentence case — capitalize only the first word and proper nouns. No surrounding quotes."
        if case == "sentence"
        else "Title Case. No surrounding quotes."
    )
    prompt = f"""You name things for a fiction writer. Given a DESCRIPTION,
write one short, evocative TITLE of a few words (≤6 words), plus 2-3
alternative titles in the same spirit.

Rules:
  • A few words only — no sentences, no trailing punctuation.
  • Capture the essence of the description; don't pad with generic filler.
  • {case_rule}

DESCRIPTION:
{desc or "(empty)"}

Return ONLY this JSON object — no markdown fences, no prose:
{{"title": "<the best title>", "alternatives": ["<alt 1>", "<alt 2>", "<alt 3>"]}}"""
    with meter() as _cb:
        resp = llm_utils.ask_json(prompt, role=_ROLES.get("title", "small"),
                         tag="generate_title", expect=dict)
    if not isinstance(resp, dict):
        resp = {}
    title = str(resp.get("title") or "").strip()
    raw_alts = resp.get("alternatives")
    alternatives = ([str(a).strip() for a in raw_alts if str(a).strip()]
                    if isinstance(raw_alts, list) else [])
    # Don't echo the primary back inside the alternatives list.
    alternatives = [a for a in alternatives if a != title]
    return {
        "title": title,
        "alternatives": alternatives,
        "ran_at": ran_at,
        "usage": {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))},
    }


def run_user_wishes_rough(synopsis: str, braindumps: list[str],
                          title: str = "") -> dict:
    """V2 OUTLINE Step 4: one LLM call producing a `story`-scoped user-wishes
    rough outline from synopsis + braindumps (in writer's order). The result is a
    flat list of items (heading | text | placeholder), NOT 3-act-shaped — the
    grand outline will absorb these items via a later merge step.

    Returns {"rough_outline": RoughOutline, "ran_at", "usage", "records",
             "items_count"}. Engine never judges; this just transcribes the
    writer's wishes into outline shape."""
    t0 = time.time()
    ran_at = now_iso()
    braindumps_text = "\n".join(f"{i+1}. {t}" for i, t in enumerate(braindumps)) if braindumps else "(none)"
    title_hint = f"\n\nWorking title: {title}" if title else ""
    prompt = f"""You are reading a writer's brainstormed story-bible-in-progress:
a SYNOPSIS and a list of BRAINDUMPS, ordered as the writer typed them.{title_hint}

Transcribe their narrative wishes into a flat ROUGH OUTLINE. This is NOT the
final outline; it captures plot intent the writer cares about, in roughly the
order they thought of it. A later merge step will place these items into the
grand outline's act/chapter/scene tree.

Each item is one of:
  • heading     — a label for a section the writer mentioned (e.g.
                  "Opening", "First obstacle", "Confrontation with father").
                  Use a SHORT noun-phrase (≤8 words). Headings group nothing
                  in the rough outline — they're just markers.
  • text        — a single beat/braindump/event the writer described. One
                  sentence. Concrete. No flavor text, no themes.
  • placeholder — a "…" slot. Emit only when the writer hinted that
                  *something belongs here but they don't know what yet*
                  (e.g. "and then something happens with the magic system").

Rules:
  • Preserve the writer's order — do not re-sequence into 3-act shape.
  • Do not invent beats not implied by the synopsis or braindumps.
  • Skip flavor, theme, character description, world-building — those live
    in elements, not the outline.
  • A reasonable outline is 6–25 items. Fewer is fine if the brainstorm is
    thin; do not pad.

Return ONLY a JSON object (no prose, no markdown fences):
{{
  "items": [
    {{"kind": "heading",     "text": "..."}},
    {{"kind": "text",        "text": "..."}},
    {{"kind": "placeholder", "text": "..."}}
  ]
}}

SYNOPSIS:
{synopsis or "(none)"}

BRAINDUMPS (in writer order):
{braindumps_text}
"""
    with meter() as _cb:
        resp = llm_utils.ask_json(prompt, tag="rough_outline", expect=dict)
    raw_items = (resp or {}).get("items") if isinstance(resp, dict) else None
    items: list[dict] = []
    if isinstance(raw_items, list):
        for it in raw_items:
            if not isinstance(it, dict):
                continue
            kind = it.get("kind")
            text = (it.get("text") or "").strip()
            if kind not in ("heading", "text", "placeholder") or not text:
                continue
            items.append({"id": new_id("it"), "kind": kind, "text": text})
    rough = {
        "id": new_id("ro"),
        "scope": {"type": "story", "name": "Story"},
        "source": "user_wishes",
        "items": items,
        "created_at": ran_at,
    }
    usage = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    logger.info(
        "run_user_wishes_rough braindumps=%d → items=%d in %.1fs",
        len(braindumps), len(items), time.time() - t0,
    )
    return {"rough_outline": rough, "ran_at": ran_at, "usage": usage,
            "items_count": len(items)}


def run_generate_thread(
    braindumps: list[str],
    all_braindumps: list[str] | None = None,
    synopsis: str = "",
    title: str = "",
    existing_threads: list[dict] | None = None,
    scope_type: str | None = None,
    scope_name: str | None = None,
) -> dict:
    """Generate a plot thread CENTRED on a specific set of braindumps (the focus
    set the writer hand-picked), while keeping the full braindump pool
    (`all_braindumps`) in view as grounding context. Unlike user_wishes (which
    transcribes ALL braindumps flat), this produces a single
    SETUP → PROGRESS → PAYOFF thread. Source: "generated"."""
    t0 = time.time()
    ran_at = now_iso()
    focus_set = set(braindumps)
    # Context = the rest of the pool (everything not already in focus). If no
    # wider pool was passed, there's simply no extra context to show.
    context = [t for t in (all_braindumps or []) if t not in focus_set]
    braindumps_text = "\n".join(f"  {i+1}. {t}" for i, t in enumerate(braindumps)) if braindumps else "(none)"
    context_text = "\n".join(f"  - {t}" for t in context) if context else "(none)"
    title_hint = f"\n\nWorking title: {title}" if title else ""
    thread_text = _format_plot_threads_for_extract(existing_threads or [])

    prompt = f"""You are drafting one PLOT THREAD for a writer's story-bible.
Centre it on the FOCUS BRAINDUMPS below — the writer hand-picked these as what
this thread is about. The OTHER BRAINDUMPS are the rest of the story; use them
only as context (to stay consistent and avoid contradictions), NOT as the
subject of this thread.{title_hint}

EVERY plot thread is shaped as SETUP → PROGRESS → PAYOFF, and carries a
short TITLE. Draft the thread in these three phases:
  • setup    — how the thread is introduced / promised.
  • progress — how it deepens, complicates, or escalates mid-story.
  • payoff   — how it resolves, lands, or is revealed.

Within each phase, emit plot points. Each plot point is one of:
  • text        — a single concrete beat. One sentence. Specific to THIS
                  story's braindumps — do not generate generic beats.
  • placeholder — a "…" slot when the phase is implied but the braindumps
                  don't say enough yet to commit to a beat.

Rules:
  • Build the thread from the FOCUS BRAINDUMPS and synopsis — do not invent
    beats the writer did not imply. The OTHER BRAINDUMPS are background only:
    draw on them to keep the thread consistent, but don't make them its subject.
  • If the focus braindumps don't imply enough for a phase, return that phase as
    an EMPTY list — a placeholder will be inserted. NEVER invent a beat just
    to fill a phase.
  • A phase usually has 1-4 plot points. Keep beats concrete.
  • The title is a short noun-phrase naming this thread (≤6 words).

SYNOPSIS:
{synopsis or "(none)"}

FOCUS BRAINDUMPS (what this thread is about):
{braindumps_text}

OTHER BRAINDUMPS (the rest of the story — context only, not the subject):
{context_text}

EXISTING PLOT THREADS (headings only, so you don't duplicate them):
{thread_text}

Return ONLY a JSON object (no prose, no markdown fences):
{{
  "title": "<short thread title>",
  "setup":    [{{"kind": "text"|"placeholder", "text": "..."}}],
  "progress": [{{"kind": "text"|"placeholder", "text": "..."}}],
  "payoff":   [{{"kind": "text"|"placeholder", "text": "..."}}]
}}"""
    with meter() as _cb:
        resp = llm_utils.ask_json(prompt, role=_ROLES.get("outline", "small"),
                         tag="generate_thread", expect=dict)
    resp = resp if isinstance(resp, dict) else {}
    title_out = (resp.get("title") or "Untitled thread").strip()

    def _phase_items(raw) -> list[dict]:
        out_items: list[dict] = []
        if isinstance(raw, list):
            for it in raw:
                if not isinstance(it, dict):
                    continue
                kind = it.get("kind")
                text = (it.get("text") or "").strip()
                if kind not in ("text", "placeholder") or not text:
                    continue
                out_items.append(
                    {"id": new_id("it"), "kind": kind, "text": text})
        return out_items

    items: list[dict] = []
    placeholder_phases: list[str] = []
    for phase_key, phase_label, gap_hint in (
        ("setup", "Setup", "setup not yet drafted"),
        ("progress", "Progress", "progress not yet drafted"),
        ("payoff", "Payoff", "payoff not yet drafted"),
    ):
        items.append({"id": new_id("it"), "kind": "heading",
                      "text": phase_label})
        phase_items = _phase_items(resp.get(phase_key))
        if phase_items:
            items.extend(phase_items)
        else:
            items.append({"id": new_id("it"), "kind": "placeholder",
                          "text": f"… {gap_hint}"})
            placeholder_phases.append(phase_key)

    # Scope the generated thread to a caller-supplied entity (e.g. a character)
    # when given; otherwise it's a whole-story thread, as before.
    scope = (
        {"type": scope_type.strip(), "name": (scope_name or "").strip()}
        if scope_type and scope_type.strip()
        else {"type": "story", "name": "Story"}
    )
    plot_thread = {
        "id": new_id("ro"),
        "title": title_out,
        "scope": scope,
        "source": "generated",
        "items": items,
        "created_at": ran_at,
    }
    usage = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    logger.info(
        "run_generate_thread braindumps=%d title=%r → %d items "
        "(%d phase placeholders) in %.1fs",
        len(braindumps), title_out,
        len(items), len(placeholder_phases), time.time() - t0,
    )
    return {"plot_thread": plot_thread, "ran_at": ran_at,
            "usage": usage,
            "items_count": len(items)}


def run_merge_rough_into_grand(rough: dict, grand: dict) -> dict:
    """V2 OUTLINE Step 5 (AI-proposed merge): one LLM call that proposes a
    target scene for every item in the rough outline. The engine does NOT
    auto-apply — the writer reviews the diff and accepts.

    Returns {"proposed_grand": GrandOutline, "placements": [...], "ran_at",
             "usage", "records"}.
    """
    t0 = time.time()
    ran_at = now_iso()
    scenes = _grand_scene_index(grand)
    # Re-running merge only places what is still missing: beats already in the
    # outline are never sent to the AI again (no second set of suggestions).
    placed = _placed_item_ids(grand)
    items = [it for it in (rough.get("items") or []) if it.get("id") not in placed]
    if not items:
        logger.info("run_merge_rough_into_grand rough=%s: every beat already placed",
                    rough.get("id"))
        return {"proposed_grand": grand, "placements": [], "ran_at": ran_at,
                "usage": {"total_tokens": 0, "cost_usd": 0.0}}
    scope = rough.get("scope") or {}
    source = rough.get("source") or "scaffold"

    scene_menu = "\n".join(f"- {s['scene_id']}: {s['label']}" for s in scenes) or "(no scenes)"
    item_menu = "\n".join(
        f"- {it.get('id')} ({it.get('kind')}): {it.get('text')}"
        for it in items
    ) or "(no items)"

    prompt = f"""You are placing items from a ROUGH OUTLINE into the canonical
GRAND OUTLINE (3-act tree). Each rough item becomes one BEAT inside one scene.

Rough outline scope: {scope.get('type')} / {scope.get('name')}
Rough outline source: {source}

Available scenes (use the scene_id verbatim):
{scene_menu}

Items to place:
{item_menu}

Rules:
  • EVERY item gets placed into exactly ONE scene_id. Never drop an item.
  • Scenes may receive multiple items — keep their reading order intact.
  • Spread items across acts when the rough outline suggests progression
    (e.g. hero-journey scaffolds: openings in Act I, climax late Act II,
    resolution in Act III). For thin user-wishes outlines, lean conservative.
  • `kind` of the resulting beat: 'text' if the item carries content; use
    'placeholder' only when the item itself is a "…" slot.
  • `beat_text` is the prose for the beat. For scaffold items
    (e.g. heading "Call to Adventure"), expand into a one-sentence beat
    in the writer's context (e.g. "Call to Adventure — something nudges
    them out of the ordinary world."). For user-wishes 'text' items,
    keep the writer's wording mostly intact.
  • If this thread opens after another thread is already underway, it
    usually reads cleanly to let it resolve before that earlier thread
    closes (nested story structure). A light preference, not a constraint —
    only when the existing beats make it natural.

Return ONLY a JSON object:
{{
  "placements": [
    {{"item_id": "...", "scene_id": "...", "kind": "text|placeholder", "beat_text": "..."}}
  ]
}}
"""
    with meter() as _cb:
        resp = llm_utils.ask_json(prompt, tag="merge", expect=dict)
    raw_placements = (resp or {}).get("placements") if isinstance(resp, dict) else None
    placements: list[dict] = []
    valid_scene_ids = {s["scene_id"] for s in scenes}
    valid_item_ids = {it.get("id") for it in items}
    if isinstance(raw_placements, list):
        for p in raw_placements:
            if not isinstance(p, dict):
                continue
            if p.get("item_id") not in valid_item_ids:
                continue
            if p.get("scene_id") not in valid_scene_ids:
                continue
            placements.append({
                "item_id": p.get("item_id"),
                "scene_id": p.get("scene_id"),
                "kind": p.get("kind") if p.get("kind") in ("text", "placeholder") else "text",
                "beat_text": (p.get("beat_text") or "").strip(),
            })
    proposed_grand = _apply_merge_placements(grand, rough, placements)
    usage = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    logger.info(
        "run_merge_rough_into_grand rough=%s items=%d placed=%d in %.1fs",
        rough.get("id"), len(items), len(placements), time.time() - t0,
    )
    return {
        "proposed_grand": proposed_grand,
        "placements": placements,
        "ran_at": ran_at,
        "usage": usage,
    }
