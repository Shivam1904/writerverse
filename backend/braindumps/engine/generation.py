"""Generation submodule — braindump extraction.

Public symbols:
    run_init_elements
    run_promote_character
    run_draft_world_entity
"""
from __future__ import annotations

import logging
import time

from ai_engine import llm_utils
from ai_engine.usage_meter import cost_usd, meter, total_tokens
from common.timeutil import now_iso

logger = logging.getLogger("writerverse.consistency")

_WORLD_KIND_NOUN = {
    "loc": "location",
    "item": "object or item",
    "faction": "faction or group",
    "magic": "element of the magic system",
    "creature": "creature or species",
    "culture": "cultural element",
    "history": "piece of history",
    "rule": "rule of how the world works",
    "world": "element of the world",
}


def run_init_elements(synopsis: str, braindumps: list[str],
                      title: str = "") -> dict:
    """V2 Phase 1: synopsis + braindumps → structured elements (story, characters,
    items, rules). Engine never judges; this output describes the story so
    the writer can pick templates next. Returns {elements, ran_at, usage}."""
    t0 = time.time()
    ran_at = now_iso()
    braindumps_text = "\n".join(f"- {i}" for i in braindumps) if braindumps else "(none)"
    title_hint = (f"\n\nThe writer's working title is: {title}"
                  if title else "")
    prompt = f"""You are reading a writer's brainstormed story-bible-in-progress:
a SYNOPSIS plus a list of BRAINDUMPS.{title_hint}

Extract STRUCTURED ELEMENTS into four kinds.

  • story     — the meta-entity (EXACTLY ONE). Fields: summary, title
                  • summary = 2-3 sentences synthesised from synopsis + braindumps
                  • title   = the writer's working title (use the hint above
                    when given; otherwise propose one from the synopsis)

  • character — a NAMED person. Fields: name, role, description
                  • role ∈ {{protagonist, antagonist, supporting}}
                  • AT LEAST ONE character must be the protagonist — the story's
                    main character whose journey the book follows. Always
                    include one, even if the writer never named the role.
                  • If any named person appears in the braindumps (even sparingly), emit them as at least `supporting`. The writer
                    will prune anyone they don't want.
                  • If you can't decide between antagonist and supporting,
                    default to `supporting`. The writer relabels manually.
                  • Resolve pronouns; never emit an unnamed person.

  • item      — a NAMED significant object. Fields: name, description
                  • Recurring or singular-referent objects. Skip generic
                    props ("a chair," "her phone").

  • rule      — a CONSTRAINT that does NOT exist in our ordinary world.
                  Fields: text, scope ∈ {{world, character[NAME], item[NAME]}}

                  The test: would a reader from our ordinary real world need
                  this taught to them? If yes → rule. If they'd already
                  assume it → not a rule.

                  ✓ rules:
                    • "the notebook kills only if writer knows name + face"
                    • "no one may speak of what's underneath"
                    • "swimming is forbidden"
                    • "iron is currency in the Float"
                    • "the eye trade costs half your remaining lifespan"

                  ✗ NOT rules:
                    • "the house has never been empty"  (a plot detail)
                    • "wind moves through the rooms"     (flavor)
                    • "Light is a top student"           (character description)

DO NOT emit elements for:
  • flavor / atmosphere
  • restatements or sub-clauses of one claim
  • themes, open writer-questions, working-title alternatives — these stay
    inside Story.summary as free text
  • plot beats / scenes — outlining is a separate later step

Return ONLY a JSON object (no prose, no markdown fences):
{{
  "story":      {{"summary": "...", "title": "..."}},
  "characters": [{{"name": "...", "role": "...", "description": "..."}}],
  "items":      [{{"name": "...", "description": "..."}}],
  "rules":      [{{"text": "...", "scope": "..."}}]
}}

SYNOPSIS:
{synopsis or "(none)"}

BRAINDUMPS:
{braindumps_text}
"""
    with meter() as _cb:
        elements = llm_utils.ask_json(prompt, tag="init", expect=dict)
    if not isinstance(elements, dict):
        elements = {"story": {}, "characters": [], "items": [], "rules": []}
    usage = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    chars = len(elements.get("characters") or [])
    items = len(elements.get("items") or [])
    rules = len(elements.get("rules") or [])
    logger.info(
        "run_init_elements braindumps=%d → chars=%d items=%d rules=%d in %.1fs",
        len(braindumps), chars, items, rules, time.time() - t0,
    )
    return {"elements": elements, "ran_at": ran_at, "usage": usage,
            "counts": {"characters": chars, "items": items, "rules": rules}}


def run_promote_character(name: str, phrases: list[dict], ideas: list[str],
                          known_entities: list | None = None) -> dict:
    """Draft ONE full character from everything the braindumps say about `name`.

    The single-character, richer sibling of run_init_elements: fed the phrases that
    mention this candidate (each with its craft tags) + the raw ideas they came from,
    it drafts a full story-bible entry — every authored field the material makes
    obvious (arcs, want/need/misbelief, appearance, voice, …). Engine never judges;
    it describes so the writer can accept/edit per field. Crucially it OMITS any field
    the material doesn't support (no invention). Returns {character, ran_at, usage,
    records}.

    `known_entities` is accepted for signature compatibility but no longer used —
    relationships were dropped from the draft."""
    t0 = time.time()
    ran_at = now_iso()
    name = (name or "").strip() or "this character"
    phrase_lines = "\n".join(
        f"- {(p.get('text') or '').strip()}"
        + (f"  [tags: {', '.join(p.get('tags') or [])}]" if p.get("tags") else "")
        for p in (phrases or []) if (p.get("text") or "").strip()
    ) or "(none)"
    ideas_text = "\n\n".join(i.strip() for i in (ideas or []) if i.strip()) or "(none)"
    prompt = f"""You are reading everything a writer's braindumps say about ONE
character: "{name}". Below are the PHRASES that mention them (each with the craft
tags the annotator assigned) and the raw IDEAS those phrases came from.

Draft this ONE character as a story-bible entry. Fill EVERY field the material makes
obvious; you may reasonably extrapolate arcs and motivation from what's there. But
OMIT any field the material doesn't support — leave it out entirely rather than
inventing. Don't contradict the material.

Fields you may return (omit the ones the ideas don't support):
  • role          — protagonist | antagonist | supporting
  • description   — 2-3 sentences: who they are, drawn from the material
  • want          — their concrete external goal (what they're chasing), 1 sentence
  • need          — the deeper internal thing they actually need, 1 sentence
  • misbelief     — the false belief / lie they hold that the story will challenge
  • external_arc  — their OUTER journey: the goal/conflict and how it shifts (1-2 sentences)
  • internal_arc  — their INNER journey: the belief/wound/need that changes (1-2 sentences)
  • summary       — a one-line thumbnail of the character
  • status        — a short note on their current story state, only if implied
  • appearance    — an object with ONLY the slots the material gives:
                    {{age, gender, build, hair, eyes, clothing, features}}
  • voice_profile — an object with ONLY what's evident:
                    {{lexicon, sentence_length, taboo_words, pet_phrases}}
  • aliases       — other names they go by, as a list of {{"name": "..."}} (only if any)

PHRASES about {name}:
{phrase_lines}

IDEAS:
{ideas_text}

Return ONLY a JSON object (no prose, no markdown fences) with ONLY the fields the
material supports. Example with everything present:
{{
  "role": "...", "description": "...", "want": "...", "need": "...",
  "misbelief": "...", "external_arc": "...", "internal_arc": "...",
  "summary": "...", "status": "...",
  "appearance": {{"hair": "..."}}, "voice_profile": {{"pet_phrases": "..."}},
  "aliases": [{{"name": "..."}}]
}}
"""
    with meter() as _cb:
        char = llm_utils.ask_json(prompt, tag="promote_character", expect=dict)
    if not isinstance(char, dict):
        char = {}
    char.setdefault("name", name)
    usage = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    logger.info(
        "run_promote_character name=%s phrases=%d ideas=%d in %.1fs",
        name, len(phrases or []), len(ideas or []), time.time() - t0,
    )
    return {"character": char, "ran_at": ran_at, "usage": usage}


def run_draft_world_entity(name: str, kind: str, phrases: list[dict], ideas: list[str]) -> dict:
    """Draft a short DESCRIPTION for ONE world element from everything the
    braindumps say about it. The world sibling of run_promote_character: fed the
    phrases that mention this entity (each with its craft tags) + the raw ideas,
    it writes a 1-3 sentence story-bible description grounded ONLY in the material
    (no invention). Returns {content, ran_at, usage, records}."""
    t0 = time.time()
    ran_at = now_iso()
    name = (name or "").strip() or "this element"
    noun = _WORLD_KIND_NOUN.get((kind or "").strip(), "element of the world")
    phrase_lines = "\n".join(
        f"- {(p.get('text') or '').strip()}"
        + (f"  [tags: {', '.join(p.get('tags') or [])}]" if p.get("tags") else "")
        for p in (phrases or []) if (p.get("text") or "").strip()
    ) or "(none)"
    ideas_text = "\n\n".join(i.strip() for i in (ideas or []) if i.strip()) or "(none)"
    prompt = f"""You are reading everything a writer's braindumps say about ONE
{noun} in their story's world: "{name}". Below are the PHRASES that mention it
(each with the craft tags the annotator assigned) and the raw IDEAS those phrases
came from.

Write a concise worldbuilding DESCRIPTION of "{name}" — 1 to 3 sentences — drawn
ONLY from the material. Say what it is and what matters about it. You may connect
the dots the ideas imply, but do NOT invent facts the material doesn't support,
and don't contradict it. Plain prose: no heading, no name prefix, no markdown.

PHRASES about {name}:
{phrase_lines}

IDEAS:
{ideas_text}

Return ONLY a JSON object (no prose, no markdown fences): {{"description": "..."}}
"""
    with meter() as _cb:
        out = llm_utils.ask_json(prompt, tag="draft_world_entity", expect=dict)
    content = ""
    if isinstance(out, dict):
        content = str(out.get("description") or out.get("content") or "").strip()
    usage = {"total_tokens": total_tokens(_cb), "cost_usd": float(cost_usd(_cb))}
    logger.info(
        "run_draft_world_entity name=%s kind=%s phrases=%d ideas=%d in %.1fs",
        name, kind, len(phrases or []), len(ideas or []), time.time() - t0,
    )
    return {"content": content, "ran_at": ran_at, "usage": usage}
