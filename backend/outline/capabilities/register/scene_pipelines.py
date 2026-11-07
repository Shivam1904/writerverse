"""Capability registrations — scene analysis pipelines.

Registers, at import time:
  - the real on-save pipelines (each via `register_scene_pipeline`)
  - `analyze_scene`        — fan-out: queue every ENABLED pipeline for one scene
  - `get_scene_pipelines`  — the toggle list (effective enabled state)
  - `set_scene_pipeline`   — flip one pipeline's switch

Add a new pipeline: write its analyzer in `outline/ai/scene_analysis.py`, then add
one `register_scene_pipeline(...)` line below. Storage, on-save trigger, switches,
and refetch are all handled by the framework.
"""
from actions.capabilities.registry import register
from actions.capabilities.spec import Actor, Capability, Route
from characters.models import Character
from common.tiptap import node_text

from outline.ai import scene_analysis
from outline.capabilities.pipelines import (
    commit_analyze_scene,
    commit_set_scene_pipeline,
    gather_analyze_scene,
    gather_get_scene_pipelines,
    gather_set_scene_pipeline,
    read_scene_pipelines,
    register_scene_pipeline,
)

_NO_CHAT = (Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON)

# ---- the pipelines -------------------------------------------------------- #

register_scene_pipeline(
    key="summary",
    label="Scene summary",
    analyze=scene_analysis.summarize_scene,
    # Opt-in: off until the author flips the switch. Keeps scene saves instant by
    # default — nothing runs (and nothing blocks) until a pipeline is enabled.
    default_enabled=False,
    cost="medium",
)


def _resolve_nouns_context(ctx, scene) -> dict:
    """Context for resolve_nouns: the project's known nouns (characters+aliases,
    world items, threads, braindump entities) + the prose of the chapter's
    scenes BEFORE this one (so a pronoun's antecedent across scenes resolves)."""
    from braindumps.readers import known_entities_for

    from outline.store import load_threads
    known = known_entities_for(
        ctx.project_id,
        threads=load_threads(ctx),
        include_aliases=True,
    )
    prior: list[str] = []
    from outline.store import load_chapter_of_scene
    chapter = load_chapter_of_scene(ctx, scene.get("id"), include_prose=True)
    if chapter is not None:
        for sc in chapter.get("scenes") or []:
            if sc.get("id") == scene.get("id"):
                break  # only scenes BEFORE the one being analysed
            text = node_text(sc.get("content")).strip()
            if text:
                prior.append(text)
    return {"known_entities": known, "prior_text": "\n\n".join(prior)}


def _resolve_nouns_enrich(ctx, data) -> dict:
    """Attach entity_type + entity_id to each mention/resolved item by resolving its
    `noun` against the project's known-entity index (characters + aliases, world
    items, threads). The analyzer (Django-free) only knows names; this is the
    DB-side step that lets the frontend index a mention by character id. Lists stay
    flat — grouping (by character id, etc.) is the frontend's job. A noun that
    matches no known entity simply gets null type/id (still a valid mention)."""
    if not isinstance(data, dict):
        return data
    from braindumps.readers import _norm_name, known_entity_index_for

    from outline.store import load_threads

    index = known_entity_index_for(
        ctx.project_id,
        threads=load_threads(ctx),
        include_aliases=True,
    )

    def attach(items) -> None:
        for it in items or []:
            if not isinstance(it, dict):
                continue
            hit = index.get(_norm_name(it.get("noun")))
            it["entity_type"] = hit["type"] if hit else None
            it["entity_id"] = hit["id"] if hit else None

    attach(data.get("mentions"))
    attach(data.get("resolved"))
    return data


register_scene_pipeline(
    key="resolve_nouns",
    label="Resolve nouns & pronouns",
    analyze=scene_analysis.resolve_nouns,
    gather_context=_resolve_nouns_context,
    enrich=_resolve_nouns_enrich,
    default_enabled=False,
    cost="medium",
)


def _pov_purity_context(ctx, scene) -> dict:
    """The scene's effective POV (its chapter's declared POV, else the project
    default) so the head-hopping check knows whose interiority is allowed."""
    from outline.store import load_chapter_of_scene, load_pov_default
    chapter = load_chapter_of_scene(ctx, scene.get("id"))
    pov: dict = (chapter or {}).get("pov") or {}
    if not (pov.get("mode") or pov.get("character")):
        pov = load_pov_default(ctx) or {}
    return {"pov_mode": (pov.get("mode") or "").strip(),
            "pov_character": (pov.get("character") or "").strip()}


def _hook_context(ctx, scene) -> dict:
    """The scene's first + last real paragraphs (the plain-text body the analyzer
    receives is space-joined and has no paragraph breaks)."""
    from outline.engine import scene_paragraphs as sp
    paras = [p.get("text", "").strip() for p in sp.scene_paragraphs(scene)
             if p.get("text", "").strip()]
    return {"opening": paras[0] if paras else "",
            "closing": paras[-1] if len(paras) > 1 else (paras[0] if paras else "")}


def _voice_context(ctx, scene) -> dict:
    """A compact profile per character (name | want | need | misbelief | arc) for
    the voice-consistency check. Runs unlocked (Django side) so it may hit the DB."""
    lines: list[str] = []
    for c in Character.objects.filter(project_id=ctx.project_id).only(
        "name", "story", "want", "need", "misbelief"
    )[:6]:
        parts = [c.name]
        if c.want:
            parts.append(f"want: {c.want[:60]}")
        if c.need:
            parts.append(f"need: {c.need[:60]}")
        if c.misbelief:
            parts.append(f"misbelief: {c.misbelief[:60]}")
        if c.story:
            parts.append(f"arc: {c.story[:80]}")
        lines.append(" | ".join(parts))
    return {"character_profiles": "\n".join(lines)}


register_scene_pipeline(
    key="pov_purity",
    label="POV purity (head-hopping)",
    analyze=scene_analysis.pov_purity,
    gather_context=_pov_purity_context,
    default_enabled=False,
    cost="medium",
)

register_scene_pipeline(
    key="hook_grade",
    label="Hook grade (open / close)",
    analyze=scene_analysis.hook_grade,
    gather_context=_hook_context,
    default_enabled=False,
    cost="medium",
)

register_scene_pipeline(
    key="subtext",
    label="Subtext (on-the-nose dialogue)",
    analyze=scene_analysis.detect_subtext,
    default_enabled=False,
    cost="medium",
)

register_scene_pipeline(
    key="voice",
    label="Voice consistency",
    analyze=scene_analysis.voice_consistency,
    gather_context=_voice_context,
    default_enabled=False,
    cost="medium",
)

register_scene_pipeline(
    key="scene_properties",
    label="Scene fingerprint (pacing · mood · intensity)",
    analyze=scene_analysis.scene_properties,
    default_enabled=False,
    cost="medium",
)

# ---- fan-out + switch capabilities ---------------------------------------- #

register(Capability(
    name="analyze_scene",
    description=(
        "Run all ENABLED scene-analysis pipelines on one scene (by `scene_id`). "
        "Queues each as a best-effort follow-up; the write page fires this in the "
        "background after a save so the save itself stays instant."
    ),
    route=Route.WRITE,
    args={"scene_id": "string"},
    gather=gather_analyze_scene,
    commit=commit_analyze_scene,
    actors=_NO_CHAT,
))

register(Capability(
    name="get_scene_pipelines",
    description=(
        "List the scene-analysis pipelines with each one's effective enabled "
        "state (project switch, else default). Drives the on/off toggle UI."
    ),
    route=Route.READ,
    gather=gather_get_scene_pipelines,
    execute=read_scene_pipelines,
    actors=_NO_CHAT,
))

register(Capability(
    name="set_scene_pipeline",
    description=(
        "Turn one scene-analysis pipeline on or off for this project "
        "(`key` + `enabled`). Stored per-project; read back by get_scene_pipelines."
    ),
    route=Route.WRITE,
    args={"key": "string", "enabled": "bool"},
    gather=gather_set_scene_pipeline,
    commit=commit_set_scene_pipeline,
    actors=_NO_CHAT,
))
