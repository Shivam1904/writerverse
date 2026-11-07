"""Stale-accept guard for proposals (SA-209).

A proposal is the AI saying "change X to Y". Between the AI making it and the
author clicking Accept, the author may have rewritten X by hand. Accepting must
not silently throw that newer text away.

How it works, in three steps:

1. **Stamp.** When a proposal row is created, the proposing capability's `stamp`
   function reads the CURRENT value of every field the proposal would overwrite.
   Those values are saved on `Proposal.base` ({field_key: value}).
2. **Compare.** On accept, the same `stamp` function runs again. If a field's
   live value no longer matches its stamp (and isn't already the AI's value),
   that field is a conflict.
3. **Refuse.** Any conflict → the accept raises `ProposalConflict` (HTTP 409,
   code `proposal_stale`) with `{field, was, current, proposed}` per field, and
   nothing is written. The card shows the author's text next to the AI's. Accept
   again with `force=true` ("Use AI's") to apply anyway; reject ("Keep mine") to
   dismiss.

Each stamp function returns `{field_key: {"current": v, "proposed": p}}`. Keys
for dict columns are dotted (`appearance.eyes`), matching the per-field accept
keys. A target that no longer exists returns `{}` — the accept commit itself
reports "no longer exists". Additive kinds (inserts / creates) overwrite
nothing, so they use `additive` and can never conflict.

Proposals made before this existed have `base = None` and are not checked.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

logger = logging.getLogger(__name__)

STALE_CODE = "proposal_stale"


class ProposalConflict(CapabilityError):
    """The target changed after the proposal was made. Nothing was applied."""

    def __init__(self, conflicts: list[dict[str, Any]]):
        super().__init__(
            "You changed this after the AI suggested it.",
            409,
            code=STALE_CODE,
            data={"conflicts": conflicts},
        )
        self.conflicts = conflicts


# ---- stamp functions, one per proposal kind --------------------------------


def additive(ctx: DispatchContext, preview: dict, args: dict) -> dict:
    """Inserts and creates add something new; they overwrite nothing."""
    return {}


def _pair(current: Any, proposed: Any, shown: str | None = None) -> dict[str, Any]:
    """`shown` replaces `current` in the conflict the author sees, when the
    compared value is a fingerprint rather than readable text."""
    out = {"current": current, "proposed": proposed}
    if shown is not None:
        out["shown"] = shown
    return out


def stamp_beat(ctx: DispatchContext, preview: dict, args: dict) -> dict:
    """beat_edit: the beat's text / kind. beat_insert: additive."""
    if preview.get("type") != "beat_edit":
        return {}
    from outline.store import get_thread
    thread = get_thread(ctx, preview.get("thread_id"))
    beat = thread.beats.filter(uid=preview.get("beat_id")).first() if thread else None
    if beat is None:
        return {}
    fields = preview.get("fields") or {}
    return {k: _pair(getattr(beat, k), fields[k]) for k in ("text", "kind") if k in fields}


def stamp_character_edit(ctx: DispatchContext, preview: dict, args: dict) -> dict:
    """character_edit: each proposed column; dict columns per sub-key."""
    from characters.models import Character
    char = Character.objects.filter(
        project_id=ctx.project_id, id=preview.get("character_id"),
    ).first()
    if char is None:
        return {}
    from characters import fields as cf
    out: dict[str, Any] = {}
    for col, proposed in (preview.get("fields") or {}).items():
        if col in cf.RELATION_FIELDS:
            # Rows, not a column: compare target + label + note, in order.
            out[col] = _pair(cf.read_field(char, col), cf.compare_form(proposed))
            continue
        if not hasattr(char, col):
            continue
        live = getattr(char, col)
        if isinstance(proposed, dict):
            live = live if isinstance(live, dict) else {}
            for sub, val in proposed.items():
                out[f"{col}.{sub}"] = _pair(live.get(sub), val)
        else:
            out[col] = _pair(live, proposed)
    return out


def stamp_meta_edit(ctx: DispatchContext, preview: dict, args: dict) -> dict:
    """meta_edit: each proposed project-metadata column (canonical names)."""
    from projects.meta_fields import canonicalize_meta_patch
    from projects.models import Project
    project = Project.objects.filter(pk=preview.get("project_id") or ctx.project_id).first()
    if project is None:
        return {}
    patch = canonicalize_meta_patch(preview.get("fields") or {})
    return {k: _pair(getattr(project, k), v) for k, v in patch.items() if hasattr(project, k)}


def stamp_world_entity(ctx: DispatchContext, preview: dict, args: dict) -> dict:
    """world_entity_edit: the entry's description (`content`)."""
    from worldbuilding.models import Worldbuilding
    w = Worldbuilding.objects.filter(
        project_id=ctx.project_id, id=preview.get("worldbuilding_id"),
    ).first()
    if w is None:
        return {}
    return {"content": _pair(w.content, preview.get("content"))}


def stamp_user_wishes(ctx: DispatchContext, preview: dict, args: dict) -> dict:
    """run_user_wishes_rough replaces the earlier "user wishes" story thread. The
    stamp is a fingerprint of that thread (title + beats), so an author's edits
    to it since the proposal block the replace."""
    from outline.models import PlotThread
    threads = PlotThread.objects.filter(
        project_id=ctx.project_id, source="user_wishes", scope_type="story",
    ).prefetch_related("beats").order_by("id")
    snapshot = [
        [t.uid, t.title, t.description, [[b.uid, b.kind, b.text] for b in t.beats.all()]]
        for t in threads
    ]
    if not snapshot:
        return {}
    digest = hashlib.sha256(json.dumps(snapshot).encode()).hexdigest()[:16]
    title = (preview.get("rough_outline") or {}).get("title") or "a new thread"
    names = ", ".join(t.title or t.uid for t in threads)
    return {"user_wishes_thread": _pair(
        digest, f"Replace it with: {title}", shown=f"Your edited thread: {names}",
    )}


# ---- stamp + check ---------------------------------------------------------


def _norm(v: Any) -> Any:
    """Compare as stored JSON would: round-trip, blank-ish values equal."""
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    return json.loads(json.dumps(v, default=str))


def _stamp_fn(capability: str):
    from actions.capabilities import registry
    cap = registry.get(capability)
    return cap.stamp if cap is not None else None


def stamp_base(ctx: DispatchContext, capability: str, preview: Any, args: dict) -> dict | None:
    """The `Proposal.base` to save for a new proposal. Never fails the propose:
    on an error the proposal is simply not stamped (and not checked later)."""
    fn = _stamp_fn(capability)
    if fn is None or not isinstance(preview, dict):
        return None
    try:
        pairs = fn(ctx, preview, args or {})
    except Exception:  # noqa: BLE001 — a stamp read must never block a proposal
        logger.exception("proposal stamp failed capability=%s", capability)
        return None
    return {k: json.loads(json.dumps(p["current"], default=str)) for k, p in pairs.items()}


def check_fresh(
    ctx: DispatchContext,
    proposal: Any,
    preview: dict,
    *,
    only: str | None = None,
    proposed_override: Any = None,
) -> None:
    """Raise ProposalConflict when a stamped field changed since the proposal.

    `only` limits the check to one field key (per-field accepts); with it,
    `proposed_override` is the value the author confirmed in the green cell."""
    base = getattr(proposal, "base", None)
    if not base:
        return
    fn = _stamp_fn(proposal.capability)
    if fn is None:
        return
    now = fn(ctx, preview, proposal.args or {})
    conflicts = []
    for key, was in base.items():
        if only is not None and key != only and not key.startswith(only + "."):
            continue
        if key not in now:  # field already resolved, or the target is gone
            continue
        current = now[key]["current"]
        proposed = now[key]["proposed"]
        if key == only and proposed_override is not None:
            proposed = proposed_override
        if _norm(current) in (_norm(was), _norm(proposed)):
            continue
        conflicts.append({
            "field": key, "was": was,
            "current": now[key].get("shown", _norm(current)), "proposed": _norm(proposed),
        })
    if conflicts:
        raise ProposalConflict(conflicts)
