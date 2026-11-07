"""Scene analysis analyzers — the AI side of the scene-pipeline framework.

Each analyzer is `(body: str, *, context: dict | None = None) -> dict`. It takes a
scene's prose body (plain text) and returns a loose JSON dict that gets stored at
`scene["analysis"][<key>]`. Zero Django imports (provider-agnostic, per the
`ai_engine` rule).

Analyzers should be best-effort — the framework also wraps them, but returning a
`{"status": "failed"}` payload on a known problem is cleaner than raising. Add a
new analyzer here, then register it with `register_scene_pipeline(...)`.
"""
from __future__ import annotations

import logging

logger = logging.getLogger("writerverse.consistency")

# Cap the prose we feed an analyzer — a few thousand chars is plenty to
# characterise a scene without a needlessly large (slower) prompt.
_MAX_BODY_CHARS = 6000
# Preceding-chapter context is bounded harder than the scene itself — it's only
# there to give pronouns an antecedent, not to be analysed.
_MAX_PRIOR_CHARS = 4000


def _as_dicts(val, keys: tuple[str, ...]) -> list[dict]:
    """Coerce an LLM list into clean dicts with exactly `keys` (string values)."""
    out: list[dict] = []
    for it in val if isinstance(val, list) else []:
        if not isinstance(it, dict):
            continue
        row = {k: str(it.get(k) or "").strip() for k in keys}
        if any(row.values()):
            out.append(row)
    return out


def summarize_scene(body: str, *, context: dict | None = None) -> dict:
    """One-line synopsis + mood + a few key beats for a scene. One LLM call.

    Returns {status, summary, mood, beats}. Best-effort: empty body short-circuits
    and any LLM error returns a status:"failed" payload (still worth storing)."""
    text = (body or "").strip()
    if not text:
        return {"status": "empty", "summary": "", "mood": "", "beats": []}

    prompt = f"""You analyse fiction scenes for a writer's story bible.
Read the SCENE and report what is on the page — observe, do not judge or rewrite.

Return ONLY this JSON object — no markdown fences, no prose:
{{"summary": "<one sentence, what happens>",
  "mood": "<1-3 words for the emotional tone>",
  "beats": ["<key beat>", "<key beat>", "<key beat>"]}}

SCENE:
{text[:_MAX_BODY_CHARS]}"""

    try:
        from ai_engine.llm_utils import ask_json

        resp = ask_json(prompt, role="small", tag="scene_summary", expect=dict)
    except Exception as exc:  # noqa: BLE001 — best-effort; the scene is already saved
        logger.exception("scene_summary failed")
        return {"status": "failed", "error": str(exc)[:200]}

    if not isinstance(resp, dict):
        return {"status": "failed", "error": "model returned no JSON object"}
    beats = resp.get("beats")
    return {
        "status": "ok",
        "summary": str(resp.get("summary") or "").strip(),
        "mood": str(resp.get("mood") or "").strip(),
        "beats": [str(b).strip() for b in beats if str(b).strip()]
        if isinstance(beats, list) else [],
    }


def resolve_nouns(body: str, *, context: dict | None = None) -> dict:
    """Find entity mentions in a scene and resolve its pronouns to a proper noun.

    Given the project's KNOWN NOUNS (characters + aliases, world items, threads,
    braindump entities — built by the pipeline's gather) and the preceding scenes
    of the chapter as context, return, for THIS scene:

      - mentions:   phrases that name a known entity            [{phrase, noun}]
      - resolved:   pronoun phrases tied to their antecedent    [{phrase, pronoun, noun}]
      - unresolved: pronoun phrases with no obvious antecedent  [{phrase, pronoun}]  ← flagged

    Same extraction idea as the braindump annotator (known nouns biased into the
    prompt, phrases returned with the attached noun). Best-effort: never raises."""
    empty = {"status": "empty", "mentions": [], "resolved": [], "unresolved": []}
    text = (body or "").strip()
    if not text:
        return empty

    ctx = context or {}
    known = [str(n).strip() for n in (ctx.get("known_entities") or []) if str(n).strip()]
    prior = (ctx.get("prior_text") or "").strip()

    known_block = ", ".join(known) if known else "(none recorded yet)"
    prior_block = (f"\n\nEARLIER IN THE CHAPTER (context only — do NOT analyse, use "
                   f"it only to resolve pronouns):\n{prior[:_MAX_PRIOR_CHARS]}" if prior else "")

    prompt = f"""You resolve references in a fiction scene. Observe what is on the
page — do not rewrite or judge.

KNOWN NOUNS (the story's characters, their aliases, world items, and threads —
when a phrase refers to one, use its EXACT name as the `noun`):
{known_block}

For the SCENE below, return:
  1. mentions   — every phrase that names a known noun, with that noun.
  2. resolved   — every phrase containing a PRONOUN (he/she/they/it/him/her/them/
                  his/their/its…) you can tie to a referent, with the pronoun and
                  the proper noun it refers to. Treat subject, object, AND
                  possessive pronouns the same (he, him, his …). If exactly one
                  character/entity of matching gender & number is in scope — the
                  current point-of-view/subject, or the nearest matching noun —
                  that IS the antecedent; resolve to it. Carry the subject across
                  sentences: once a passage is about someone, their later he/him/
                  his resolve to them until a new subject clearly takes over.
  3. unresolved — ONLY genuinely ambiguous pronouns: TWO OR MORE candidates of
                  matching gender/number compete for the same pronoun, or there is
                  NO matching candidate anywhere in the scene or earlier context. A
                  lone obvious candidate is NOT unresolved. When in doubt, resolve —
                  flag sparingly. These are flags for the author.

Preserve the original wording of each phrase. Do not invent nouns not present in
the text or the known list.{prior_block}

SCENE (analyse this):
{text[:_MAX_BODY_CHARS]}

Return ONLY this JSON object — no markdown fences, no prose:
{{"mentions": [{{"phrase": "...", "noun": "..."}}],
  "resolved": [{{"phrase": "...", "pronoun": "...", "noun": "..."}}],
  "unresolved": [{{"phrase": "...", "pronoun": "..."}}]}}"""

    try:
        from ai_engine.llm_utils import ask_json

        resp = ask_json(prompt, role="small", tag="resolve_nouns", expect=dict)
    except Exception as exc:  # noqa: BLE001 — best-effort; the scene is already saved
        logger.exception("resolve_nouns failed")
        return {"status": "failed", "error": str(exc)[:200],
                "mentions": [], "resolved": [], "unresolved": []}

    if not isinstance(resp, dict):
        return {"status": "failed", "error": "model returned no JSON object",
                "mentions": [], "resolved": [], "unresolved": []}
    return {
        "status": "ok",
        "mentions": _as_dicts(resp.get("mentions"), ("phrase", "noun")),
        "resolved": _as_dicts(resp.get("resolved"), ("phrase", "pronoun", "noun")),
        "unresolved": _as_dicts(resp.get("unresolved"), ("phrase", "pronoun")),
    }


# The four scene checks below ask the model for STRUCTURED output (a pydantic
# schema in ai_engine/parsers.py). If the reply doesn't fit the schema, the chain
# raises and the check returns status "failed" ("couldn't check"). An empty list
# only ever means the model positively answered "nothing found" (SA-251).
#
# Test seam: when context carries `_test_result` (a dict or a schema instance),
# it stands in for the chain's output, so tests exercise parsing offline.

_OMNISCIENT_MODES = {"third-omniscient"}


def _structured(context: dict, build_chain, payload: dict, schema):
    """Invoke a structured-output chain and return a `schema` instance.

    Raises on anything that isn't one (None, a stray string, a dict with the
    wrong shape), so callers report "failed" instead of a false all-clear."""
    stub = (context or {}).get("_test_result")
    result = stub if stub is not None else build_chain().invoke(payload)
    if isinstance(result, dict):
        result = schema.model_validate(result)
    if not isinstance(result, schema):
        raise ValueError(f"model output did not match {schema.__name__}")
    return result


def _quoted(quote: str, reason: str) -> str:
    """One flag as the display string the UI splits on the dash."""
    quote, reason = (quote or "").strip().strip('"'), (reason or "").strip()
    return f'"{quote}" — {reason}' if reason else f'"{quote}"'


def pov_purity(body: str, *, context: dict | None = None) -> dict:
    """Head-hopping check: flag sentences accessing a non-POV character's interior.
    No-ops on omniscient POV (head-hopping is not a violation there)."""
    ctx = context or {}
    text = (body or "").strip()
    mode = (ctx.get("pov_mode") or "").strip()
    pov_character = (ctx.get("pov_character") or "").strip() or "unspecified"
    title = (ctx.get("title") or "").strip() or "Scene"
    if not text:
        return {"status": "empty", "mode": mode, "pov_character": pov_character,
                "violations": [], "violations_count": 0}
    if mode in _OMNISCIENT_MODES:
        return {"status": "ok", "mode": mode, "pov_character": pov_character,
                "violations": [], "violations_count": 0,
                "summary": "n/a — omniscient POV (head-hopping not a violation)."}
    try:
        from ai_engine.parsers import PovPurityResult

        from .chains.check_pov_purity import build_pov_purity_chain
        result = _structured(ctx, build_pov_purity_chain, {
            "scene_title": title, "pov_character": pov_character,
            "scene_content": text[:_MAX_BODY_CHARS]}, PovPurityResult)
    except Exception as exc:  # noqa: BLE001 — best-effort; the scene is already saved
        logger.exception("pov_purity failed")
        return {"status": "failed", "error": str(exc)[:200], "mode": mode,
                "pov_character": pov_character, "violations": [], "violations_count": 0,
                "summary": "Couldn't check POV for this scene."}
    violations = [_quoted(v.quote, v.reason) for v in result.violations]
    n = len(violations)
    return {"status": "ok", "mode": mode, "pov_character": pov_character,
            "violations": violations, "violations_count": n,
            "summary": (f"No POV violations (POV: {pov_character})." if n == 0
                        else f'Found {n} POV violation{"s" if n != 1 else ""} '
                             f"(POV: {pov_character}).")}


def hook_grade(body: str, *, context: dict | None = None) -> dict:
    """Grade the opening and closing of a scene. `context` may supply `opening`/
    `closing` (real paragraphs from the gather); else split the body."""
    ctx = context or {}
    text = (body or "").strip()
    title = (ctx.get("title") or "").strip() or "Scene"
    opening = (ctx.get("opening") or "").strip()
    closing = (ctx.get("closing") or "").strip()
    if not opening:
        if not text:
            return {"status": "empty"}
        paras = [p.strip() for p in text.split("\n\n") if p.strip()]
        opening = (paras[0] if paras else text)
        closing = (paras[-1] if len(paras) > 1 else opening)
    try:
        from ai_engine.parsers import HookGradeResult

        from .chains.grade_scene_hooks import build_hook_grader_chain
        result = _structured(ctx, build_hook_grader_chain, {
            "scene_title": title, "opening": opening[:600], "closing": closing[:600]},
            HookGradeResult)
    except Exception as exc:  # noqa: BLE001
        logger.exception("hook_grade failed")
        return {"status": "failed", "error": str(exc)[:200]}
    # Same "OPENING: <grade> — <note>" strings the UI already splits.
    opening_verdict = f"OPENING: {result.opening.grade} — {result.opening.note.strip()}"
    closing_verdict = f"CLOSING: {result.closing.grade} — {result.closing.note.strip()}"
    return {"status": "ok", "opening_verdict": opening_verdict,
            "closing_verdict": closing_verdict,
            "summary": f"{opening_verdict}\n{closing_verdict}"}


def detect_subtext(body: str, *, context: dict | None = None) -> dict:
    """Flag on-the-nose dialogue (characters saying exactly what they mean)."""
    ctx = context or {}
    text = (body or "").strip()
    title = (ctx.get("title") or "").strip() or "Scene"
    if not text:
        return {"status": "empty", "flags": [], "flags_count": 0}
    try:
        from ai_engine.parsers import SubtextResult

        from .chains.detect_subtext import build_subtext_detector_chain
        result = _structured(ctx, build_subtext_detector_chain, {
            "scene_title": title, "scene_content": text[:_MAX_BODY_CHARS]}, SubtextResult)
    except Exception as exc:  # noqa: BLE001
        logger.exception("detect_subtext failed")
        return {"status": "failed", "error": str(exc)[:200], "flags": [], "flags_count": 0,
                "summary": "Couldn't check dialogue subtext for this scene."}
    flags = [_quoted(f.quote, f.reason) for f in result.flags]
    n = len(flags)
    return {"status": "ok", "flags": flags, "flags_count": n,
            "summary": ("Dialogue uses subtext well." if n == 0
                        else f'Found {n} on-the-nose exchange{"s" if n != 1 else ""}.')}


def voice_consistency(body: str, *, context: dict | None = None) -> dict:
    """Flag characters whose voice/actions feel off for their arc stage.
    Needs `context["character_profiles"]` (built by the gather); skips without it."""
    ctx = context or {}
    text = (body or "").strip()
    title = (ctx.get("title") or "").strip() or "Scene"
    profiles = (ctx.get("character_profiles") or "").strip()
    if not text:
        return {"status": "empty", "flags": [], "flags_count": 0}
    if not profiles:
        return {"status": "skipped", "flags": [], "flags_count": 0,
                "summary": "Skipped — no character arcs to compare against."}
    try:
        from ai_engine.parsers import VoiceConsistencyResult

        from .chains.check_voice_consistency import build_voice_consistency_chain
        result = _structured(ctx, build_voice_consistency_chain, {
            "scene_title": title, "character_profiles": profiles,
            "scene_content": text[:_MAX_BODY_CHARS]}, VoiceConsistencyResult)
    except Exception as exc:  # noqa: BLE001
        logger.exception("voice_consistency failed")
        return {"status": "failed", "error": str(exc)[:200], "flags": [], "flags_count": 0,
                "summary": "Couldn't check character voice for this scene."}
    flags = [
        f"{f.character.strip()} — {f.reason.strip()}" if f.reason.strip() else f.character.strip()
        for f in result.flags
    ]
    n = len(flags)
    return {"status": "ok", "flags": flags, "flags_count": n,
            "summary": ("All characters sound on-arc." if n == 0
                        else f'Found {n} voice flag{"s" if n != 1 else ""}.')}


# Allowed values, mirrored for the FE so the bar strips can fix their ladders
# without a round-trip. Order is low→high where the dimension is ordered.
SCENE_PACING = ("action", "dialogue", "introspection", "exposition")
SCENE_MOOD = ("dark", "somber", "neutral", "hopeful", "light")


def scene_properties(body: str, *, context: dict | None = None) -> dict:
    """A 4-dimensional fingerprint of ONE scene: pacing kind, mood, intensity (1-5),
    and which characters are physically present. Stored whole at
    `scene["analysis"]["scene_properties"]`; the Scene Fingerprints walk renders each
    dimension as its own bar strip. Richer than a single-value gauge lens — that's
    why it lives here, not in the bank."""
    ctx = context or {}
    text = (body or "").strip()
    title = (ctx.get("title") or "").strip() or "Scene"
    if not text:
        return {"status": "empty"}
    stub = ctx.get("_test_obj")            # offline test seam — bypass the LLM
    if stub is not None:
        return {"status": "ok", **stub}
    try:
        from .chains.analyze_scene_properties import build_scene_analysis_chain
        result = build_scene_analysis_chain().invoke(
            {"scenes_context": f"Scene 1 (id=1) — {title}:\n{text[:_MAX_BODY_CHARS]}"})
        points = getattr(result, "data_points", None) or []
        if not points:
            return {"status": "failed", "error": "no data point returned"}
        p = points[0]
        return {"status": "ok", "pacing_type": p.pacing_type, "mood": p.mood,
                "intensity": int(p.intensity),
                "characters_present": list(p.characters_present or []),
                "rationale": p.rationale}
    except Exception as exc:  # noqa: BLE001 — best-effort; the scene is already saved
        logger.exception("scene_properties failed")
        return {"status": "failed", "error": str(exc)[:200]}
