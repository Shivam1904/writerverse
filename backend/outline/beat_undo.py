"""Undo for a deleted beat: an outline beat (inside a scene) or a thread beat
(inside a plot thread). Backs the 10-second "Deleted — Undo" toast.

There is no soft delete. A beat delete really deletes the row, but first it
takes a snapshot of the row: its text and kind, where it sat (its neighbours
and position) and its links. The delete returns that snapshot as a signed
token. Undo sends the token back; `restore_beat` puts the row back in place.

  · An outline beat's links are the thread and thread beat it was placed from.
  · A thread beat's links are the outline beats that were placed from it
    (deleting it only cleared their `from_item`; undo sets it again).

Safety: the token is signed with Django's SECRET_KEY and salted with the
project id, so the client cannot edit it and a token from one project never
works in another. Restore still looks every row up by uid inside the project.

Where it goes back: right after its old previous neighbour; if that is gone,
right before its old next neighbour; if both are gone, at its old list index.
When its old position number is still free there, it gets that number back, so
no other row moves.
"""
from __future__ import annotations

from common.ids import new_id
from common.timeutil import iso, parse_iso
from django.core import signing
from django.db import transaction
from django.db.models import F

from outline.models import OutlineBeat, PlotThread, Scene, ThreadBeat

_SALT = "writerverse.beat-undo"
# The toast lasts 10 seconds; this only has to outlive a slow network.
MAX_AGE_S = 15 * 60

OUTLINE_BEAT = "outline_beat"
THREAD_BEAT = "thread_beat"


class BeatUndoError(Exception):
    """The beat cannot be put back. `status` is the HTTP status to answer with."""

    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


def _salt(project_id) -> str:
    return f"{_SALT}:{int(project_id)}"


def _place(siblings, pk) -> dict:
    """Where row `pk` sits among `siblings` (an ordered queryset)."""
    order = list(siblings.values_list("pk", "uid", "position"))
    i = next(k for k, (p, _, _) in enumerate(order) if p == pk)
    return {
        "index": i,
        "position": order[i][2],
        "prev": order[i - 1][1] if i > 0 else None,
        "next": order[i + 1][1] if i + 1 < len(order) else None,
    }


def _open_slot(siblings, snap: dict) -> int:
    """Make room for the beat among `siblings` (ordered) where it used to be.
    Returns the position to give it."""
    order = list(siblings.values_list("uid", "position"))
    uids = [u for u, _ in order]
    if snap.get("prev") in uids:
        i = uids.index(snap["prev"]) + 1
    elif snap.get("next") in uids:
        i = uids.index(snap["next"])
    else:
        i = max(0, min(int(snap.get("index") or 0), len(order)))
    low = order[i - 1][1] if i > 0 else -1
    high = order[i][1] if i < len(order) else None
    old = snap.get("position")
    if isinstance(old, int) and low < old and (high is None or old < high):
        return old  # its old number is still free in that gap: nothing moves
    if high is None:
        return low + 1
    siblings.filter(position__gte=high).update(position=F("position") + 1)
    return high


def _free_uid(taken, uid: str, prefix: str) -> str:
    if not taken.filter(uid=uid).exists():
        return uid
    return new_id(prefix, taken=lambda u: taken.filter(uid=u).exists())


# ---- snapshots (taken by the delete, just before it deletes) -------------- #

def snapshot_outline_beat(row: OutlineBeat) -> dict:
    tb = row.thread_beat
    return {
        "type": OUTLINE_BEAT,
        "uid": row.uid,
        "scene": row.scene.uid,
        **_place(OutlineBeat.objects.filter(scene_id=row.scene_id).order_by("position", "id"),
                 row.pk),
        "kind": row.kind,
        "text": row.text,
        "written": row.written,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
        "extra": row.extra or {},
        "thread": row.thread.uid if row.thread_id else None,
        "thread_beat": [tb.thread.uid, tb.uid] if tb else None,
    }


def snapshot_thread_beat(row: ThreadBeat) -> dict:
    linked = (OutlineBeat.objects.filter(thread_beat=row)
              .values_list("scene__uid", "uid"))
    return {
        "type": THREAD_BEAT,
        "uid": row.uid,
        "thread": row.thread.uid,
        **_place(ThreadBeat.objects.filter(thread_id=row.thread_id).order_by("position", "id"),
                 row.pk),
        "kind": row.kind,
        "text": row.text,
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
        "linked": [list(x) for x in linked],
    }


def sign(project_id, snapshot: dict) -> str:
    """The snapshot as a token only this server can read back, for this project."""
    return signing.dumps(snapshot, salt=_salt(project_id), compress=True)


# ---- restore (the Undo) ---------------------------------------------------- #

def _read_token(project_id, token) -> dict:
    try:
        snap = signing.loads(str(token or ""), salt=_salt(project_id), max_age=MAX_AGE_S)
    except signing.SignatureExpired:
        raise BeatUndoError("It's too late to undo that delete.", 410) from None
    except signing.BadSignature:
        raise BeatUndoError("That undo isn't valid for this project.", 400) from None
    if not isinstance(snap, dict) or snap.get("type") not in (OUTLINE_BEAT, THREAD_BEAT):
        raise BeatUndoError("That undo isn't valid for this project.", 400)
    return snap


def restore_beat(project_id, token) -> dict:
    """Put a deleted beat back from its delete's token. Returns
    {type, beat: the row, parent_uid, index, already_restored}.

    Refuses (BeatUndoError) when the token is bad, too old, or the beat's scene
    or thread was deleted since. Undo twice: the second call finds the beat
    already back and changes nothing. If the old id was taken meanwhile by a
    different beat, the beat comes back under a new id."""
    snap = _read_token(project_id, token)
    with transaction.atomic():
        if snap["type"] == OUTLINE_BEAT:
            return _restore_outline_beat(project_id, snap)
        return _restore_thread_beat(project_id, snap)


def _result(kind, row, parent_uid, siblings, already=False) -> dict:
    uids = list(siblings.values_list("uid", flat=True))
    return {"type": kind, "beat": row, "parent_uid": parent_uid,
            "index": uids.index(row.uid), "already_restored": already}


def _restore_outline_beat(project_id, snap: dict) -> dict:
    scene = Scene.objects.filter(project_id=project_id, uid=snap["scene"]).first()
    if scene is None:
        raise BeatUndoError("Can't undo: the scene that beat was in has been deleted.")
    siblings = OutlineBeat.objects.filter(scene=scene).order_by("position", "id")
    same = siblings.filter(uid=snap["uid"]).first()
    if same is not None and same.text == snap["text"] and same.kind == snap["kind"]:
        return _result(OUTLINE_BEAT, same, scene.uid, siblings, already=True)

    thread = (PlotThread.objects.filter(project_id=project_id, uid=snap["thread"]).first()
              if snap.get("thread") else None)
    thread_beat = None
    if snap.get("thread_beat"):
        t_uid, b_uid = snap["thread_beat"]
        thread_beat = ThreadBeat.objects.filter(
            thread__project_id=project_id, thread__uid=t_uid, uid=b_uid).first()
    row = OutlineBeat.objects.create(
        scene=scene,
        uid=_free_uid(siblings, snap["uid"], "bt"),
        position=_open_slot(siblings, snap),
        kind=snap["kind"], text=snap["text"], written=snap["written"],
        thread=thread, thread_beat=thread_beat,
        created_at=parse_iso(snap["created_at"]), updated_at=parse_iso(snap["updated_at"]),
        extra=snap.get("extra") or {},
    )
    return _result(OUTLINE_BEAT, row, scene.uid, siblings)


def _restore_thread_beat(project_id, snap: dict) -> dict:
    thread = PlotThread.objects.filter(project_id=project_id, uid=snap["thread"]).first()
    if thread is None:
        raise BeatUndoError("Can't undo: the plot thread that beat was in has been deleted.")
    siblings = ThreadBeat.objects.filter(thread=thread).order_by("position", "id")
    same = siblings.filter(uid=snap["uid"]).first()
    if same is not None and same.text == snap["text"] and same.kind == snap["kind"]:
        return _result(THREAD_BEAT, same, thread.uid, siblings, already=True)

    row = ThreadBeat.objects.create(
        thread=thread,
        uid=_free_uid(siblings, snap["uid"], "ri"),
        position=_open_slot(siblings, snap),
        kind=snap["kind"], text=snap["text"],
        created_at=parse_iso(snap["created_at"]), updated_at=parse_iso(snap["updated_at"]),
    )
    # Re-link the outline beats placed from it — only those still there and
    # still unlinked (one the author re-linked meanwhile keeps its new link).
    for scene_uid, beat_uid in snap.get("linked") or []:
        OutlineBeat.objects.filter(
            scene__project_id=project_id, scene__uid=scene_uid, uid=beat_uid,
            thread_beat__isnull=True,
        ).update(thread_beat=row)
    return _result(THREAD_BEAT, row, thread.uid, siblings)
