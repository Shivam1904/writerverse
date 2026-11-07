"""Gather layer — outline tree + plot thread CRUD."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

from outline.store import load_scene

# ---- outline tree --------------------------------------------------------- #

def gather_init_grand_outline(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    raw_acts = args.get("acts")
    acts: list | None = None
    if raw_acts is not None:
        if not isinstance(raw_acts, list):
            raise CapabilityError("`acts` must be a list of act names", 400)
        # Each entry is either a plain act-name string (one empty, unnamed
        # chapter) or a {title, chapters: [titles]} dict (a structure scaffold
        # naming both the act and its chapters). Blanks are dropped.
        acts = []
        for a in raw_acts:
            if isinstance(a, dict):
                title = str(a.get("title") or "").strip()
                if not title:
                    continue
                chapters = [str(c).strip() for c in (a.get("chapters") or []) if str(c).strip()]
                acts.append({"title": title, "chapters": chapters})
            else:
                s = str(a).strip()
                if s:
                    acts.append(s)
        if not acts:
            raise CapabilityError("custom scaffold needs at least one act name", 400)
    return {
        "base_template": (args.get("base_template") or "").strip() or None,
        "acts": acts,
    }


def gather_add_outline_item(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    return {
        "item_type": args.get("item_type", ""),
        "parent_id": args.get("parent_id", ""),
        "text": args.get("text", ""),
        "id": args.get("id", ""),
        "at_index": args.get("at_index"),
    }


def gather_update_outline_item(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    item_type = args.get("item_type")
    item_id = args.get("item_id")
    if not item_type or not item_id:
        raise CapabilityError("item_type and item_id are required", 400)
    return {
        "item_type": item_type,
        "item_id": item_id,
        "text": args.get("text"),
        "kind": args.get("kind"),
        "written": args.get("written"),
    }


def gather_reorder_outline_item(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    item_type = args.get("item_type")
    item_id = args.get("item_id")
    new_index = args.get("new_index")
    if not item_type or not item_id or new_index is None:
        raise CapabilityError("item_type, item_id, and new_index are required", 400)
    return {"item_type": item_type, "item_id": item_id, "new_index": int(new_index)}


def gather_delete_outline_item(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    item_type = args.get("item_type")
    item_id = args.get("item_id")
    if not item_type or not item_id:
        raise CapabilityError("item_type and item_id are required", 400)
    return {"item_type": item_type, "item_id": item_id}


def gather_list_scene_revisions(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Earlier versions of a scene's prose, newest first: id, time, words (no prose)."""
    from common.tiptap import word_count

    from outline.models import SceneRevision

    scene_id = args.get("scene_id")
    if not scene_id:
        raise CapabilityError("scene_id is required", 400)
    rows = SceneRevision.objects.filter(
        project_id=ctx.project_id, scene__uid=scene_id,
    ).order_by("-id")
    return {
        "scene_id": scene_id,
        "revisions": [
            {"id": r.id, "created_at": r.created_at.isoformat(), "words": word_count(r.content)}
            for r in rows
        ],
    }


def gather_restore_scene_revision(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    from outline.models import SceneRevision

    scene_id = args.get("scene_id")
    revision_id = args.get("revision_id")
    if not scene_id or revision_id is None:
        raise CapabilityError("scene_id and revision_id are required", 400)
    try:
        rev = SceneRevision.objects.filter(
            project_id=ctx.project_id, scene__uid=scene_id, id=revision_id,
        ).first()
    except (TypeError, ValueError):
        raise CapabilityError("revision_id must be an integer", 400) from None
    if rev is None:
        raise CapabilityError(f"revision {revision_id!r} not found for this scene", 404)
    return {"scene_id": scene_id, "revision_id": rev.id, "content": rev.content}


def gather_save_scene_content(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    scene_id = args.get("scene_id")
    if not scene_id:
        raise CapabilityError("scene_id is required", 400)
    return {
        "scene_id": scene_id,
        "content": args.get("content"),
        "text": args.get("text"),
        # On-save analysis fan-out. Default ON (chat/cron/internal get analysis
        # automatically). The write page passes False to keep the save instant
        # and self-fires `analyze_scene` in the background instead.
        "auto_analyze": args.get("auto_analyze"),
        # Explicit opt-in to replace non-empty prose with an empty doc.
        "allow_empty": bool(args.get("allow_empty")),
    }


def gather_propose_scene_edits(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Validate a batch of paragraph REWRITES. The AI sees paragraphs by index
    (from `get_scene_paragraphs`) and submits `{index, text}` items. We snapshot
    each target's current text as a content anchor so the commit can re-find it,
    and carry its existing references forward. The commit writes each rewrite into
    the scene marked 'ai-generated' (the editor renders it as a pending block the
    author accepts in place — accepting strips the marker)."""
    from outline.engine import scene_paragraphs as sp

    scene_id = args.get("scene_id")
    if not scene_id:
        raise CapabilityError("scene_id is required", 400)
    edits = args.get("edits")
    if not isinstance(edits, list) or not edits:
        raise CapabilityError("`edits` must be a non-empty list", 400)

    scene = load_scene(ctx, scene_id)
    if scene is None:
        raise CapabilityError(f"scene {scene_id!r} not found", 404)
    paras = sp.scene_paragraphs(scene)  # [{index, text, refs}]

    clean: list[dict[str, Any]] = []
    for raw in edits:
        if not isinstance(raw, dict):
            raise CapabilityError("each edit must be an object", 400)
        mode = str(raw.get("mode") or "edit").strip().lower()
        if mode == "insert":
            raise CapabilityError(
                "use insert_scene_paragraphs to add new paragraphs; "
                "propose_scene_edits only rewrites existing ones",
                400,
            )
        if mode != "edit":
            raise CapabilityError(f"unknown edit mode {mode!r} (edit only)", 400)
        text = str(raw.get("text") or "")
        idx = raw.get("index")
        try:
            idx = int(idx)
        except (TypeError, ValueError):
            raise CapabilityError("each edit needs an integer `index`", 400) from None
        if not text.strip():
            raise CapabilityError(f"edit at index {idx} needs non-empty `text`", 400)
        if idx < 0 or idx >= len(paras):
            raise CapabilityError(
                f"edit index {idx} out of range (scene has {len(paras)} paragraphs)",
                400,
            )
        target = paras[idx]
        clean.append({
            "anchor_text": target["text"], "new_text": text,
            "carry_refs": target["refs"],
        })

    return {"scene_id": scene_id, "edits": clean}


def gather_insert_scene_paragraphs(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Caps refactor Phase 5: insert a CONTIGUOUS block of new paragraphs. `paragraphs`
    is a list of plain-text strings; `position` is the 0-based paragraph index to
    insert before (omit to append). Joined into ONE insert so the commit's
    text_to_nodes splits it into contiguous, in-order paragraph nodes (each still
    marked 'ai-generated' for in-editor accept)."""
    from outline.engine import scene_paragraphs as sp

    scene_id = args.get("scene_id")
    if not scene_id:
        raise CapabilityError("scene_id is required", 400)
    raw = args.get("paragraphs")
    if not isinstance(raw, list) or not raw:
        raise CapabilityError("`paragraphs` must be a non-empty list of plain text", 400)
    texts = [str(p or "").strip() for p in raw]
    texts = [t for t in texts if t]
    if not texts:
        raise CapabilityError("each paragraph needs non-empty text", 400)

    scene = load_scene(ctx, scene_id)
    if scene is None:
        raise CapabilityError(f"scene {scene_id!r} not found", 404)

    position = args.get("position")
    if position is None:
        index = len(sp.scene_paragraphs(scene))  # append
    else:
        try:
            index = int(position)
        except (TypeError, ValueError):
            raise CapabilityError("`position` must be an integer", 400) from None
    return {"scene_id": scene_id,
            "inserts": [{"index": index, "text": "\n\n".join(texts)}]}


def gather_place_thread_beat(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    # Caps refactor Phase 3: arg is `beat_id` (was `item_id`); internal key stays
    # item_id so the execute/commit chain is untouched.
    thread_id = args.get("thread_id")
    item_id = args.get("beat_id") or args.get("item_id")
    scene_id = args.get("scene_id")
    if not thread_id or not item_id or not scene_id:
        raise CapabilityError("thread_id, beat_id, and scene_id are required", 400)
    return {
        "thread_id": thread_id,
        "item_id": item_id,
        "scene_id": scene_id,
        "beat_index": int(args.get("beat_index", -1)),
    }


# ---- plot threads --------------------------------------------------------- #

def gather_add_plot_thread(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    # Caps refactor Phase 3: arg is `title` (was `name`); commit key stays `name`.
    name = (args.get("title") or args.get("name") or "").strip()
    if not name:
        raise CapabilityError("plot-thread title is required", 400)
    return {
        "name": name,
        "description": args.get("description"),
        "scope_type": args.get("scope_type"),
        "scope_name": args.get("scope_name"),
        "color": args.get("color"),
        "beats": args.get("beats"),
    }


def gather_update_plot_thread(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    thread_id = args.get("thread_id")
    if not thread_id:
        raise CapabilityError("thread_id is required", 400)
    return {
        "thread_id": thread_id,
        "name": args.get("name"),
        "description": args.get("description"),
        "scope_type": args.get("scope_type"),
        "scope_name": args.get("scope_name"),
        "color": args.get("color"),
    }


def gather_delete_plot_thread(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    thread_id = args.get("thread_id")
    if not thread_id:
        raise CapabilityError("thread_id is required", 400)
    return {"thread_id": thread_id}


# The AUTHOR's direct beat add/edit address beats by id (what the editor holds);
# the AI's PROPOSE variants address by index (it reads get_thread). Keep them apart.
def gather_add_thread_beat(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Author add — one beat after `after_beat_id` (or appended)."""
    thread_id = args.get("thread_id")
    if not thread_id:
        raise CapabilityError("thread_id is required", 400)
    text = (args.get("text") or "").strip()
    if not text:
        raise CapabilityError("`text` is required", 400)
    return {
        "thread_id": thread_id,
        "text": text,
        "after_beat_id": args.get("after_beat_id") or None,
        "kind": args.get("kind"),
    }


def gather_update_thread_beat(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Author edit — patch one beat by id (text and/or kind)."""
    thread_id = args.get("thread_id")
    beat_id = args.get("beat_id")
    if not thread_id or not beat_id:
        raise CapabilityError("thread_id and beat_id are required", 400)
    if args.get("text") is None and args.get("kind") is None:
        raise CapabilityError("pass `text` and/or `kind`", 400)
    out: dict[str, Any] = {"thread_id": thread_id, "beat_id": beat_id}
    if args.get("text") is not None:
        out["text"] = args.get("text")
    if args.get("kind") is not None:
        out["kind"] = args.get("kind")
    return out


def gather_propose_insert_beat(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Caps refactor Phase 3: insert ONE beat, placed after `after_beat_id` (or
    appended). Resolve that to a 0-based index against the thread's ordered beats
    for the beat_insert proposal preview (which the accept flow inserts at)."""
    thread_id = args.get("thread_id")
    if not thread_id:
        raise CapabilityError("thread_id is required", 400)
    text = (args.get("text") or "").strip()
    if not text:
        raise CapabilityError("`text` is required", 400)
    from outline.store import load_threads
    threads = load_threads(ctx)
    t = next((x for x in threads if isinstance(x, dict) and x.get("id") == thread_id), None)
    beats = (t or {}).get("items") or []
    after_beat_id = args.get("after_beat_id")
    if after_beat_id:
        pos = next((i for i, b in enumerate(beats)
                    if isinstance(b, dict) and b.get("id") == after_beat_id), None)
        if pos is None:
            raise CapabilityError(f"after_beat_id {after_beat_id!r} not found", 404)
        index = pos + 1
    else:
        index = len(beats)  # append
    return {
        "thread_id": thread_id,
        # For the suggestion card's title ("Adding a beat to <thread>").
        "thread_title": (t or {}).get("title") or "",
        "items": [{"index": index, "text": text, "kind": args.get("kind")}],
    }


def gather_reorder_thread_beats(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Author drag — the thread's beat ids in their new order (every beat, once)."""
    thread_id = args.get("thread_id")
    beat_ids = args.get("beat_ids")
    if not thread_id or not isinstance(beat_ids, list) or not beat_ids:
        raise CapabilityError("thread_id and a non-empty beat_ids list are required", 400)
    ids = [str(b) for b in beat_ids]
    if len(set(ids)) != len(ids):
        raise CapabilityError("beat_ids has the same beat twice", 400)
    return {"thread_id": thread_id, "beat_ids": ids}


def gather_delete_thread_beat(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    thread_id = args.get("thread_id")
    beat_id = args.get("beat_id")
    if not thread_id or not beat_id:
        raise CapabilityError("thread_id and beat_id are required", 400)
    return {"thread_id": thread_id, "beat_id": beat_id}


def gather_propose_update_beat(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Caps refactor Phase 3: edit ONE beat, addressed by beat_id directly (no
    index resolution). Wraps it as a one-element `edits` list so the per-beat
    beat_edit proposal preview is unchanged."""
    thread_id = args.get("thread_id")
    beat_id = args.get("beat_id")
    if not thread_id or not beat_id:
        raise CapabilityError("thread_id and beat_id are required", 400)
    fields: dict[str, Any] = {}
    if args.get("text") is not None:
        fields["text"] = (args.get("text") or "").strip()
    if args.get("kind") is not None:
        fields["kind"] = args.get("kind")
    if not fields:
        raise CapabilityError("pass `text` and/or `kind`", 400)
    from outline.store import get_thread
    thread = get_thread(ctx, thread_id)
    return {
        "thread_id": thread_id,
        # For the suggestion card's title ("Editing a beat in <thread>").
        "thread_title": (thread.title if thread else "") or "",
        "edits": [{"beat_id": beat_id, "fields": fields}],
    }


# Ideas / world entries the author attaches to a scene (the "attached" notes in
# the Write margin). Stored on the scene dict as `entity_links`.
SCENE_LINK_TYPES = ("braindump", "worldbuilding")


def gather_scene_entity_link(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Shared by link_scene_entity + unlink_scene_entity."""
    scene_id = str(args.get("scene_id") or "").strip()
    link_type = (args.get("link_type") or "").strip()
    link_id = args.get("link_id")
    if not scene_id:
        raise CapabilityError("scene_id is required", 400)
    if link_type not in SCENE_LINK_TYPES:
        raise CapabilityError(f"link_type must be one of {', '.join(SCENE_LINK_TYPES)}", 400)
    try:
        link_id = int(link_id)
    except (TypeError, ValueError):
        raise CapabilityError("link_id must be an integer", 400) from None
    return {"scene_id": scene_id, "link_type": link_type, "link_id": link_id}


def gather_add_scene(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    chapter_id = (args.get("chapter_id") or "").strip()
    if not chapter_id:
        raise CapabilityError("chapter_id is required", 400)
    position = args.get("position")
    return {
        "chapter_id": chapter_id,
        "title": (args.get("title") or "").strip(),
        "position": int(position) if isinstance(position, int) else None,
    }


def gather_add_scene_with_beats(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Create a scene from a dropped list of beats. `beats` is a list of strings
    or {text, kind?} dicts; blanks are dropped. The scene is appended to the
    chapter and (unless `title` is passed) the execute layer titles it from the
    beats."""
    chapter_id = (args.get("chapter_id") or "").strip()
    if not chapter_id:
        raise CapabilityError("chapter_id is required", 400)
    raw = args.get("beats")
    if not isinstance(raw, list) or not raw:
        raise CapabilityError("`beats` must be a non-empty list", 400)
    beats: list[dict[str, Any]] = []
    for entry in raw:
        from_item = from_rough = None
        if isinstance(entry, str):
            text, kind = entry.strip(), "text"
        elif isinstance(entry, dict):
            text, kind = (entry.get("text") or "").strip(), entry.get("kind") or "text"
            # optional source linkage (merge-page drop) so the new beat keeps its
            # thread number/colour, same as place_thread_beat.
            from_item = (entry.get("from_item") or "").strip() or None
            from_rough = (entry.get("from_rough") or "").strip() or None
        else:
            raise CapabilityError("each beat must be a string or {text, kind?} dict", 400)
        if text:
            b: dict[str, Any] = {"text": text, "kind": kind}
            if from_item:
                b["from_item"] = from_item
            if from_rough:
                b["from_rough"] = from_rough
            beats.append(b)
    if not beats:
        raise CapabilityError("at least one non-empty beat is required", 400)
    return {
        "chapter_id": chapter_id,
        "beats": beats,
        "title": (args.get("title") or "").strip(),
    }


def gather_set_chapter_pov(ctx, args):
    from actions.capabilities.spec import CapabilityError
    from projects.meta_fields import canonicalize_pov_mode
    chapter_id = (args.get("chapter_id") or "").strip()
    if not chapter_id:
        raise CapabilityError("chapter_id is required", 400)
    return {
        "chapter_id": chapter_id,
        "mode": canonicalize_pov_mode(args.get("mode")),
        **_pov_character(ctx, args),
    }


def gather_set_project_pov_default(ctx, args):
    from projects.meta_fields import canonicalize_pov_mode
    return {
        "mode": canonicalize_pov_mode(args.get("mode")),
        **_pov_character(ctx, args),
    }


def _pov_character(ctx, args) -> dict:
    """The POV character as sent (a name) plus its id when it matches one of
    this project's characters, so a later rename follows (see load_outline)."""
    from outline.store import find_character_id
    name = (args.get("character") or "").strip()
    return {"character": name, "character_id": find_character_id(ctx.project_id, name)}
