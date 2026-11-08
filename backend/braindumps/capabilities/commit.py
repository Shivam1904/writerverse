"""Commit layer — braindumps page (init-elements accept)."""
from __future__ import annotations

from typing import Any

from actions.capabilities.spec import Actor, CapabilityError, DispatchContext
from characters.models import Character
from characters.readers import create_character
from projects.models import Project
from worldbuilding import readers as wb
from worldbuilding.block_readers import block_key, block_row_by_title
from worldbuilding.models import StoryItem, StoryRule

from braindumps import readers


def _apply_story(ctx: DispatchContext, story: dict) -> None:
    """The AI's story title/summary never overwrite the author's own words
    (decided 2026-10-02): each fills `title` / `synopsis` only when that field
    is empty; a DIFFERENT existing value gets a `meta_edit` proposal instead
    (the World page's per-field accept/reject). Same value → nothing to do."""
    p = Project.objects.filter(pk=ctx.project_id).values("title", "synopsis").first()
    if p is None:
        return
    fill, propose = {}, {}
    for field, value in (("title", story.get("title")), ("synopsis", story.get("summary"))):
        value = (value or "").strip()
        current = (p[field] or "").strip()
        if not value or value == current:
            continue
        (propose if current else fill)[field] = value
    if fill:
        Project.objects.filter(pk=ctx.project_id).update(**fill)
    if propose:
        from actions.capabilities.dispatch import _create_proposal_row
        _create_proposal_row(
            "update_project_meta", dict(propose),
            {"type": "meta_edit", "project_id": ctx.project_id, "fields": propose}, ctx,
        )


def commit_init_elements(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Apply ONE accepted element (story / one character / one item / one rule).

    Reached via the accept path (`_accept_init_elements`, gather_from_proposal),
    so `result` is `{proposal, preview, args}`. Each Proposal row carries a single
    entity in its preview (see `_preview_init_elements`). Story fills the
    Project's title/synopsis when empty, else proposes the change (see
    _apply_story); an item/rule becomes one StoryItem/StoryRule row
    (skipped if one with the same name/text exists, so a re-run never
    duplicates); a character only get_or_creates the Character row — character
    detail no longer lives in discovery, the Character table is its single home."""
    preview = result.get("preview") or result
    etype = preview.get("type")

    if etype == "story":
        story = preview.get("story") or {}
        _apply_story(ctx, story)
        # The accepted story is the spine of the book — queue a follow-up proposal
        # that drafts a plot thread from its summary. Only DECLARED here; dispatch
        # runs it after this accept's session lock releases (see run_followups),
        # so the thread-generation LLM call never holds the lock.
        desc = (story.get("summary") or story.get("title") or "").strip()
        if desc:
            result.setdefault("_followups", []).append({
                "capability": "generate_thread_from_description",
                "args": {"description": desc},
            })
    elif etype == "character":
        c = preview.get("character") or {}
        name = (c.get("name") or "").strip()
        if name:
            Character.objects.get_or_create(
                project_id=ctx.project_id, name=name,
                defaults={
                    "type": (c.get("role") or "").strip(),
                    "description": (c.get("description") or "").strip(),
                },
            )
    elif etype == "item":
        it = preview.get("item") or {}
        name = (it.get("name") or "").strip()
        if name and not StoryItem.objects.filter(
            project_id=ctx.project_id, name__iexact=name,
        ).exists():
            StoryItem.objects.create(
                project_id=ctx.project_id, name=name,
                description=(it.get("description") or "").strip(),
            )
    elif etype == "rule":
        r = preview.get("rule") or {}
        text = (r.get("text") or "").strip()
        if text and not StoryRule.objects.filter(
            project_id=ctx.project_id, text__iexact=text,
        ).exists():
            StoryRule.objects.create(
                project_id=ctx.project_id, text=text,
                scope=(r.get("scope") or "").strip(),
            )


def commit_promote_to_character(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Promote a candidate → a real Character NOW (direct WRITE), then queue the AI
    enrichment as a follow-up proposal.

    Two tiers, split per D24: the **create** is the author's intent (instant — the
    character appears on the cast page right away); the description + arcs are
    *drafted* by `enrich_promoted_character`, which lands as an editable proposal on
    the new character's card. Create-or-get by name keeps it idempotent (no dupes if
    the candidate happens to already be real). The follow-up runs AFTER this write's
    lock releases (see run_followups), so its LLM call never holds the lock."""
    name = (result.get("name") or "").strip()
    if not name:
        raise CapabilityError("name is required", 400)
    cid = (
        Character.objects.filter(project_id=ctx.project_id, name=name)
        .values_list("id", flat=True)
        .first()
    )
    if cid is None:
        cid = create_character(ctx.project_id, name=name)["id"]
    result["character_id"] = cid
    result.setdefault("_followups", []).append({
        "capability": "enrich_promoted_character",
        "args": {"character_id": cid, "name": name},
    })


def _alias_name(entry: Any) -> str:
    """An alias entry is `{name}` / `{name, character_id}` (the Character.aliases
    schema) or, defensively, a bare string. Pull the display name out of either."""
    return (entry if isinstance(entry, str) else (entry or {}).get("name") or "").strip()


def commit_alias_character(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Fold a braindump candidate name into a REAL character as an alias (direct WRITE).

    The braindumps idea tree lets the author drag a candidate character branch
    (e.g. "Iron Man") onto a real character ("Tony"): the candidate's name is
    pushed onto Tony's `aliases`, and the tree then renders "alias of Tony" in
    place of the candidate's Draft button (a render-time resolve — no braindump
    phrase data moves). Cheap and reversible (see `commit_unalias_character`), so
    it applies directly per the two-tier edit rule. Idempotent: re-aliasing an
    existing alias is a no-op. If the alias name happens to match another real
    character row, the entry carries that `character_id` (the cross-ref shape the
    model documents); we never delete that row — real→real merge is out of scope."""
    primary = (result.get("primary_name") or "").strip()
    alias = (result.get("alias_name") or "").strip()
    if not primary or not alias:
        raise CapabilityError("primary_name and alias_name are required", 400)
    char = Character.objects.filter(project_id=ctx.project_id, name=primary).first()
    if char is None:
        raise CapabilityError("primary character not found", 404)
    result["character_id"] = char.id

    aliases = list(char.aliases or [])
    if alias.lower() in {_alias_name(a).lower() for a in aliases}:
        return  # already an alias — idempotent no-op
    ref_id = (
        Character.objects.filter(project_id=ctx.project_id, name=alias)
        .exclude(id=char.id)
        .values_list("id", flat=True)
        .first()
    )
    entry = {"name": alias} if ref_id is None else {"name": alias, "character_id": ref_id}
    char.aliases = [*aliases, entry]
    char.save(update_fields=["aliases", "updated_at"])


def commit_unalias_character(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Inverse of `commit_alias_character`: pull an alias name off a real character
    (the idea tree's "un-fold" ✕). Removing it makes the candidate branch show its
    Draft button again. No-op if the name isn't actually an alias."""
    primary = (result.get("primary_name") or "").strip()
    alias = (result.get("alias_name") or "").strip()
    if not primary or not alias:
        raise CapabilityError("primary_name and alias_name are required", 400)
    char = Character.objects.filter(project_id=ctx.project_id, name=primary).first()
    if char is None:
        raise CapabilityError("primary character not found", 404)
    result["character_id"] = char.id

    target = alias.lower()
    kept = [a for a in (char.aliases or []) if _alias_name(a).lower() != target]
    if len(kept) != len(char.aliases or []):
        char.aliases = kept
        char.save(update_fields=["aliases", "updated_at"])


def commit_enrich_character(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Accept-ALL path (via `_accept_enrich_character` / accept_proposal): apply every
    remaining proposed field onto the existing Character row, by id.

    Reached via gather_from_proposal, so `result` is `{proposal, preview, args}`; the
    preview is the character-EDIT payload `{type:'character_edit', character_id,
    fields:{<column>: <value>}}` (see `_preview_enrich_character`). `fields` is already
    Character-column-keyed and only holds what's still pending (per-field accepts/
    rejects shrink it). The reviewed values WIN — applied as-is."""
    preview = result.get("preview") or result
    if preview.get("type") != "character_edit":
        raise CapabilityError("Unrecognised character proposal type; nothing was applied.", 409)
    cid = preview.get("character_id")
    fields = preview.get("fields") or {}
    if not cid or not fields:
        raise CapabilityError("This character proposal has nothing left to apply.", 409)

    char = Character.objects.filter(project_id=ctx.project_id, id=cid).first()
    if char is None:
        raise CapabilityError("That character no longer exists, so the change could not be applied.", 409)
    from characters import fields as cf
    cf.apply_fields(char, fields, allowed=cf.AI_EDITABLE)


def commit_promote_to_world_entity(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Promote a candidate world entity → a real Worldbuilding row NOW (direct
    WRITE), then queue the AI description draft as a follow-up proposal.

    Two tiers, split per D24 (mirrors commit_promote_to_character): the **create** is
    the author's intent (the entry appears in its section right away, empty); the
    description is *drafted* by `draft_world_entity`, which lands as an editable
    proposal. Create-or-get by (name, block) keeps it idempotent. The follow-up runs
    AFTER this write's lock releases (see run_followups), so its LLM call never holds
    the lock."""
    name = (result.get("name") or "").strip()
    block = (result.get("block") or "").strip()
    if not name:
        raise CapabilityError("name is required", 400)
    if not block:
        raise CapabilityError("block is required", 400)

    key = block_key(block)
    existing = block_row_by_title(ctx.project_id, key, name)
    if existing is not None:
        wid = existing["id"]
    else:
        wid = wb.create_worldbuilding(ctx.project_id, title=name, content="", tags=[block])["id"]
    result["worldbuilding_id"] = wid
    result["_invalidates"] = ["worldbuilding"]
    result.setdefault("_followups", []).append({
        "capability": "draft_world_entity",
        "args": {
            "worldbuilding_id": wid, "name": name, "block": block,
            "kind": (result.get("kind") or "").strip(),
        },
    })


def commit_draft_world_entity(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Accept the AI draft: write the drafted description onto the world entity row
    by id. Reached via gather_from_proposal, so `result` is `{proposal, preview,
    args}`; the preview is `{type:'world_entity_edit', worldbuilding_id, content}`."""
    preview = result.get("preview") or result
    if preview.get("type") != "world_entity_edit":
        raise CapabilityError("Unrecognised world proposal type; nothing was applied.", 409)
    wid = preview.get("worldbuilding_id")
    content = (preview.get("content") or "").strip()
    if not wid or not content:
        raise CapabilityError("This world draft has nothing to apply.", 409)
    wb.patch_worldbuilding(ctx.project_id, wid, {"content": content})
    result["_invalidates"] = ["worldbuilding"]
    # The World page keys description drafts by worldbuilding_id (latest pending
    # wins) — accepting this one must reject any other pending draft for the SAME
    # entity, or the stale older draft resurfaces on the next read.
    from actions.capabilities.commit._proposals import supersede_accepted_siblings
    cur = result.get("proposal")
    supersede_accepted_siblings(
        ctx, keep_id=getattr(cur, "pk", None),
        match=lambda pv: (pv.get("type") == "world_entity_edit"
                          and pv.get("worldbuilding_id") == wid),
    )


def commit_update_proposed_world_entity(ctx: DispatchContext, result: dict[str, Any]) -> None:
    """Save an EDITED proposed description back INTO the draft proposal (still
    pending) — the blur-save while the author reviews it. The row is NOT touched;
    the content only reaches it on accept. Mirrors commit_update_proposed_meta_field."""
    from actions.models import Proposal
    pid = result.get("proposal_id")
    proposal = Proposal.objects.filter(project_id=ctx.project_id, id=pid).first()
    if proposal is None:
        raise CapabilityError("proposal not found", 404)
    payload = dict(proposal.proposal or {})
    preview = dict(payload.get("preview") or {})
    if preview.get("type") != "world_entity_edit":
        return
    preview["content"] = (result.get("value") or "").strip()
    payload["preview"] = preview
    proposal.proposal = payload
    proposal.save(update_fields=["proposal", "updated_at"])


# ---- braindump CRUD (moved from actions/capabilities/commit/crud.py) --- #

def commit_add_braindump(ctx: DispatchContext, result: dict[str, Any]) -> None:
    row = readers.create_braindump(
        ctx.project_id,
        body=result["body"],
        subtext=result.get("subtext"),
        tags=result.get("tags"),
        pinned=result.get("pinned", False),
        ai_generated=result.get("ai_generated", False),
    )
    result["braindump"] = _strip_ai_data_for_chat(ctx, row)
    # Queue AI annotation as a follow-up so EVERY source (chat / button / cron)
    # gets tagged — run_followups dispatches it after this write's lock releases,
    # so the LLM call never holds the lock. Only an EXPLICIT False skips it (the
    # page opts out + self-fires). NB `is not False`, not truthiness: the chat
    # tool's pydantic schema passes auto_annotate=None when the LLM omits it, and
    # `if None` would wrongly disable annotation for every Night Eyes add.
    if result.get("auto_annotate") is not False and row.get("id"):
        result.setdefault("_followups", []).append({
            "capability": "annotate_braindump",
            "args": {"id": row["id"]},
        })


def commit_update_braindump(ctx: DispatchContext, result: dict[str, Any]) -> None:
    row = readers.patch_braindump(ctx.project_id, result["braindump_id"], result["fields"])
    result["braindump"] = _strip_ai_data_for_chat(ctx, row)


def commit_annotate_braindump(ctx: DispatchContext, result: dict[str, Any]) -> None:
    row = readers.annotate_braindump(
        ctx.project_id, result["braindump_id"],
        ai_data=result["ai_data"], tags=result.get("tags"),
    )
    result["braindump"] = row


def commit_delete_braindump(ctx: DispatchContext, result: dict[str, Any]) -> None:
    deleted = readers.delete_braindump(ctx.project_id, result["braindump_id"])
    result.update(deleted)


def commit_undelete_braindump(ctx: DispatchContext, result: dict[str, Any]) -> None:
    result["braindump"] = readers.undelete_braindump(ctx.project_id, result["braindump_id"])


def _strip_ai_data_for_chat(ctx: DispatchContext, row: dict[str, Any]) -> dict[str, Any]:
    """Drop the internal `ai_data` annotation blob from a braindump row before it
    rides back to the chat model. Night Eyes pastes raw tool JSON into replies, so
    it must never receive the phrase/pack breakdown. Non-chat actors (the page
    facade) keep the full payload for their tag UI. Mirrors get_braindumps."""
    if isinstance(row, dict) and getattr(ctx, "actor", None) == Actor.CHAT:
        row = {k: v for k, v in row.items() if k != "ai_data"}
    return row
