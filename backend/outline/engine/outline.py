from __future__ import annotations

import logging

from common.ids import new_id

from outline.engine.config import _TEMPLATES_BY_ID, ALL_TEMPLATES, BASE_SCAFFOLD
from outline.tree import iter_scenes, scene_crumb

logger = logging.getLogger("writerverse.consistency")


def _empty_scene() -> dict:
    """An empty-titled scene with no beats — the writer adds them as they go.
    Scenes are the beat-holding leaf of the grand outline."""
    return {"id": new_id("sc"), "text": "", "beats": []}


def _empty_chapter(title: str = "") -> dict:
    """A chapter (optionally titled) holding one empty-titled scene."""
    return {"id": new_id("ch"), "text": (title or "").strip(), "scenes": [_empty_scene()]}


def _empty_act(name: str) -> dict:
    """A named act seeded with one empty-titled chapter holding one
    empty-titled scene — the structural skeleton the writer fills in."""
    return {"id": new_id("ac"), "text": name, "chapters": [_empty_chapter()]}


def _act_from_entry(entry) -> dict:
    """Build an act from either a plain act-name string (one empty, *unnamed*
    chapter — the legacy custom-scaffold shape) or a `{title, chapters: [titles]}`
    dict (named chapters, one empty scene each). Only the act + chapter TITLES
    differ; the skeleton (one scene per chapter, no beats) is unchanged."""
    if isinstance(entry, dict):
        title = (entry.get("title") or "").strip()
        chapter_titles = [str(t).strip() for t in (entry.get("chapters") or [])]
        chapters = [_empty_chapter(t) for t in chapter_titles] or [_empty_chapter()]
        return {"id": new_id("ac"), "text": title, "chapters": chapters}
    return _empty_act(str(entry))


def default_grand_outline(base_template: str = "three_act") -> dict:
    """Empty grand-outline skeleton built from a chosen base template.

    v3 §6 — writer picks the base at Init. Only templates with
    `grand_outline_base_fit: true` are valid here; the helper falls back to
    `three_act` if an unknown / non-fit id is passed, so callers can stay
    permissive.

    Acts are config-driven: `base_scaffold:` in outline/config/grand_outline.yml holds the
    NAMED ACTS per base-fit template. Only acts are named — each act is seeded
    with one empty-titled chapter holding one empty-titled scene for the writer
    to fill in. If a base-fit template has no `base_scaffold` entry, we fall
    back to a generic build with one act per `scaffold` beat."""
    tpl = _TEMPLATES_BY_ID.get(base_template)
    if not tpl or not tpl.get("grand_outline_base_fit"):
        base_template = "three_act"
        tpl = _TEMPLATES_BY_ID.get("three_act")

    # Acts come from base_scaffold; fall back to the flat scaffold beats.
    act_names = BASE_SCAFFOLD.get(base_template) or tpl.get("scaffold") or []

    return {
        "base_template": base_template,
        "acts": [_empty_act(name) for name in act_names],
    }


def grand_outline_from_act_names(acts: list) -> dict:
    """Custom grand-outline skeleton from a writer-supplied act list. Each entry
    is either a plain act-name string (one empty, *unnamed* chapter) or a
    `{title, chapters: [titles]}` dict (named chapters, one empty scene each) —
    the latter is how a structure scaffold (e.g. "Act › Chapter") names both
    levels. Same shape as default_grand_outline; base_template is `custom`."""
    return {
        "base_template": "custom",
        "acts": [_act_from_entry(a) for a in acts],
    }


def grand_outline_base_options() -> list[dict]:
    """v3 §6 — list of templates eligible as the grand-outline base. The
    writer picks one at Init; default is `three_act`."""
    return [
        {"id": t.get("id"), "label": t.get("label")}
        for t in ALL_TEMPLATES
        if t.get("grand_outline_base_fit")
    ]


def _flatten_scenes(grand: dict | None) -> list[dict]:
    """Walk the grand outline and return the ordered list of scenes — each
    {id, label}. label is the chained breadcrumb so the LLM can locate it."""
    out: list[dict] = []
    for p in iter_scenes(grand):
        sc = p.scene
        sid = sc.get("id")
        if not sid:
            continue
        beats = sc.get("beats") or []
        beat_text = " · ".join(b.get("text", "")
                               for b in beats if b.get("text"))
        label = scene_crumb(p)
        # the scene's effective edit stamp for gauge staleness: the latest
        # of its beats' edits (the outline-walk reads beats), falling back
        # to the scene node's own stamp when it has no beats.
        edited = max((b.get("updated_at") or "" for b in beats),
                     default="") or (sc.get("updated_at") or "")
        out.append({
            "id": sid,
            "label": label,
            "beats": beat_text,
            "edited_at": edited,
        })
    return out


def _format_plot_threads_for_extract(plot_threads: list[dict]) -> str:
    """Compact text representation of plot threads for LLM prompts."""
    if not plot_threads:
        return "  (none)"
    lines = []
    for t in plot_threads:
        title = t.get("title") or t.get("template_id") or "thread"
        scope = (t.get("scope") or {})
        scope_str = f"{scope.get('type','?')}/{scope.get('name','?')}"
        headings = [it.get("text", "") for it in (t.get("items") or [])
                    if it.get("kind") == "heading"]
        lines.append(f"  [{scope_str}] {title}: {' · '.join(headings)}")
    return "\n".join(lines)


def _format_grand_outline_for_extract(grand: dict | None) -> str:
    """Scene labels only — for use in LLM prompts that need outline structure."""
    if not isinstance(grand, dict):
        return "  (none)"
    lines = [f"  - {p.scene.get('text') or p.scene.get('id') or '?'}"
             for p in iter_scenes(grand)]
    return "\n".join(lines) if lines else "  (none)"


def _grand_scene_index(grand: dict) -> list[dict]:
    """Flat list of {scene_id, label} so the merge prompt can address scenes
    cheaply. label is 'Act I · Ch 1 · Sc 1' style."""
    return [
        {"scene_id": p.scene.get("id"),
         "label": " · ".join((p.act.get("text") or f"Act {p.act_index + 1}",
                              p.chapter.get("text") or f"Chapter {p.chapter_index + 1}",
                              p.scene.get("text") or f"Scene {p.scene_index + 1}"))}
        for p in iter_scenes(grand)
    ]


def _placed_item_ids(grand: dict) -> set[str]:
    """Thread-beat ids already placed in the outline: a scene beat carries its
    source thread-beat id as `from_item` (same rule the Merge page uses)."""
    return {b["from_item"]
            for p in iter_scenes(grand)
            for b in (p.scene.get("beats") or [])
            if isinstance(b, dict) and b.get("from_item")}


def _apply_merge_placements(grand: dict, rough: dict,
                            placements: list[dict]) -> dict:
    """Insert beats into the grand outline tree according to LLM placements.
    Placements: [{item_id, scene_id, beat_text, kind: 'text'|'placeholder'}].
    Unknown item_ids or scene_ids are skipped (defensive — never mutate
    structure the model didn't address). Returns a new grand dict (immutable)."""
    items_by_id = {it.get("id"): it for it in (rough.get("items") or [])}
    scene_lookup: dict[str, list] = {}
    # Shallow-copy every node and only override the child list we rebuild, so
    # all other fields survive — especially the scene's prose `content` (and
    # `words`, `_analysis`, pov/tense/status). A field whitelist here silently
    # wiped scene content on merge-accept.
    new_grand = dict(grand)
    new_grand["base_template"] = grand.get("base_template", "three_act")
    new_grand["acts"] = []
    for act in grand.get("acts") or []:
        new_act = dict(act)
        new_act["chapters"] = []
        for ch in act.get("chapters") or []:
            new_ch = dict(ch)
            new_ch["scenes"] = []
            for sc in ch.get("scenes") or []:
                new_sc = dict(sc)
                new_sc["beats"] = list(sc.get("beats") or [])
                scene_lookup[new_sc.get("id")] = new_sc["beats"]
                new_ch["scenes"].append(new_sc)
            new_act["chapters"].append(new_ch)
        new_grand["acts"].append(new_act)

    for p in placements or []:
        if not isinstance(p, dict):
            continue
        item_id = p.get("item_id")
        scene_id = p.get("scene_id")
        if item_id not in items_by_id or scene_id not in scene_lookup:
            continue
        item = items_by_id[item_id]
        kind = p.get("kind") if p.get("kind") in ("text", "placeholder") else (
            "placeholder" if item.get("kind") == "placeholder" else "text"
        )
        beat_text = (p.get("beat_text") or item.get("text") or "").strip()
        if not beat_text:
            continue
        scene_lookup[scene_id].append({
            "id": new_id("bt"),
            "kind": kind,
            "text": beat_text,
            "from_rough": rough.get("id"),
            "from_item": item_id,
        })
    return new_grand
