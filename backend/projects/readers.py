"""Project-level reads — synopsis."""
from __future__ import annotations

from actions.errors import _capability_error

from projects.models import Project

# Every metadata field the World page studio shows. `get_project_meta_full`
# wraps each as {actual_value, proposal?, proposed_value?} so a pending AI
# `meta_edit` can be reviewed field-by-field. The shared flat `get_project_meta`
# (register/globals.py) stays untouched for its other callers (loadWorld, lab).
_META_FULL_FIELDS = (
    "title", "description", "synopsis", "logline",
    "genres", "themes", "tones", "perspective", "tense", "audience",
)


def get_project_meta_full(ctx) -> dict:
    """Project metadata for the World page, every field wrapped as
    `{actual_value, proposal?, proposed_value?}`. A field carries the extra keys
    only when a pending `meta_edit` proposal proposes a new value for it (latest
    pending wins). The DB still holds plain values; this is a read-time merge of
    the Project row + its pending Proposal(s)."""
    from actions.models import Proposal
    if ctx.project_id is None:
        raise _capability_error("no project in scope", 400)
    p = (
        Project.objects.filter(pk=ctx.project_id)
        .values("id", *_META_FULL_FIELDS).first()
    )
    if not p:
        raise _capability_error("project not found", 404)

    # field -> (proposal_id, proposed_value), from this project's pending edits.
    pending: dict[str, tuple] = {}
    rows = (
        Proposal.objects.filter(
            project_id=ctx.project_id, status=Proposal.STATUS_PROPOSED,
        )
        .order_by("created_at")  # later proposals overwrite earlier → latest wins
        .values("id", "proposal")
    )
    for row in rows:
        preview = (row["proposal"] or {}).get("preview") or {}
        if preview.get("type") != "meta_edit":
            continue
        for f, v in (preview.get("fields") or {}).items():
            pending[f] = (row["id"], v)

    out = {"id": p["id"]}
    for f in _META_FULL_FIELDS:
        entry = {"actual_value": p.get(f)}
        if f in pending:
            entry["proposal"] = pending[f][0]
            entry["proposed_value"] = pending[f][1]
        out[f] = entry
    return {"meta": out}


