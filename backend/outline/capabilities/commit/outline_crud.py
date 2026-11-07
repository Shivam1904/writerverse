"""Commit layer — outline tree + plot thread CRUD.

Outline writes change only their own rows (`outline.outline_writes`): a prose
save writes one scene's SceneContent, a beat edit one OutlineBeat, a reorder
the positions of one sibling list. Only `init_grand_outline` (a whole new
outline) still goes through save_outline. Plot-thread writes touch PlotThread /
ThreadBeat rows via outline.store.
"""
from __future__ import annotations

import copy
import logging
from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext
from common.ids import new_id
from common.persistence_audit import audit_write
from common.timeutil import now_iso
from common.tiptap import word_count
from django.db import transaction

from outline import beat_undo
from outline import outline_rows as rows
from outline import outline_writes as ow
from outline.models import PlotThread, Scene, ThreadBeat
from outline.revisions import record_scene_revision
from outline.store import (
    beat_to_dict,
    create_thread,
    get_thread,
    load_pov_default,
    load_thread_heads,
    now_stamp,
    open_beat_slot,
    outline_has_acts,
    pick_thread_color,
    resolve_scope_character,
    save_outline,
    save_pov_default,
    thread_to_dict,
)

logger = logging.getLogger("writerverse.consistency")


def _touch(item: dict) -> dict:
    """Stamp per-item edit timestamps on a beat / scene / thread-beat so gauge
    staleness can tell which TICK changed since a lens last scanned (the verdict
    card colours those bars stale). ``created_at`` is set once; ``updated_at`` on
    every content edit. TODO(hash): timestamps are a shortcut — a content hash
    would also ignore no-op re-saves; swap the compare in build_board when wanted."""
    ts = now_iso()
    item.setdefault("created_at", ts)
    item["updated_at"] = ts
    return item


# ---- swappable storage helpers -------------------------------------------- #

def _write_grand_outline(ctx: DispatchContext, outline: dict) -> None:
    save_outline(ctx, outline)


# ---- thread internals ----------------------------------------------------- #

def _new_beat(text: str, kind: str = "text") -> dict:
    kind = (kind or "text").strip().lower()
    if kind not in {"text", "placeholder", "heading"}:
        raise CapabilityError(
            f"unknown beat kind {kind!r} (allowed: text / placeholder / heading)",
            400,
        )
    return _touch({"id": new_id("ri"), "kind": kind, "text": (text or "").strip()})


# ---- outline commit functions --------------------------------------------- #

def commit_init_grand_outline(ctx: DispatchContext, result: dict[str, Any]) -> None:
    if outline_has_acts(ctx):
        raise CapabilityError(
            "grand outline already has acts — refusing to overwrite", 409,
        )
    from outline.engine import (
        default_grand_outline,
        grand_outline_from_act_names,
    )
    acts = result.get("acts")
    if acts:
        go = grand_outline_from_act_names(acts)
    else:
        go = default_grand_outline(result.get("base_template") or "three_act")
    _write_grand_outline(ctx, go)
    logger.info(
        "outline/init project=%s base=%s acts=%d",
        ctx.project_id, go.get("base_template"), len(go.get("acts") or []),
    )
    result["grand_outline"] = go


_PARENT_TYPE = {"act": "outline", "chapter": "act", "scene": "chapter", "beat": "scene"}
_PREFIX = {"act": "ac", "chapter": "ch", "scene": "sc", "beat": "bt"}
_UNSET = object()


def _parent_or_404(ctx: DispatchContext, item_type: str, parent_id):
    """The row a new `item_type` goes under (None for an act: the outline)."""
    parent_type = _PARENT_TYPE[item_type]
    if parent_type == "outline":
        return None
    parent = ow.get_item(ctx.project_id, parent_type, parent_id)
    if parent is None:
        raise CapabilityError(f"parent {parent_type} {parent_id!r} not found", 404)
    return parent


def _item_or_404(ctx: DispatchContext, item_type: str, item_id):
    row = ow.get_item(ctx.project_id, item_type, item_id)
    if row is None:
        raise CapabilityError(f"{item_type} {item_id!r} not found", 404)
    return row


def commit_add_outline_item(ctx: DispatchContext, result: dict[str, Any]) -> None:
    item_type = result["item_type"]
    if item_type not in _PREFIX:
        raise CapabilityError(f"invalid item_type: {item_type}", 400)
    parent = _parent_or_404(ctx, item_type, result.get("parent_id", ""))

    item_id = result.get("id") or new_id(_PREFIX[item_type])
    text = result.get("text", "")

    if item_type == "act":
        item = {"id": item_id, "text": text or "New act", "chapters": []}
    elif item_type == "chapter":
        item = {"id": item_id, "text": text or None, "scenes": []}
        default = load_pov_default(ctx)
        if isinstance(default, dict) and (default.get("mode") or default.get("character")):
            item["pov"] = _pov(default)
    elif item_type == "scene":
        item = {"id": item_id, "text": text or "", "beats": [], "thread": None, "words": 0}
    else:
        item = {"id": item_id, "text": text or "", "kind": "text"}

    _touch(item)
    at_index = result.get("at_index")
    ow.insert_item(ctx.project_id, item_type, parent, item,
                   index=None if at_index is None else int(at_index))
    logger.info("outline/add project=%s type=%s id=%s", ctx.project_id, item_type, item_id)
    result["item"] = item


def commit_add_scene(ctx: DispatchContext, result: dict[str, Any]) -> None:
    chapter = _parent_or_404(ctx, "scene", result["chapter_id"])
    scene = _touch({"id": new_id("sc"), "text": result.get("title") or "",
             "beats": [], "thread": None, "words": 0})
    ow.insert_item(ctx.project_id, "scene", chapter, scene, index=result.get("position"))
    logger.info("outline/add_scene project=%s chapter=%s scene=%s",
                ctx.project_id, result["chapter_id"], scene["id"])
    result["scene"] = scene


def commit_add_scene_with_beats(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Append a new scene, pre-seeded with the dropped beats, to the chapter.

    Scene beats use the `bt` prefix (matching add_outline_item / place_thread_beat).
    The title is the explicit one if given, else the auto-generated one from
    execute, else empty (an untitled scene, same as a plain add)."""
    chapter = _parent_or_404(ctx, "scene", result["chapter_id"])
    beats = []
    for b in result.get("beats") or []:
        kind = (b.get("kind") or "text").strip().lower()
        if kind not in {"text", "placeholder", "heading"}:
            raise CapabilityError(
                f"unknown beat kind {kind!r} (allowed: text / placeholder / heading)",
                400,
            )
        nb = _touch({"id": new_id("bt"), "kind": kind, "text": (b.get("text") or "").strip()})
        # carry source linkage through so the placed beat keeps its thread
        # number (from_item) + colour (from_rough), like place_thread_beat.
        if b.get("from_item"):
            nb["from_item"] = b["from_item"]
        if b.get("from_rough"):
            nb["from_rough"] = b["from_rough"]
        beats.append(nb)
    title = (result.get("title") or "").strip() or (result.get("_generated_title") or "").strip()
    scene = _touch({"id": new_id("sc"), "text": title, "beats": beats, "thread": None, "words": 0})
    ow.insert_item(ctx.project_id, "scene", chapter, scene)
    logger.info(
        "outline/add_scene_with_beats project=%s chapter=%s scene=%s beats=%d",
        ctx.project_id, result["chapter_id"], scene["id"], len(beats),
    )
    result["scene"] = scene


def commit_update_outline_item(ctx: DispatchContext, result: dict[str, Any]) -> None:
    item_type = result["item_type"]
    row = _item_or_404(ctx, item_type, result["item_id"])
    fields = []
    if result.get("text") is not None:
        fields += ow.set_text(row, result["text"])
    if item_type == "beat":
        if result.get("kind") is not None:
            kind = str(result["kind"]).strip()
            if not kind or len(kind) > 20:  # OutlineBeat.kind is max 20 chars
                raise CapabilityError(f"invalid beat kind {result['kind']!r}", 400)
            row.kind = kind
            ow.drop_extra(row, "kind")
            fields += ["kind", "extra"]
        # `written` — author-toggled "this beat is written into the chapter
        # prose" flag on the beat row.
        if result.get("written") is not None:
            row.written = bool(result["written"])
            ow.drop_extra(row, "written")
            fields += ["written", "extra"]
    fields += ow.touch(row)
    row.save(update_fields=sorted(set(fields)))
    logger.info(
        "outline/update project=%s type=%s id=%s",
        ctx.project_id, item_type, result["item_id"],
    )
    result["item"] = ow.item_dict(ctx.project_id, item_type, row)


def commit_reorder_outline_item(ctx: DispatchContext, result: dict[str, Any]) -> None:
    item_type = result["item_type"]
    row = _item_or_404(ctx, item_type, result["item_id"])
    old_idx, clamped = ow.move_item(ctx.project_id, item_type, row, result["new_index"])
    logger.info(
        "outline/reorder project=%s type=%s id=%s %d->%d",
        ctx.project_id, item_type, result["item_id"], old_idx, clamped,
    )
    result["old_index"] = old_idx
    result["new_index"] = clamped


def commit_delete_outline_item(ctx: DispatchContext, result: dict[str, Any]) -> None:
    item_type = result["item_type"]
    row = _item_or_404(ctx, item_type, result["item_id"])
    if item_type == "beat":
        # Snapshot first, so the 10-second Undo can put it back (beat_undo).
        result["undo_token"] = beat_undo.sign(ctx.project_id, beat_undo.snapshot_outline_beat(row))
    ow.delete_item(ctx.project_id, item_type, row)
    logger.info(
        "outline/delete project=%s type=%s id=%s",
        ctx.project_id, item_type, result["item_id"],
    )
    result["deleted_id"] = result["item_id"]


def _scene_or_404(ctx: DispatchContext, scene_id) -> Scene:
    return _item_or_404(ctx, "scene", scene_id)


def _save_scene_prose(ctx: DispatchContext, scene: Scene, doc, *, title=None,
                      generated_title: str = "", spaced: bool = False,
                      before=_UNSET) -> dict:
    """Write one scene's prose (+ optional title) to its own rows: the old text
    goes to the revision history, the content row's `rev` goes up, the scene's
    word count and the project's word total follow. Returns the scene dict."""
    fields = []
    if title is not None:
        fields += ow.set_text(scene, title)
    if doc is not None:
        if before is _UNSET:
            before = ow.scene_doc(scene)
        record_scene_revision(ctx.project_id, scene.uid, before, doc, spaced=spaced)
        ow.write_scene_prose(scene, doc)
        scene.words = word_count(doc)
        ow.drop_extra(scene, "words")
        scene.mention_counts = rows.mention_counts(doc)
        fields += ["words", "mention_counts", "extra"]
    # Auto-title (generated upstream, unlocked) applied as a direct edit on this
    # same write — only if the scene is still untitled after the save.
    generated = (generated_title or "").strip()
    if generated and not (scene.title or "").strip():
        fields += ow.set_text(scene, generated)
        logger.info("outline/auto_title project=%s scene=%s title=%r",
                    ctx.project_id, scene.uid, generated)
    fields += ow.touch(scene)
    scene.save(update_fields=sorted(set(fields)))
    if doc is not None:
        ow.refresh_totals(ctx.project_id)
    return ow.item_dict(ctx.project_id, "scene", scene)


def commit_save_scene_content(ctx: DispatchContext, result: dict[str, Any]) -> None:
    scene = _scene_or_404(ctx, result["scene_id"])
    before = _UNSET
    if result.get("content") is not None:
        before = ow.scene_doc(scene)
        incoming_words = word_count(result["content"])
        stored_words = scene.words or word_count(before)
        # Never let an empty doc silently replace stored prose (a client that
        # lost its text would zero the scene). Callers that really mean to
        # clear a scene pass allow_empty.
        if incoming_words == 0 and stored_words > 0 and not result.get("allow_empty"):
            raise CapabilityError(
                "refusing to replace existing prose with an empty document "
                "(pass allow_empty to clear the scene)", 409,
            )
    item = _save_scene_prose(
        ctx, scene, result.get("content"), title=result.get("text"),
        generated_title=result.get("_generated_title") or "", spaced=True, before=before,
    )
    # Breadcrumb for "did my prose save?": length + hash only, never the text.
    audit_write(
        f"scene.save scene={result['scene_id']}",
        project_id=ctx.project_id,
        with_preview=False,
        **({"content": result["content"]} if result.get("content") is not None else {}),
    )
    logger.info(
        "outline/save_scene_content project=%s scene=%s words=%d",
        ctx.project_id, result["scene_id"], item.get("words", 0),
    )
    result["scene"] = item
    # Queue on-save analysis pipelines (best-effort follow-ups, run after the
    # lock releases) for EVERY source — unless the caller opts out. The write
    # page passes auto_analyze=False to keep the save instant and self-fires
    # `analyze_scene` in the background. (Mirrors add_braindump's annotate gate.)
    if result.get("auto_analyze") is not False:
        from outline.capabilities.pipelines import queue_scene_pipelines
        followups = queue_scene_pipelines(ctx, result["scene_id"])
        if followups:
            result.setdefault("_followups", []).extend(followups)


def commit_restore_scene_revision(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Put an earlier version of the prose back. The text it replaces is kept as
    a new revision (not spaced), so a restore can itself be undone."""
    scene = _scene_or_404(ctx, result["scene_id"])
    item = _save_scene_prose(ctx, scene, result["content"])
    audit_write(
        f"scene.restore scene={result['scene_id']} revision={result['revision_id']}",
        project_id=ctx.project_id,
        with_preview=False,
        content=result["content"],
    )
    logger.info(
        "outline/restore_scene_revision project=%s scene=%s revision=%s words=%d",
        ctx.project_id, result["scene_id"], result["revision_id"], item["words"],
    )
    result["scene"] = item


def commit_propose_scene_edits(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Apply paragraph REWRITES as pending 'ai-generated' blocks.

    Each rewrite replaces its target paragraph (found by content anchor) with the
    new prose, marked 'ai-generated' so the editor renders it as a green pending
    block. The author's existing references are carried onto the new paragraph,
    and the original text is stashed on the marker. Editor-side, Accept strips
    the 'ai-generated' ref → the carried refs remain and it becomes normal prose;
    Dismiss puts the stashed original back. A rewrite whose anchor no longer matches
    is skipped (the author changed it underneath) — never raises on a partial.
    """
    from outline.engine import scene_paragraphs as sp

    scene_id = result["scene_id"]
    scene = _scene_or_404(ctx, scene_id)

    doc = ow.scene_doc(scene)
    before = copy.deepcopy(doc)  # the edits below mutate doc in place
    if not (isinstance(doc, dict) and isinstance(doc.get("content"), list)):
        doc = {"type": "doc", "content": []}
    blocks = doc["content"]

    applied = 0
    for ed in result["edits"]:
        anchor = ed.get("anchor_text") or ""
        pos = next(
            (i for i, n in enumerate(blocks)
             if isinstance(n, dict) and n.get("type") == "paragraph"
             and sp.node_text(n) == anchor),
            None,
        )
        if pos is None:
            continue  # author already changed this paragraph — skip, don't clobber
        marker = dict(sp.AI_GENERATED_REF)
        marker["original"] = anchor  # let a dismiss restore the pre-edit prose
        refs = list(ed.get("carry_refs") or []) + [marker]
        new_nodes = sp.text_to_nodes(ed["new_text"], refs=refs)
        # A rewrite that splits into extra paragraphs: those are pending too
        # (no original, so a dismiss removes them; the first one restores it).
        for n in new_nodes[1:]:
            n.setdefault("attrs", {})["refs"] = [dict(sp.AI_GENERATED_REF)]
        blocks[pos:pos + 1] = new_nodes
        applied += 1

    item = _save_scene_prose(ctx, scene, doc, before=before)
    logger.info(
        "outline/propose_scene_edits project=%s scene=%s applied=%d/%d words=%d",
        ctx.project_id, scene_id, applied, len(result["edits"]), item.get("words", 0),
    )
    result["scene"] = item
    result["applied"] = applied


def commit_insert_scene_paragraphs(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Write new AI paragraphs into the scene, each marked 'ai-generated'.

    These land in the doc immediately (a direct WRITE, not a rail proposal) — the
    marker IS the pending state. The write-page editor renders each as a green
    block with Accept (strips the marker → normal prose) and Dismiss (removes
    the paragraph). Inserts apply against the snapshot, highest index first so the
    lower positions stay valid.
    """
    from outline.engine import scene_paragraphs as sp

    scene_id = result["scene_id"]
    scene = _scene_or_404(ctx, scene_id)

    doc = ow.scene_doc(scene)
    before = copy.deepcopy(doc)  # the inserts below mutate doc in place
    if not (isinstance(doc, dict) and isinstance(doc.get("content"), list)):
        doc = {"type": "doc", "content": []}
    blocks = doc["content"]

    for ins in sorted(result["inserts"], key=lambda x: x["index"], reverse=True):
        nodes = sp.text_to_nodes(ins["text"])
        for n in nodes:
            n.setdefault("attrs", {})["refs"] = [dict(sp.AI_GENERATED_REF)]
        pos = max(0, min(ins["index"], len(blocks)))
        blocks[pos:pos] = nodes

    item = _save_scene_prose(ctx, scene, doc, before=before)
    logger.info(
        "outline/insert_ai_paragraphs project=%s scene=%s n=%d words=%d",
        ctx.project_id, scene_id, len(result["inserts"]), item.get("words", 0),
    )
    result["scene"] = item


def commit_place_thread_beat(ctx: DispatchContext, result: dict[str, Any]) -> None:
    thread = get_thread(ctx, result["thread_id"])
    if thread is None:
        raise CapabilityError(
            f"thread {result['thread_id']!r} not found in rough_outlines", 404,
        )
    item = thread.beats.filter(uid=result["item_id"]).first()
    if item is None:
        raise CapabilityError(
            f"item {result['item_id']!r} not found in thread {result['thread_id']!r}", 404,
        )
    scene = ow.get_item(ctx.project_id, "scene", result["scene_id"])
    if scene is None:
        raise CapabilityError(
            f"scene {result['scene_id']!r} not found in grand outline", 404,
        )
    beat_text = (item.text or "").strip()
    src_kind = item.kind or ""
    # Keep the source kind (a placed heading stays a heading so it can carry its
    # children as a group); anything unrecognised falls back to text.
    kind = src_kind if src_kind in ("heading", "placeholder") else "text"
    new_beat = _touch({
        "id": new_id("bt"),
        "kind": kind,
        "text": beat_text,
        # Keep parity with run_merge_rough_into_grand: record the source thread
        # (from_rough) and source thread-beat (from_item) so the map's
        # from_rough → dot logic recognises the placement on the next build.
        "from_rough": result["thread_id"],
        "from_item": result["item_id"],
    })
    with transaction.atomic():
        ow.insert_item(ctx.project_id, "beat", scene, new_beat,
                       index=result.get("beat_index", -1))
        # Auto-title (generated upstream, unlocked) applied only while the scene
        # is still untitled — the same direct-edit-on-this-write pattern as
        # save_scene_content.
        generated = (result.get("_generated_title") or "").strip()
        if generated and not (scene.title or "").strip():
            scene.save(update_fields=ow.set_text(scene, generated))
            logger.info(
                "outline/auto_title project=%s scene=%s title=%r",
                ctx.project_id, result["scene_id"], generated,
            )
    logger.info(
        "outline/place_thread_beat project=%s thread=%s item=%s -> scene=%s",
        ctx.project_id, result["thread_id"], result["item_id"], result["scene_id"],
    )
    result["beat"] = new_beat


# ---- plot thread commit functions ----------------------------------------- #
# Each writer touches only its own PlotThread / ThreadBeat rows (outline.store).

def _thread_or_404(ctx: DispatchContext, thread_id: str) -> PlotThread:
    thread = get_thread(ctx, thread_id)
    if thread is None:
        raise CapabilityError(f"thread {thread_id!r} not found", 404)
    return thread


def _create_beat(thread: PlotThread, text: str, kind: str, position: int) -> ThreadBeat:
    beat = _new_beat(text, kind)  # validates kind, mints the id
    stamp = now_stamp()
    return ThreadBeat.objects.create(
        thread=thread, uid=beat["id"], kind=beat["kind"], text=beat["text"],
        position=position, created_at=stamp, updated_at=stamp,
    )


def _edit_beat(beat: ThreadBeat, text=None, kind=None) -> None:
    if text is not None:
        beat.text = str(text).strip()
    if kind is not None:
        beat.kind = _new_beat("placeholder", kind)["kind"]  # validates kind
    beat.updated_at = now_stamp()
    beat.created_at = beat.created_at or beat.updated_at
    beat.save(update_fields=["text", "kind", "updated_at", "created_at"])


def commit_add_plot_thread(ctx: DispatchContext, result: dict[str, Any]) -> None:
    thread: dict = {"id": new_id("ro"), "title": result["name"]}
    explicit = str(result.get("color") or "").strip()
    if explicit:
        thread["color"] = explicit
    else:
        # Auto-assign a distinct colour so no new storyline reuses an existing
        # one's — except the first thread of a character, which mirrors it.
        auto = pick_thread_color(
            ctx, load_thread_heads(ctx),
            scope_type=result.get("scope_type"),
            scope_name=result.get("scope_name"),
        )
        if auto:
            thread["color"] = auto
    if result.get("description"):
        thread["description"] = str(result["description"]).strip()
    # Always save a scope: with neither type nor name (e.g. a chat-created
    # thread) it defaults to the whole story, so the Threads page never gets
    # `scope: null`.
    if result.get("scope_type") or result.get("scope_name"):
        thread["scope"] = {
            "type": (result.get("scope_type") or "").strip(),
            "name": (result.get("scope_name") or "").strip(),
        }
    else:
        thread["scope"] = {"type": "story", "name": ""}
    items: list[dict] = []
    beats = result.get("beats")
    if beats:
        if not isinstance(beats, list):
            raise CapabilityError("`beats` must be a list", 400)
        for entry in beats:
            if isinstance(entry, str):
                items.append(_new_beat(entry))
            elif isinstance(entry, dict):
                items.append(_new_beat(entry.get("text", ""), entry.get("kind", "text")))
            else:
                raise CapabilityError(
                    "each beat must be a string or {text, kind?} dict", 400,
                )
    thread["items"] = items
    # New storylines surface at the TOP of the list (most-recent-first).
    create_thread(ctx, thread, at_top=True)
    logger.info(
        "threads/add project=%s thread=%s beats=%d",
        ctx.project_id, thread["id"], len(items),
    )
    result["thread"] = thread


def commit_update_plot_thread(ctx: DispatchContext, result: dict[str, Any]) -> None:
    thread = _thread_or_404(ctx, result["thread_id"])
    touched = []
    if result.get("name") is not None:
        v = result["name"].strip()
        if not v:
            raise CapabilityError("`name` cannot be blanked out", 400)
        thread.title = v
        touched.append("title")
    if result.get("description") is not None:
        thread.description = result["description"].strip()
        touched.append("description")
    if result.get("scope_type") is not None:
        thread.scope_type = result["scope_type"].strip()
        touched.append("scope_type")
    if result.get("scope_name") is not None:
        thread.scope_name = result["scope_name"].strip()
        touched.append("scope_name")
    if "scope_type" in touched or "scope_name" in touched:
        thread.character_id = resolve_scope_character(
            ctx.project_id, thread.scope_type, thread.scope_name,
        )
        touched.append("character")
    if result.get("color") is not None:
        # Empty string clears the override → thread falls back to its derived
        # default (its character's colour, or the story-thread colour).
        thread.color = str(result["color"]).strip()
        touched.append("color")
    if not touched:
        raise CapabilityError("nothing to update", 400)
    thread.save(update_fields=touched)
    logger.info(
        "threads/update project=%s thread=%s fields=%s",
        ctx.project_id, result["thread_id"], ",".join(touched),
    )
    result["thread"] = thread_to_dict(thread)


# Deleting a thread (or one thread beat) leaves the outline beats placed from
# it in place, text and all: they are the author's writing in the outline
# (decided 2026-10-02). Only their link goes, and the database does that on
# its own: OutlineBeat.thread / .thread_beat are SET_NULL foreign keys. A
# whole thread drops both links (its beats are deleted with it); one thread
# beat drops only `from_item` (the thread still exists for colour).


def commit_delete_plot_thread(ctx: DispatchContext, result: dict[str, Any]) -> None:
    _thread_or_404(ctx, result["thread_id"]).delete()  # its beats go with it
    logger.info("threads/delete project=%s thread=%s", ctx.project_id, result["thread_id"])
    result["deleted"] = result["thread_id"]


def commit_add_thread_beat(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Author add — insert ONE beat after `after_beat_id` (or appended). Returns
    the created beat so the editor can swap its tmp id for the real one."""
    thread = _thread_or_404(ctx, result["thread_id"])
    after = result.get("after_beat_id")
    with transaction.atomic():
        pos = open_beat_slot(thread, after_uid=after)
        beat = _create_beat(thread, result["text"], result.get("kind") or "text", pos)
    logger.info("threads/add_beat project=%s thread=%s after=%s",
                ctx.project_id, result["thread_id"], after)
    result["beat"] = beat_to_dict(beat)


def commit_update_thread_beat(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Author edit — patch ONE beat by id (text and/or kind)."""
    thread = _thread_or_404(ctx, result["thread_id"])
    beat = thread.beats.filter(uid=result["beat_id"]).first()
    if beat is None:
        raise CapabilityError(f"beat {result['beat_id']!r} not found", 404)
    _edit_beat(beat, text=result.get("text"), kind=result.get("kind"))
    logger.info("threads/update_beat project=%s thread=%s beat=%s",
                ctx.project_id, result["thread_id"], result["beat_id"])
    result["beat"] = beat_to_dict(beat)


def commit_reorder_thread_beats(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Author drag — save the thread's beat order. `beat_ids` must name every
    beat of the thread exactly once; if it doesn't (a beat was added or deleted
    elsewhere since the page loaded), nothing is written and the 409 tells the
    page to reload the thread. Only the positions that change are written.
    Returns the saved order."""
    thread = _thread_or_404(ctx, result["thread_id"])
    wanted = result["beat_ids"]
    with transaction.atomic():
        rows = list(thread.beats.select_for_update().only("id", "uid", "position"))
        by_uid = {b.uid: b for b in rows}
        if set(wanted) != set(by_uid) or len(wanted) != len(rows):
            raise CapabilityError(
                "This thread changed since the page loaded. Reload it and try again.", 409,
            )
        changed = []
        for i, uid in enumerate(wanted):
            beat = by_uid[uid]
            if beat.position != i:
                beat.position = i
                changed.append(beat)
        ThreadBeat.objects.bulk_update(changed, ["position"])
    logger.info("threads/reorder_beats project=%s thread=%s moved=%d",
                ctx.project_id, result["thread_id"], len(changed))
    result["beat_ids"] = list(wanted)


def commit_delete_thread_beat(ctx: DispatchContext, result: dict[str, Any]) -> None:
    thread = _thread_or_404(ctx, result["thread_id"])
    beat_id = result["beat_id"]
    beat = thread.beats.filter(uid=beat_id).first()
    if beat is None:
        raise CapabilityError(
            f"beat {beat_id!r} not found in thread {result['thread_id']!r}", 404,
        )
    # Snapshot first (text, place, the outline beats placed from it), so the
    # 10-second Undo can put it back (beat_undo).
    result["undo_token"] = beat_undo.sign(ctx.project_id, beat_undo.snapshot_thread_beat(beat))
    beat.delete()
    logger.info(
        "threads/delete_beat project=%s thread=%s beat=%s",
        ctx.project_id, result["thread_id"], beat_id,
    )
    result["deleted"] = beat_id


# ---- beat proposals (Night Eyes insert/update → accept) ------------------- #

def commit_accept_beat(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Apply an accepted beat proposal. Reached via gather_from_proposal, so
    `result` is `{proposal, preview, args}`; the preview is
    `{type:'beat_edit'|'beat_insert', thread_id, beat_id|index, fields:{text?,kind?}}`.
    Edit-before-accept lives in the proposal (update_proposed_beat), so this just
    reads `preview.fields`. A beat_edit patches the beat by id; a beat_insert
    creates a new beat at its index."""
    preview = result.get("preview") or result
    ptype = preview.get("type")
    thread_id = preview.get("thread_id")
    fields = preview.get("fields") or {}
    thread = get_thread(ctx, thread_id)
    if thread is None:
        raise CapabilityError("That thread no longer exists, so the change could not be applied.", 409)

    if ptype == "beat_edit":
        beat = thread.beats.filter(uid=preview.get("beat_id")).first()
        if beat is None:
            raise CapabilityError("That beat no longer exists, so the change could not be applied.", 409)
        _edit_beat(beat, text=fields.get("text"), kind=fields.get("kind"))
    elif ptype == "beat_insert":
        with transaction.atomic():
            pos = open_beat_slot(thread, index=int(preview.get("index") or 0))
            beat = _create_beat(
                thread, str(fields.get("text") or ""), fields.get("kind") or "text", pos,
            )
        result["beat"] = beat_to_dict(beat)
    else:
        raise CapabilityError(f"Unrecognised beat proposal type {ptype!r}; nothing was applied.", 409)

    if ptype == "beat_edit":
        # get_thread shows only the latest pending edit per beat_id — accepting
        # this one must reject any other pending edit for the SAME beat, or the
        # stale older edit resurfaces on the next read. (Inserts are additive — a
        # new ghost beat each — so they're not superseded.)
        from actions.capabilities.commit._proposals import (
            supersede_accepted_siblings,
        )
        beat_id = preview.get("beat_id")
        cur = result.get("proposal")
        supersede_accepted_siblings(
            ctx, keep_id=getattr(cur, "pk", None),
            match=lambda pv: (pv.get("type") == "beat_edit"
                              and pv.get("thread_id") == thread_id
                              and pv.get("beat_id") == beat_id),
        )
    result["thread_id"] = thread_id


def commit_update_proposed_beat(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Save an edited proposed beat value back INTO the proposal (still pending) —
    the blur-save while reviewing. The thread is NOT touched; the value only
    reaches the beat on accept."""
    from actions.models import Proposal
    proposal = Proposal.objects.filter(
        project_id=ctx.project_id, id=result.get("proposal_id")).first()
    if proposal is None:
        raise CapabilityError("proposal not found", 404)
    payload = dict(proposal.proposal or {})
    preview = dict(payload.get("preview") or {})
    if preview.get("type") not in ("beat_edit", "beat_insert"):
        return
    fields = dict(preview.get("fields") or {})
    if result.get("text") is not None:
        fields["text"] = str(result["text"]).strip()
    if result.get("kind") is not None:
        fields["kind"] = result["kind"]
    preview["fields"] = fields
    payload["preview"] = preview
    proposal.proposal = payload
    proposal.save(update_fields=["proposal", "updated_at"])


# ---- POV commit functions ------------------------------------------------- #

def _same_link(link: dict, result: dict[str, Any]) -> bool:
    return (link.get("link_type") == result["link_type"]
            and link.get("link_id") == result["link_id"])


def commit_link_scene_entity(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Attach an idea / world entry to a scene. Only `entity_links` changes;
    the scene's prose is never read or written here."""
    scene = _scene_or_404(ctx, result["scene_id"])
    links = [x for x in scene.entity_links or [] if isinstance(x, dict)]
    if not any(_same_link(x, result) for x in links):
        links.append({"link_type": result["link_type"], "link_id": result["link_id"]})
        scene.entity_links = links
        scene.save(update_fields=["entity_links"])
    logger.info("outline/link_scene_entity project=%s scene=%s %s=%s",
                ctx.project_id, result["scene_id"], result["link_type"], result["link_id"])
    result["entity_links"] = links


def commit_unlink_scene_entity(ctx: DispatchContext, result: dict[str, Any]) -> None:
    scene = _scene_or_404(ctx, result["scene_id"])
    links = [x for x in scene.entity_links or [] if isinstance(x, dict)]
    kept = [x for x in links if not _same_link(x, result)]
    if len(kept) != len(links):
        scene.entity_links = kept
        scene.save(update_fields=["entity_links"])
    logger.info("outline/unlink_scene_entity project=%s scene=%s %s=%s",
                ctx.project_id, result["scene_id"], result["link_type"], result["link_id"])
    result["entity_links"] = kept


def _pov(src: dict) -> dict:
    """A stored POV: mode + character name (+ character_id when linked)."""
    pov = {"mode": src.get("mode") or "", "character": src.get("character") or ""}
    if src.get("character_id"):
        pov["character_id"] = src["character_id"]
    return pov


def commit_set_chapter_pov(ctx: DispatchContext, result: dict[str, Any]) -> None:
    chapter = ow.get_item(ctx.project_id, "chapter", result["chapter_id"])
    if chapter is None:
        raise CapabilityError(f"chapter {result['chapter_id']!r} not found", 404)
    pov = _pov(result)
    ow.set_chapter_pov(ctx.project_id, chapter, pov)
    logger.info("outline/set_chapter_pov project=%s chapter=%s mode=%s",
                ctx.project_id, result["chapter_id"], result["mode"])
    result["pov"] = pov
    result["_invalidates"] = list({*(result.get("_invalidates") or []), "outline"})


def commit_set_project_pov_default(ctx: DispatchContext, result: dict[str, Any]) -> None:
    pov = _pov(result)
    save_pov_default(ctx, pov)
    logger.info("outline/set_project_pov_default project=%s mode=%s",
                ctx.project_id, result["mode"])
    result["pov_default"] = pov
