"""Row-level outline writes: change ONE act / chapter / scene / beat without
loading or saving the whole outline.

`outline.store.save_outline` syncs a whole nested dict back to the rows. That
is right for big merges and templates, but a prose autosave or a beat edit
should not read every scene of a series to change one row. The common writers
in `actions/capabilities/commit/` use these helpers instead.

Each helper returns (or takes) the same dict shapes `load_outline` builds, so
callers' results do not change. `position` may have gaps after deletes; only
the order matters (same as the thread rows).

All of these run inside a capability commit, which already holds the
project's write lock (dispatch), so no extra row locks are taken here.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from common.ids import new_id
from django.db import transaction
from django.db.models import Count, F, Max, Sum

from outline import outline_rows as rows
from outline.models import Act, Chapter, OutlineBeat, Scene, SceneContent
from outline.store import _character_check, _Links, now_stamp

logger = logging.getLogger("writerverse.outline")

# The columns load_outline reads for each level (keep in step with it).
_ACT_VALUES = ("id", "uid", "title", "created_at", "updated_at", "extra")
_CHAPTER_VALUES = ("id", "act_id", "uid", "title", "pov_mode", "pov_name",
                   "pov_character_id", "pov_character__name", "created_at",
                   "updated_at", "extra")
_SCENE_VALUES = ("id", "chapter_id", "uid", "title", "words", "analysis",
                 "entity_links", "mention_counts", "created_at", "updated_at", "extra")
_BEAT_VALUES = ("scene_id", "uid", "kind", "text", "written", "thread__uid",
                "thread_beat__uid", "created_at", "updated_at", "extra")

_ORDER = ("position", "id")


# ---- finding rows ---------------------------------------------------------- #

def get_item(project_id, item_type: str, uid):
    """The act / chapter / scene / beat row with this id, or None.

    Beat ids are unique per scene, not per project; the first match (outline
    order) wins, as the old dict search did."""
    if item_type == "act":
        return Act.objects.filter(project_id=project_id, uid=uid).first()
    if item_type == "chapter":
        return Chapter.objects.filter(project_id=project_id, uid=uid).first()
    if item_type == "scene":
        return Scene.objects.filter(project_id=project_id, uid=uid).first()
    if item_type == "beat":
        return (OutlineBeat.objects.filter(scene__project_id=project_id, uid=uid)
                .order_by("scene__chapter__act__position", "scene__chapter__act_id",
                          "scene__chapter__position", "scene__chapter_id",
                          "scene__position", "scene_id", *_ORDER)
                .first())
    return None


def siblings_of(project_id, item_type: str, row):
    """The queryset of `row`'s siblings (itself included), in order."""
    if item_type == "act":
        qs = Act.objects.filter(project_id=project_id)
    elif item_type == "chapter":
        qs = Chapter.objects.filter(act_id=row.act_id)
    elif item_type == "scene":
        qs = Scene.objects.filter(chapter_id=row.chapter_id)
    else:
        qs = OutlineBeat.objects.filter(scene_id=row.scene_id)
    return qs.order_by(*_ORDER)


def children_of(project_id, item_type: str, parent):
    """The queryset a new `item_type` row would join under `parent`
    (None for an act, whose parent is the outline)."""
    if item_type == "act":
        return Act.objects.filter(project_id=project_id).order_by(*_ORDER)
    if item_type == "chapter":
        return Chapter.objects.filter(act=parent).order_by(*_ORDER)
    if item_type == "scene":
        return Scene.objects.filter(chapter=parent).order_by(*_ORDER)
    return OutlineBeat.objects.filter(scene=parent).order_by(*_ORDER)


# ---- rows → the dict shapes load_outline builds ---------------------------- #

def item_dict(project_id, item_type: str, row, *, include_prose: bool = True) -> dict:
    """One item as the dict `load_outline` would give for it, children included
    (an act brings its chapters, scenes and beats; a scene its beats and prose)."""
    if item_type == "beat":
        b = OutlineBeat.objects.filter(pk=row.pk).values(*_BEAT_VALUES).first()
        return rows.beat_dict(b)
    if item_type == "act":
        acts = Act.objects.filter(pk=row.pk).values(*_ACT_VALUES)
        chapters = Chapter.objects.filter(act_id=row.pk)
        scenes = Scene.objects.filter(chapter__act_id=row.pk)
    elif item_type == "chapter":
        acts = None
        chapters = Chapter.objects.filter(pk=row.pk)
        scenes = Scene.objects.filter(chapter_id=row.pk)
    else:
        acts = chapters = None
        scenes = Scene.objects.filter(pk=row.pk)
    scenes = list(scenes.order_by(*_ORDER).values(*_SCENE_VALUES))
    scene_pks = [s["id"] for s in scenes]
    beats_by: dict = defaultdict(list)
    for b in (OutlineBeat.objects.filter(scene_id__in=scene_pks)
              .order_by(*_ORDER).values(*_BEAT_VALUES)):
        beats_by[b["scene_id"]].append(rows.beat_dict(b))
    docs = (dict(SceneContent.objects.filter(scene_id__in=scene_pks)
                 .values_list("scene_id", "doc"))
            if include_prose else {})
    scenes_by: dict = defaultdict(list)
    for s in scenes:
        sid = s["id"]
        scenes_by[s["chapter_id"]].append(
            rows.scene_dict(s, beats_by.get(sid, []), docs.get(sid), sid in docs))
    if chapters is None:
        return scenes_by[row.chapter_id][0]
    chapter_dicts: dict = defaultdict(list)
    for c in chapters.order_by(*_ORDER).values(*_CHAPTER_VALUES):
        chapter_dicts[c["act_id"]].append(rows.chapter_dict(c, scenes_by.get(c["id"], [])))
    if acts is None:
        return chapter_dicts[row.act_id][0]
    return rows.act_dict(acts.first(), chapter_dicts.get(row.pk, []))


def scene_doc(scene: Scene):
    """The scene's stored prose (None when it has none)."""
    return (SceneContent.objects.filter(scene=scene)
            .values_list("doc", flat=True).first())


# ---- writes ---------------------------------------------------------------- #

def drop_extra(row, *keys) -> None:
    """Forget odd old values kept in `extra` for keys a writer now sets (they
    would win over the column on load)."""
    if row.extra and any(k in row.extra for k in keys):
        row.extra = {k: v for k, v in row.extra.items() if k not in keys}


def touch(row) -> list[str]:
    """Stamp an author edit on the row (created_at once, updated_at always).
    Returns the field names to save."""
    stamp = now_stamp()
    row.updated_at = stamp
    if row.created_at is None:
        row.created_at = stamp
    drop_extra(row, "created_at", "updated_at")
    return ["created_at", "updated_at", "extra"]


def set_text(row, text) -> list[str]:
    """Set the item's text (a title for act / chapter / scene). Returns the
    field names to save."""
    field = "text" if isinstance(row, OutlineBeat) else "title"
    setattr(row, field, text)
    drop_extra(row, "text")
    return [field, "extra"]


def write_scene_prose(scene: Scene, doc) -> bool:
    """Store the scene's prose. Writes only when it changed, and each change
    bumps the content's `rev`. Returns whether anything was written."""
    h = rows.content_hash(doc)
    content = SceneContent.objects.filter(scene=scene).only("id", "doc_hash").first()
    if content is None:
        SceneContent.objects.create(scene=scene, doc=doc, doc_hash=h, rev=1)
        return True
    if content.doc_hash == h:
        return False
    SceneContent.objects.filter(pk=content.pk).update(doc=doc, doc_hash=h, rev=F("rev") + 1)
    return True


def refresh_totals(project_id) -> None:
    """Roll act / chapter / scene counts and the word total onto the Project
    row (the library cover reads them). Counts rows and sums each scene's
    stored `words`; prose is never read."""
    from projects.models import Project
    totals = {
        "total_acts": Act.objects.filter(project_id=project_id).count(),
        "total_chapters": Chapter.objects.filter(project_id=project_id).count(),
        **Scene.objects.filter(project_id=project_id).aggregate(
            total_scenes=Count("id"), total_word_count=Sum("words")),
    }
    totals["total_word_count"] = totals["total_word_count"] or 0
    Project.objects.filter(pk=project_id).update(**totals)


def open_slot(siblings, index=None) -> int:
    """Make room for one new row among `siblings` (an ordered queryset) at list
    index `index` (None or out of range = the end). Returns its position."""
    current = list(siblings.values_list("position", flat=True))
    if index is None or index < 0 or index >= len(current):
        top = siblings.aggregate(m=Max("position"))["m"]
        return 0 if top is None else top + 1
    pos = current[index]
    siblings.filter(position__gte=pos).update(position=F("position") + 1)
    return pos


_PREFIX = {"act": "ac", "chapter": "ch", "scene": "sc", "beat": "bt"}


def _free_uid(project_id, item_type: str, parent, raw: dict) -> str:
    """`raw`'s id, or a fresh one if that id is already used (a client retry or
    a double add resending the same id). Like save_outline, the copy is kept
    under a new id, never dropped; the new id is written back into `raw`."""
    uid = str(raw.get("id") or "").strip()
    # Beat ids are unique per scene; act / chapter / scene ids per project.
    taken = (OutlineBeat.objects.filter(scene=parent) if item_type == "beat"
             else children_of(project_id, item_type, parent).model.objects
             .filter(project_id=project_id))
    while not uid or taken.filter(uid=uid).exists():
        if uid:
            logger.warning("outline: id %r already used, giving the new %s a new id",
                           uid, item_type)
        uid = new_id(_PREFIX[item_type])
    raw["id"] = uid
    return uid


def insert_item(project_id, item_type: str, parent, raw: dict, *, index=None):
    """Insert one new act / chapter / scene / beat row from its dict `raw`
    (which must carry its `id`) under `parent` at list index `index`. A new
    scene's `beats` are inserted with it; a new act or chapter's children are
    not (the writers only add empty ones). Returns the new row."""
    with transaction.atomic():
        pos = open_slot(children_of(project_id, item_type, parent), index)
        uid = _free_uid(project_id, item_type, parent, raw)
        if item_type == "act":
            row = Act.objects.create(project_id=project_id, uid=uid,
                                     **rows.act_fields(raw, pos))
        elif item_type == "chapter":
            row = Chapter.objects.create(
                project_id=project_id, act=parent, uid=uid,
                **rows.chapter_fields(raw, pos, _character_check(project_id)))
        elif item_type == "scene":
            has_doc, doc = rows.scene_doc(raw)
            row = Scene.objects.create(
                project_id=project_id, chapter=parent, uid=uid, **rows.scene_fields(raw, pos),
                mention_counts=rows.mention_counts(doc) if has_doc else None)
            beats = [b for b in raw.get("beats") or [] if isinstance(b, dict)]
            if beats:
                links = _Links(project_id)
                OutlineBeat.objects.bulk_create([
                    OutlineBeat(scene=row, uid=b["id"], **rows.beat_fields(b, i, links))
                    for i, b in enumerate(beats)])
            if has_doc:
                write_scene_prose(row, doc)
        else:
            row = OutlineBeat.objects.create(
                scene=parent, uid=uid, **rows.beat_fields(raw, pos, _Links(project_id)))
        if item_type != "beat":
            refresh_totals(project_id)
    return row


def delete_item(project_id, item_type: str, row) -> None:
    """Delete one row and everything under it (a scene takes its prose and
    prose history). A beat id repeated in the same scene goes too, as the old
    dict delete did."""
    with transaction.atomic():
        if item_type == "beat":
            OutlineBeat.objects.filter(scene_id=row.scene_id, uid=row.uid).delete()
            return
        row.delete()
        refresh_totals(project_id)


def move_item(project_id, item_type: str, row, new_index: int) -> tuple[int, int]:
    """Move `row` to list index `new_index` among its siblings (clamped).
    Rewrites only the positions that change. Returns (old_index, new_index)."""
    model = type(row)
    order = list(siblings_of(project_id, item_type, row).values_list("pk", "position"))
    pks = [pk for pk, _ in order]
    old = pks.index(row.pk)
    pks.pop(old)
    new = max(0, min(int(new_index), len(pks)))
    pks.insert(new, row.pk)
    current = dict(order)
    changed = [model(pk=pk, position=i) for i, pk in enumerate(pks) if current[pk] != i]
    if changed:
        model.objects.bulk_update(changed, ["position"])
    return old, new


def set_chapter_pov(project_id, chapter: Chapter, pov: dict) -> None:
    """Store a chapter's POV ({mode, character[, character_id]}) on its row,
    converted the same way save_outline would."""
    fields = rows.chapter_fields({"pov": pov}, chapter.position, _character_check(project_id))
    chapter.pov_mode = fields["pov_mode"]
    chapter.pov_name = fields["pov_name"]
    chapter.pov_character_id = fields["pov_character_id"]
    extra = {k: v for k, v in (chapter.extra or {}).items() if k != "pov"}
    if "pov" in fields["extra"]:
        extra["pov"] = fields["extra"]["pov"]
    chapter.extra = extra
    chapter.save(update_fields=["pov_mode", "pov_name", "pov_character", "extra"])
