"""Capability registrations — outline / threads page (new-style)."""
from __future__ import annotations

from typing import Any

from actions.capabilities.commit._proposals import guarded_accept
from actions.capabilities.gather._common import gather_from_proposal
from actions.capabilities.registry import register
from actions.capabilities.spec import Actor, Capability, DispatchContext, Route
from actions.capabilities.stamps import additive

from outline import readers
from outline.capabilities.commit.outline import (
    commit_accept_outline_beat,
    commit_update_proposed_outline_beat,
)
from outline.capabilities.execute.outline import execute_merge
from outline.capabilities.gather.outline import gather_merge


def _preview_merge(result: dict) -> list[dict]:
    """Fan the AI merge out into ONE proposal per placed beat — each reviewed
    (accept / reject / edit) on its own, exactly like thread-beat inserts
    (`_preview_propose_insert_beat`). Each proposal stores the FULL beat dict the
    read splices straight into its scene: `{type:'outline_beat_insert', scene_id,
    index, fields:{text, kind, from_rough, from_item}}`. `from_rough` is the source
    thread (its colour) and `from_item` the source thread-beat (its number), so the
    placed beat keeps its lineage — same as place_thread_beat."""
    rough_id = result.get("rough_id")
    out: list[dict] = []
    for p in result.get("placements") or []:
        if not isinstance(p, dict):
            continue
        text = (p.get("beat_text") or "").strip()
        if not text:
            continue
        kind = p.get("kind") if p.get("kind") in ("text", "placeholder", "heading") else "text"
        out.append({
            "args": {"rough_id": rough_id},
            "preview": {
                "type": "outline_beat_insert",
                "scene_id": p.get("scene_id"),
                "index": p.get("index", -1),  # placements append (no per-scene index)
                "fields": {
                    "text": text,
                    "kind": kind,
                    "from_rough": rough_id,
                    "from_item": p.get("item_id"),
                },
            },
        })
    return out


# 1. run_merge_rough_into_grand — PROPOSE, with AI. The preview FANS OUT into one
#    `outline_beat_insert` proposal per placed beat; each is accepted on its own.
register(Capability(
    name="run_merge_rough_into_grand",
    label="Placed a thread's beats in the outline",
    uses_ai=True,
    description=(
        "AI-place a plot thread's beats into the outline. Drafts where each of "
        "the thread's beats goes and proposes them for the author to accept "
        "beat-by-beat. Source thread_id from get_plot_threads."
    ),
    route=Route.PROPOSE,
    args={"thread_id": "string"},
    gather=gather_merge,
    execute=execute_merge,
    accept="accept_outline_beat",
    stamp=additive,  # inserts a new beat; overwrites nothing
    preview=_preview_merge,
    pages=("Threads",),
    actors=(Actor.USER_BUTTON, Actor.CHAT),
    chat_exposure="toolbox",
    tool_name="quick_place_beats_in_outline",
))


# 1b. search_prose — READ. Keyword search over every scene's written prose so the
#     chat can recall what earlier scenes ESTABLISHED and check the current scene
#     against it (cross-scene consistency), instead of only seeing the current
#     chapter's prose and hedging.
register(Capability(
    name="search_prose",
    description=(
        "Search the written scene prose across the whole manuscript for words or "
        "a name — recall what earlier scenes ESTABLISHED (a trait, a rule, an "
        "event) so you can check the current scene against it. Call this for any "
        "'does this contradict…' / 'is this consistent with…' request before "
        "answering — pass the character/entity plus the trait as the query (e.g. "
        "'Mira deep water afraid'). Returns the best-matching paragraphs with "
        "their scene + chapter."
    ),
    route=Route.READ,
    args={"query": "string", "top_k": "int?"},
    gather=lambda ctx, args: readers.search_prose(ctx, **args),
    pages=("Chapters", "Write", "Outline"),
    actors=(Actor.USER_BUTTON, Actor.CHAT, Actor.INTERNAL, Actor.CRON),
    chat_exposure="bound",
))


# 2. accept_outline_beat — apply one proposed beat into its scene. Dispatched by
#    the generic accept_proposal (toast / chat) AND the inline outline editor.
register(Capability(
    name="accept_outline_beat",
    description="Accept a proposed outline beat — insert it into its scene as a real beat.",
    route=Route.WRITE,
    args={"proposal_id": "string"},
    gather=gather_from_proposal,
    commit=guarded_accept(commit_accept_outline_beat),
    pages=("Outline", "Threads"),
    actors=(Actor.USER_BUTTON, Actor.INTERNAL),
))


# 3. update_proposed_outline_beat — blur-save an edited proposed beat back into the
#    proposal (still pending until accepted). Mirrors update_proposed_beat.
register(Capability(
    name="update_proposed_outline_beat",
    description="Save an edited proposed outline-beat value (text/kind) back into the proposal (still pending).",
    route=Route.WRITE,
    args={"proposal_id": "string", "text": "string?", "kind": "string?"},
    commit=commit_update_proposed_outline_beat,
    pages=("Outline", "Threads"),
    actors=(Actor.USER_BUTTON, Actor.INTERNAL),
))


# ---- outline / thread readers (moved from actions register/meta.py) ---- #

# Not offered to chat: the AI uses get_outline (skeleton) + get_chapter (one
# chapter's beats) instead of whole-book dumps (series-scale rule).
_NO_CHAT = (Actor.USER_BUTTON, Actor.INTERNAL, Actor.CRON)


def _reader(fetch):
    def _gather(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
        return fetch(ctx, **args)
    return _gather


def _gather_get_thread(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    """Caps refactor Phase 4: chat reads the thread's `title` (matching the `title`
    it writes via add_plot_thread); the shared reader exposes it as `name` for the
    frontend. Rename for chat only, actor-gated."""
    res = readers.get_thread(ctx, **args)
    if ctx.actor is Actor.CHAT and "name" in res:
        res["title"] = res.pop("name")
    return res


register(Capability(
    name="get_thread",
    description=("One plot thread by id → its ordered beats `[{index, id, text, kind}]`. "
                 "Edit beats by `index`. Source thread_id from get_plot_threads."),
    route=Route.READ,
    args={"thread_id": "string"},
    gather=_gather_get_thread,
    pages=("Threads",),
))

# The Threads page shows every thread's beats at once: one read for all of them,
# not one get_thread per thread (SA-88). Page-only — chat reads one thread at a
# time via get_thread (series-scale rule).
register(Capability(
    name="get_threads_with_beats",
    description=("Every plot thread with its ordered beats + pending beat proposals "
                 "(the get_thread payload for each). No args."),
    route=Route.READ,
    gather=_reader(readers.get_threads_with_beats),
    pages=("Threads",),
    actors=_NO_CHAT,
))

register(Capability(
    name="get_chapter",
    description=("One chapter by id → its scenes, each with its outline beats "
                 "`[{index, id, text, kind}]`. Source chapter_id from get_outline. "
                 "Use get_chapter_prose for the chapter's prose."),
    route=Route.READ,
    args={"chapter_id": "string"},
    gather=_reader(readers.get_chapter),
    pages=("Outline", "Chapters"),
))

register(Capability(
    name="get_chapter_prose",
    description=("Every scene in a chapter with its ordered paragraphs "
                 "`[{index, text, refs}]`. Source chapter_id from get_outline; "
                 "`refs` is read-only (entities the author already marked)."),
    route=Route.READ,
    args={"chapter_id": "string"},
    gather=_reader(readers.get_chapter_prose),
    pages=("Write", "Chapters"),
))

# The Write and Preview pages' prose read: they load the outline WITHOUT prose
# and ask for one chapter's saved TipTap docs (+ `rev`) when that chapter opens
# (Preview: as the reader scrolls to it). Not for chat
# (chat reads plain paragraphs via get_chapter_prose).
register(Capability(
    name="get_chapter_docs",
    description=("One chapter's scenes with their saved TipTap prose docs and "
                 "rev: `{chapter_id, found, scenes:[{id, content, rev}]}`."),
    route=Route.READ,
    args={"chapter_id": "string"},
    gather=_reader(readers.get_chapter_docs),
    pages=("Write", "Chapters", "Preview"),
    actors=_NO_CHAT,
))
