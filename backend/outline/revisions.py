"""Capped history of each scene's prose.

``record_scene_revision`` is called by every commit that replaces a scene's
content, with the content as it was just before the write.
"""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from outline.models import Scene, SceneRevision
from outline.outline_rows import content_hash

__all__ = ["content_hash", "record_scene_revision"]


def record_scene_revision(
    project_id, scene_id: str, old_content, new_content, *, spaced: bool = False,
) -> None:
    """Keep ``old_content`` as a revision unless nothing really changed.

    Skipped when there is no old content, or when old and new hash the same
    (a re-save of identical text). Then prunes to the newest N for the scene.

    ``spaced=True`` (author autosaves, every ~1.5 s while typing) keeps at most
    one revision per ``SCENE_REVISION_MIN_GAP_SECONDS``: the text as it was at
    the start of that stretch. Without spacing, the cap would cover only a few
    minutes of typing. AI edits pass ``spaced=False`` so the text from just
    before every AI change is always kept.
    """
    if not old_content:
        return
    scene_pk = (Scene.objects.filter(project_id=project_id, uid=scene_id)
                .values_list("pk", flat=True).first())
    if scene_pk is None:
        return  # no such scene (yet): nothing to keep history for
    old_hash = content_hash(old_content)
    if old_hash == content_hash(new_content):
        return
    if spaced:
        gap = timedelta(seconds=settings.SCENE_REVISION_MIN_GAP_SECONDS)
        if SceneRevision.objects.filter(
            scene_id=scene_pk, created_at__gt=timezone.now() - gap,
        ).exists():
            return
    SceneRevision.objects.create(
        project_id=project_id, scene_id=scene_pk, content=old_content, content_hash=old_hash,
    )
    scene_revisions = SceneRevision.objects.filter(scene_id=scene_pk)
    keep = list(
        scene_revisions.order_by("-id").values_list("id", flat=True)[: settings.SCENE_REVISION_CAP]
    )
    scene_revisions.exclude(id__in=keep).delete()
