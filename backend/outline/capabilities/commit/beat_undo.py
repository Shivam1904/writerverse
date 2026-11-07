"""Commit layer — Undo a beat delete (the 10-second "Deleted — Undo" toast).

`delete_outline_item` (for a beat) and `delete_thread_beat` return an
`undo_token`; `restore_deleted_beat` sends it back here. The work is in
`outline.beat_undo`.
"""
from __future__ import annotations

import logging
from typing import Any

from actions.capabilities.spec import CapabilityError, DispatchContext

from outline import beat_undo
from outline import outline_writes as ow
from outline.store import beat_to_dict

logger = logging.getLogger("writerverse.consistency")


def gather_restore_deleted_beat(ctx: DispatchContext, args: dict[str, Any]) -> dict[str, Any]:
    token = args.get("token")
    if not token or not isinstance(token, str):
        raise CapabilityError("token is required", 400)
    if ctx.project_id is None:
        raise CapabilityError("no project in scope", 400)
    return {"token": token}


def commit_restore_deleted_beat(ctx: DispatchContext, result: dict[str, Any]) -> None:
    try:
        out = beat_undo.restore_beat(ctx.project_id, result.pop("token"))
    except beat_undo.BeatUndoError as e:
        raise CapabilityError(str(e), e.status) from None
    row = out["beat"]
    if out["type"] == beat_undo.OUTLINE_BEAT:
        result["item_type"] = "beat"
        result["scene_id"] = out["parent_uid"]
        result["beat"] = ow.item_dict(ctx.project_id, "beat", row)
    else:
        result["item_type"] = "thread_beat"
        result["thread_id"] = out["parent_uid"]
        result["beat"] = beat_to_dict(row)
    result["index"] = out["index"]
    result["already_restored"] = out["already_restored"]
    logger.info("outline/restore_beat project=%s type=%s beat=%s already=%s",
                ctx.project_id, out["type"], row.uid, out["already_restored"])
