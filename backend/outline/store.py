"""Thread and outline store accessors — central read/write for plot threads and
grand outline data.

All thread/outline data flows through these functions. Threads are the
PlotThread / ThreadBeat tables; the outline is the Act / Chapter / Scene /
OutlineBeat / SceneContent tables, plus three settings on Project
(outline_base_template, pov_default, scene_pipelines).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime

from common.ids import new_id
from common.timeutil import iso, parse_iso
from django.db import transaction
from django.db.models import F, Max
from django.utils import timezone

from outline import outline_rows as rows
from outline.models import (
    Act,
    Chapter,
    OutlineBeat,
    PlotThread,
    Scene,
    SceneContent,
    ThreadBeat,
)

logger = logging.getLogger("writerverse.outline")


def _thread_to_dict(t: PlotThread) -> dict:
    d: dict = {"id": t.uid}
    if t.title:
        d["title"] = t.title
    if t.description:
        d["description"] = t.description
    if t.color:
        d["color"] = t.color
    if t.character_id:
        # Linked character: its CURRENT name, so a rename shows up everywhere.
        d["scope"] = {"type": t.scope_type or "character", "name": t.character.name,
                      "character_id": t.character_id}
    elif t.scope_type or t.scope_name:
        d["scope"] = {"type": t.scope_type, "name": t.scope_name}
    if t.source:
        d["source"] = t.source
    if t.template_id is not None:
        d["template_id"] = t.template_id
    if t.created_at:
        d["created_at"] = iso(t.created_at)
    d["items"] = [_beat_to_dict(b) for b in t.beats.all()]
    return d


def _beat_to_dict(b: ThreadBeat) -> dict:
    d = {"id": b.uid, "kind": b.kind, "text": b.text}
    if b.created_at:
        d["created_at"] = iso(b.created_at)
    if b.updated_at:
        d["updated_at"] = iso(b.updated_at)
    return d


def load_threads(ctx) -> list[dict]:
    """Every plot thread for the project, top first, each with its beats in
    order — as the list of plain dicts the rest of the app works with."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return []
    qs = (PlotThread.objects.filter(project_id=project_id)
          .select_related("character").prefetch_related("beats"))
    return [_thread_to_dict(t) for t in qs]


def find_character_id(project_id, name):
    """The id of this project's character whose name (or one of its aliases)
    matches `name`, ignoring case. None if nothing matches."""
    name = (name or "").strip().lower()
    if not name or not project_id:
        return None
    from characters.models import Character
    chars = Character.objects.filter(project_id=project_id)
    exact = chars.filter(name__iexact=name).values_list("id", flat=True).first()
    if exact:
        return exact
    # No name match: check the character's own aliases, stored as {"name": …}
    # (an alias with a character_id points at ANOTHER character, so skip it).
    for cid, aliases in chars.exclude(aliases=[]).values_list("id", "aliases"):
        for a in aliases or []:
            if (isinstance(a, dict) and not a.get("character_id")
                    and str(a.get("name") or "").strip().lower() == name):
                return cid
    return None


def resolve_scope_character(project_id, scope_type, scope_name):
    """Which character a character thread is about (see find_character_id).
    None if it isn't a character thread or no character matches."""
    if (scope_type or "").strip() != "character":
        return None
    return find_character_id(project_id, scope_name)


def _live_character_names(project_id, ids) -> dict:
    from characters.models import Character
    # all_objects: a soft-deleted character keeps its name until Undo/expiry
    return dict(Character.all_objects.filter(project_id=project_id, pk__in=ids)
                .values_list("id", "name"))


def _refresh_pov_names(project_id, povs: list) -> None:
    """Swap each POV's stored `character` name for the linked character's
    CURRENT name (in place), so a rename shows up everywhere."""
    ids = {p["character_id"] for p in povs if isinstance(p, dict) and p.get("character_id")}
    if not ids:
        return
    names = _live_character_names(project_id, ids)
    for p in povs:
        if isinstance(p, dict) and p.get("character_id") in names:
            p["character"] = names[p["character_id"]]


def _thread_fields(raw: dict, position: int, project_id=None) -> dict:
    scope = raw.get("scope") if isinstance(raw.get("scope"), dict) else {}
    tpl = raw.get("template_id")
    return {
        "character_id": resolve_scope_character(
            project_id, scope.get("type"), scope.get("name"),
        ) if project_id else None,
        "title": str(raw.get("title") or "").strip(),
        "description": str(raw.get("description") or "").strip(),
        "color": str(raw.get("color") or "").strip(),
        "scope_type": str(scope.get("type") or "").strip(),
        "scope_name": str(scope.get("name") or "").strip(),
        "source": str(raw.get("source") or "").strip(),
        "template_id": None if tpl is None else str(tpl),
        "position": position,
        "created_at": parse_iso(raw.get("created_at")),
    }


def _beat_fields(raw: dict, position: int) -> dict:
    return {
        "kind": str(raw.get("kind") or "text").strip() or "text",
        "text": str(raw.get("text") or ""),
        "position": position,
        "created_at": parse_iso(raw.get("created_at")),
        "updated_at": parse_iso(raw.get("updated_at")),
    }


def _ensure_uid(raw: dict, prefix: str) -> str:
    """The item's string id; mints one (and writes it back) if it has none."""
    uid = str(raw.get("id") or "").strip()
    if not uid:
        uid = new_id(prefix)
        raw["id"] = uid
    return uid


def _apply(obj, fields: dict) -> None:
    """Save only the fields that actually changed (none → no query)."""
    changed = [k for k, v in fields.items() if getattr(obj, k) != v]
    if changed:
        for k in changed:
            setattr(obj, k, fields[k])
        obj.save(update_fields=changed)


def _sync_beats(thread: PlotThread, items: list, existing: dict) -> None:
    keep: set[str] = set()
    new: list[ThreadBeat] = []
    for pos, raw in enumerate(b for b in items if isinstance(b, dict)):
        uid = _ensure_uid(raw, "ri")
        if uid in keep:
            continue  # duplicate id in the list — first one wins
        keep.add(uid)
        fields = _beat_fields(raw, pos)
        if uid in existing:
            _apply(existing[uid], fields)
        else:
            new.append(ThreadBeat(thread=thread, uid=uid, **fields))
    stale = [uid for uid in existing if uid not in keep]
    if stale:
        ThreadBeat.objects.filter(thread=thread, uid__in=stale).delete()
    if new:
        ThreadBeat.objects.bulk_create(new)


def save_threads(ctx, threads: list) -> None:
    """Make the project's threads match `threads` (the full list, top first).
    The app's writers edit single rows instead (see "row-level thread writes"
    below); this is for seeding and restoring whole lists.

    Syncs into PlotThread/ThreadBeat rows: unchanged rows are left alone, new
    ones inserted, ones missing from the list deleted. One transaction."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return
    with transaction.atomic():
        existing = {
            t.uid: t for t in
            PlotThread.objects.filter(project_id=project_id).prefetch_related("beats")
        }
        keep: set[str] = set()
        for pos, raw in enumerate(t for t in threads if isinstance(t, dict)):
            uid = _ensure_uid(raw, "ro")
            if uid in keep:
                continue
            keep.add(uid)
            fields = _thread_fields(raw, pos, project_id)
            obj = existing.get(uid)
            if obj is None:
                obj = PlotThread.objects.create(project_id=project_id, uid=uid, **fields)
                old_beats: dict = {}
            else:
                _apply(obj, fields)
                old_beats = {b.uid: b for b in obj.beats.all()}
            _sync_beats(obj, raw.get("items") or [], old_beats)
        PlotThread.objects.filter(project_id=project_id).exclude(uid__in=keep).delete()


# ---- row-level thread writes ----------------------------------------------- #
# The thread writers use these to touch only their own rows. `position` may have
# gaps after deletes; only the order matters.

def thread_to_dict(t: PlotThread) -> dict:
    return _thread_to_dict(t)


def beat_to_dict(b: ThreadBeat) -> dict:
    return _beat_to_dict(b)


def now_stamp() -> datetime:
    """An edit timestamp (`common.timeutil.iso` writes it out with microseconds)."""
    return timezone.now()


def load_thread_heads(ctx) -> list[dict]:
    """Every thread's id / color / scope, no beats — enough to pick a colour."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return []
    return [
        {"id": uid, "color": color,
         "scope": {"type": stype, "name": cname or sname} if stype or sname or cname else None}
        for uid, color, stype, sname, cname in PlotThread.objects.filter(project_id=project_id)
        .values_list("uid", "color", "scope_type", "scope_name", "character__name")
    ]


def get_thread(ctx, uid) -> PlotThread | None:
    return PlotThread.objects.filter(project_id=ctx.project_id, uid=uid).first()


def create_thread(ctx, raw: dict, *, at_top: bool = False) -> PlotThread:
    """Insert one thread (and its `items` as beats) at the top or the bottom of
    the project's list. Mints missing ids into `raw`."""
    uid = _ensure_uid(raw, "ro")
    with transaction.atomic():
        siblings = PlotThread.objects.filter(project_id=ctx.project_id)
        if at_top:
            siblings.update(position=F("position") + 1)
            pos = 0
        else:
            top = siblings.aggregate(m=Max("position"))["m"]
            pos = 0 if top is None else top + 1
        thread = PlotThread.objects.create(
            project_id=ctx.project_id, uid=uid, **_thread_fields(raw, pos, ctx.project_id),
        )
        beats, seen = [], set()
        for raw_beat in (b for b in raw.get("items") or [] if isinstance(b, dict)):
            buid = _ensure_uid(raw_beat, "ri")
            if buid in seen:
                continue
            seen.add(buid)
            beats.append(ThreadBeat(thread=thread, uid=buid, **_beat_fields(raw_beat, len(beats))))
        ThreadBeat.objects.bulk_create(beats)
    return thread


def open_beat_slot(thread: PlotThread, *, index=None, after_uid=None) -> int:
    """Make room for one new beat and return the position to give it.

    `after_uid` → right after that beat (the end if it isn't found); otherwise
    `index` (a list index, clamped); otherwise the end. Beats at or below the
    slot move down one."""
    beats = list(thread.beats.order_by("position", "id").values_list("uid", "position"))
    if after_uid:
        i = next((k + 1 for k, (u, _) in enumerate(beats) if u == after_uid), len(beats))
    elif index is not None:
        i = max(0, min(int(index), len(beats)))
    else:
        i = len(beats)
    if i >= len(beats):
        return beats[-1][1] + 1 if beats else 0
    pos = beats[i][1]
    ThreadBeat.objects.filter(thread=thread, position__gte=pos).update(position=F("position") + 1)
    return pos


# ---------------------------------------------------------------------------- #
# Thread colour assignment
#
# Every NEW plot thread is given a colour that doesn't already show on an
# existing thread, so storylines stay mutually distinguishable instead of all
# collapsing onto the shared "story" default. This is the single authoritative
# ("our side") chokepoint — every create path (manual modal, scaffold picker,
# AI generate / user-wishes, chat) funnels its colour decision through here.
#
# The palette mirrors theme/aspects.ts (ASPECT_HEX_PALETTE + CHARACTER_COLOR_
# SHADES); kept in sync by hand since the frontend owns colour identity.
# ---------------------------------------------------------------------------- #
_THREAD_COLOR_PALETTE = [
    "#3d8c8a", "#b05a86", "#8a6a4a", "#b0533f", "#c4742f", "#7a5ea3",
    "#4a72b0", "#4e8a55",
    "#3f5e96", "#5b86c4", "#3d7d9a", "#6a6fb0", "#4a8aa8",
]
_STORY_DEFAULT_COLOR = "#7a5ea3"


def _character_colors(ctx) -> dict[str, str]:
    """name(lowercased) → identity colour, for resolving a character-scoped
    thread's mirrored colour. Best-effort: empty on any failure so colour
    assignment never blocks a thread write."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return {}
    try:
        from characters.models import Character
        return {
            (c.name or "").strip().lower(): c.color.strip()
            for c in Character.objects.filter(project_id=project_id)
            if (c.color or "").strip()
        }
    except Exception:
        return {}


def _thread_effective_color(thread: dict, char_colors: dict[str, str]) -> str:
    """The colour a thread actually displays — mirrors theme/aspects.ts
    threadColor(): explicit override → character mirror → story default."""
    override = str(thread.get("color") or "").strip()
    if override:
        return override.lower()
    scope = thread.get("scope") or {}
    if scope.get("type") == "character":
        c = char_colors.get(str(scope.get("name") or "").strip().lower())
        if c:
            return c.lower()
    return _STORY_DEFAULT_COLOR


def pick_thread_color(ctx, existing, *, scope_type=None, scope_name=None) -> str | None:
    """Choose a stored colour for a NEW thread so its displayed colour never
    collides with an existing thread's.

    Returns ``None`` to mean "store no colour" — the thread then derives/mirrors
    at render. That happens only for the FIRST thread of a given character, which
    mirrors that character's colour; every later thread for the same character
    (and every non-character thread) gets its own distinct palette colour.
    """
    char_colors = _character_colors(ctx)
    used = {
        _thread_effective_color(t, char_colors)
        for t in existing if isinstance(t, dict)
    }
    stype = (scope_type or "").strip()
    sname = (scope_name or "").strip().lower()
    if stype == "character":
        # First thread for this character → leave it to mirror the character.
        prior = sum(
            1 for t in existing
            if isinstance(t, dict)
            and (t.get("scope") or {}).get("type") == "character"
            and str((t.get("scope") or {}).get("name") or "").strip().lower() == sname
        )
        if prior == 0:
            return None
    for c in _THREAD_COLOR_PALETTE:
        if c.lower() not in used:
            return c
    # Palette exhausted — cycle by count so successive threads still vary.
    return _THREAD_COLOR_PALETTE[len(used) % len(_THREAD_COLOR_PALETTE)]



# ---------------------------------------------------------------------------- #
# Grand outline
#
# Stored as rows: Act → Chapter → Scene → OutlineBeat, prose in SceneContent
# (models/outline.py). The app still works with ONE nested dict:
#   {base_template, acts: [{id, text, chapters: [{id, text, pov, scenes: [
#       {id, text, words, content, analysis, entity_links, mention_counts,
#        beats: [...]}]}]}]}
# load_outline builds it (one query per table); save_outline syncs a whole dict
# back, writing only the rows that changed. The row-by-row conversion is in
# outline_rows.py.
# ---------------------------------------------------------------------------- #

def _project_row(project_id, *fields):
    from projects.models import Project
    return Project.objects.filter(pk=project_id).values(*fields).first()


_CHAPTER_COLS = ("id", "act_id", "uid", "title", "pov_mode", "pov_name", "pov_character_id",
                 "pov_character__name", "created_at", "updated_at", "extra")
_SCENE_COLS = ("id", "chapter_id", "uid", "title", "words", "analysis", "entity_links",
               "mention_counts", "created_at", "updated_at", "extra")
_BEAT_COLS = ("scene_id", "uid", "kind", "text", "written", "thread__uid", "thread_beat__uid",
              "created_at", "updated_at", "extra")


def _scenes_by_chapter(scenes, beats, docs: dict) -> dict:
    """Scene dicts (with their beats and, if in `docs`, their prose), grouped by
    chapter pk, in the order given."""
    beats_by: dict = defaultdict(list)
    for b in beats:
        beats_by[b["scene_id"]].append(rows.beat_dict(b))
    scenes_by: dict = defaultdict(list)
    for s in scenes:
        sid = s["id"]
        scenes_by[s["chapter_id"]].append(
            rows.scene_dict(s, beats_by.get(sid, []), docs.get(sid), sid in docs))
    return scenes_by


def load_outline(ctx, *, include_prose: bool = True) -> dict:
    """The project's grand outline as one nested dict ({} if it has none).

    `include_prose=False` leaves every scene's `content` (its prose) out and
    never reads the SceneContent table: for screens that show structure only.
    POV names come from the linked character's CURRENT name."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return {}
    proj = _project_row(project_id, "outline_base_template")
    if proj is None:
        return {}
    acts = list(Act.objects.filter(project_id=project_id).order_by("position", "id").values(
        "id", "uid", "title", "created_at", "updated_at", "extra"))
    base = proj["outline_base_template"]
    if not acts and not base:
        return {}
    chapters = Chapter.objects.filter(project_id=project_id).order_by("position", "id").values(
        *_CHAPTER_COLS)
    scenes = Scene.objects.filter(project_id=project_id).order_by("position", "id").values(
        *_SCENE_COLS)
    beats = OutlineBeat.objects.filter(scene__project_id=project_id).order_by("position", "id").values(
        *_BEAT_COLS)
    docs = (dict(SceneContent.objects.filter(scene__project_id=project_id)
                 .values_list("scene_id", "doc"))
            if include_prose else {})

    scenes_by = _scenes_by_chapter(scenes, beats, docs)
    chapters_by: dict = defaultdict(list)
    for c in chapters:
        chapters_by[c["act_id"]].append(rows.chapter_dict(c, scenes_by.get(c["id"], [])))
    out: dict = {"base_template": base} if base else {}
    out["acts"] = [rows.act_dict(a, chapters_by.get(a["id"], [])) for a in acts]
    return out


def outline_has_acts(ctx) -> bool:
    """True if the project's outline has at least one act."""
    project_id = getattr(ctx, "project_id", None)
    return bool(project_id) and Act.objects.filter(project_id=project_id).exists()


def _chapter_with_scenes(chapter: dict, include_prose: bool) -> dict:
    scenes = list(Scene.objects.filter(chapter_id=chapter["id"])
                  .order_by("position", "id").values(*_SCENE_COLS))
    pks = [sc["id"] for sc in scenes]
    beats = OutlineBeat.objects.filter(scene_id__in=pks).order_by("position", "id").values(*_BEAT_COLS)
    docs = (dict(SceneContent.objects.filter(scene_id__in=pks).values_list("scene_id", "doc"))
            if include_prose else {})
    return rows.chapter_dict(chapter, _scenes_by_chapter(scenes, beats, docs).get(chapter["id"], []))


def load_chapter(ctx, chapter_uid, *, include_prose: bool = False) -> dict | None:
    """ONE chapter as the same dict `load_outline` nests (`{id, text, pov,
    scenes: [...]}`), read by id. None if the project has no such chapter.
    Reads only this chapter's rows (series scale)."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id or not chapter_uid:
        return None
    chapter = (Chapter.objects.filter(project_id=project_id, uid=str(chapter_uid))
               .values(*_CHAPTER_COLS).first())
    return None if chapter is None else _chapter_with_scenes(chapter, include_prose)


def load_chapter_of_scene(ctx, scene_uid, *, include_prose: bool = False) -> dict | None:
    """The chapter (as `load_chapter` returns it) that holds scene `scene_uid`.
    None if the project has no such scene."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id or not scene_uid:
        return None
    chapter_pk = (Scene.objects.filter(project_id=project_id, uid=str(scene_uid))
                  .values_list("chapter_id", flat=True).first())
    if chapter_pk is None:
        return None
    chapter = Chapter.objects.filter(pk=chapter_pk).values(*_CHAPTER_COLS).first()
    return None if chapter is None else _chapter_with_scenes(chapter, include_prose)


def load_scene(ctx, scene_uid, *, include_prose: bool = True) -> dict | None:
    """ONE scene as the same dict `load_outline` nests (`{id, text, words,
    content, beats, ...}`), read by id. None if the project has no such scene.
    Reads only this scene's rows (series scale)."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id or not scene_uid:
        return None
    scene = (Scene.objects.filter(project_id=project_id, uid=str(scene_uid))
             .values(*_SCENE_COLS).first())
    if scene is None:
        return None
    beats = OutlineBeat.objects.filter(scene_id=scene["id"]).order_by("position", "id").values(*_BEAT_COLS)
    docs = (dict(SceneContent.objects.filter(scene_id=scene["id"]).values_list("scene_id", "doc"))
            if include_prose else {})
    return _scenes_by_chapter([scene], beats, docs)[scene["chapter_id"]][0]


def load_chapter_prose(ctx, chapter_uid) -> dict | None:
    """One chapter with its scenes in order, each with its prose:
    `{id, title, scenes: [{id, title, content, rev}]}` (`content` None and
    `rev` 0 for a scene with no prose yet). None if the project has no chapter
    with that id.

    Reads only this chapter's SceneContent rows, so the Write page can open a
    chapter without loading the whole book's prose (series scale)."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id or not chapter_uid:
        return None
    chapter = (Chapter.objects.filter(project_id=project_id, uid=str(chapter_uid))
               .values("id", "uid", "title").first())
    if chapter is None:
        return None
    scenes = list(Scene.objects.filter(chapter_id=chapter["id"]).order_by("position", "id")
                  .values_list("id", "uid", "title"))
    docs = {sid: (doc, rev) for sid, doc, rev in SceneContent.objects.filter(
        scene_id__in=[pk for pk, _, _ in scenes]).values_list("scene_id", "doc", "rev")}
    return {
        "id": chapter["uid"],
        "title": chapter["title"],
        "scenes": [{"id": uid, "title": title, "content": docs.get(pk, (None, 0))[0],
                    "rev": docs.get(pk, (None, 0))[1]} for pk, uid, title in scenes],
    }


def _unique_uid(raw: dict, prefix: str, seen: set) -> str:
    """The item's id, unique among `seen`. A missing id is minted; a repeated
    one is re-minted (never dropped: the second copy may hold the author's
    writing). Either way the new id is written back into `raw`."""
    uid = str(raw.get("id") or "").strip()
    if not uid or uid in seen:
        if uid:
            logger.warning("outline: duplicate id %r, giving the copy a new id", uid)
        uid = new_id(prefix, taken=seen.__contains__)
        raw["id"] = uid
    seen.add(uid)
    return uid


class _Links:
    """Looks up the thread / thread beat an outline beat's `from_rough` /
    `from_item` points at. Loads the project's threads only when first asked."""

    def __init__(self, project_id):
        self.project_id = project_id
        self.threads = None

    def _load(self):
        self.threads = dict(PlotThread.objects.filter(project_id=self.project_id)
                            .values_list("uid", "id"))
        self.beats: dict = {}
        self.beats_by_uid: dict = defaultdict(list)
        for tid, uid, pk in ThreadBeat.objects.filter(
                thread__project_id=self.project_id).values_list("thread_id", "uid", "id"):
            self.beats[(tid, uid)] = pk
            self.beats_by_uid[uid].append(pk)

    def __call__(self, rough, item):
        if not rough and not item:
            return None, None
        if self.threads is None:
            self._load()
        thread_id = self.threads.get(rough) if rough else None
        beat_id = None
        if item:
            if thread_id is not None:
                beat_id = self.beats.get((thread_id, item))
            elif not rough and len(self.beats_by_uid.get(item, ())) == 1:
                beat_id = self.beats_by_uid[item][0]
        return thread_id, beat_id


def _character_check(project_id):
    """A cached "is this a character of this project?" test for POV links."""
    ids = None

    def ok(cid) -> bool:
        nonlocal ids
        if ids is None:
            from characters.models import Character
            ids = set(Character.all_objects.filter(project_id=project_id)
                      .values_list("id", flat=True))
        return cid in ids
    return ok


def _children(raw: dict, key: str) -> list:
    items = raw.get(key)
    return [x for x in items if isinstance(x, dict)] if isinstance(items, list) else []


def save_outline(ctx, outline: dict) -> None:
    """Make the project's outline rows match `outline` (the whole nested dict),
    in one transaction. Unchanged rows are not written; new items are
    inserted; items missing from the dict are deleted (a deleted scene takes
    its prose and its prose history with it).

    Prose: a scene whose `content` changed gets its SceneContent row updated
    and `rev` + 1. A scene dict with NO `content` key leaves the stored prose
    alone (a lean read saved back must never wipe the manuscript).

    Also rolls word / act / chapter / scene totals onto the Project row."""
    project_id = getattr(ctx, "project_id", None)
    if not project_id or not isinstance(outline, dict):
        return
    unknown = set(outline) - {"base_template", "acts"}
    if unknown:
        logger.warning("save_outline project=%s: dropping unknown top-level keys %s",
                       project_id, sorted(unknown))
    with transaction.atomic():
        proj = _project_row(project_id, "outline_base_template", *_TOTAL_FIELDS)
        if proj is None:
            return
        old_acts = {o.uid: o for o in Act.objects.filter(project_id=project_id)}
        old_chapters = {o.uid: o for o in Chapter.objects.filter(project_id=project_id)}
        old_scenes = {o.uid: o for o in Scene.objects.filter(project_id=project_id)}
        old_beats = {(o.scene_id, o.uid): o
                     for o in OutlineBeat.objects.filter(scene__project_id=project_id)}
        old_docs = {sid: (pk, h) for pk, sid, h in SceneContent.objects.filter(
            scene__project_id=project_id).values_list("id", "scene_id", "doc_hash")}
        links = _Links(project_id)
        character_ok = _character_check(project_id)

        def sync(model, old: dict, key, fields: dict, new: list, **create):
            obj = old.get(key)
            if obj is None:
                obj = model(**create, **fields)
                new.append(obj)
            else:
                _apply(obj, fields)
            return obj

        # One pass per level, so each level's new rows get their ids (one bulk
        # insert) before their children point at them.
        seen: set = set()
        new: list = []
        acts = []
        for pos, raw in enumerate(_children(outline, "acts")):
            uid = _unique_uid(raw, "ac", seen)
            acts.append((raw, sync(Act, old_acts, uid, rows.act_fields(raw, pos), new,
                                   project_id=project_id, uid=uid)))
        Act.objects.bulk_create(new)
        keep_acts = seen

        seen, new, chapters = set(), [], []
        for raw_act, act in acts:
            for pos, raw in enumerate(_children(raw_act, "chapters")):
                uid = _unique_uid(raw, "ch", seen)
                fields = {"act_id": act.pk, **rows.chapter_fields(raw, pos, character_ok)}
                chapters.append((raw, sync(Chapter, old_chapters, uid, fields, new,
                                           project_id=project_id, uid=uid)))
        Chapter.objects.bulk_create(new)
        keep_chapters = seen

        seen, new, scenes = set(), [], []
        for raw_ch, chapter in chapters:
            for pos, raw in enumerate(_children(raw_ch, "scenes")):
                uid = _unique_uid(raw, "sc", seen)
                fields = {"chapter_id": chapter.pk, **rows.scene_fields(raw, pos)}
                has_doc, doc = rows.scene_doc(raw)
                if has_doc:  # no prose given → the stored counts stay as they are
                    fields["mention_counts"] = rows.mention_counts(doc)
                scenes.append((raw, sync(Scene, old_scenes, uid, fields, new,
                                         project_id=project_id, uid=uid)))
        Scene.objects.bulk_create(new)
        keep_scenes = seen

        new, new_docs, keep_beats = [], [], set()
        for raw_sc, scene in scenes:
            has_doc, doc = rows.scene_doc(raw_sc)
            if has_doc:
                _sync_doc(scene, doc, old_docs.get(scene.pk), new_docs)
            seen = set()
            for pos, raw in enumerate(_children(raw_sc, "beats")):
                uid = _unique_uid(raw, "bt", seen)
                keep_beats.add((scene.pk, uid))
                sync(OutlineBeat, old_beats, (scene.pk, uid),
                     rows.beat_fields(raw, pos, links), new, scene_id=scene.pk, uid=uid)
        SceneContent.objects.bulk_create(new_docs)
        OutlineBeat.objects.bulk_create(new)

        # Deletes, children first. Moved items were re-parented above, so
        # deleting an old parent never takes a moved child with it.
        _delete(OutlineBeat, [o.pk for k, o in old_beats.items() if k not in keep_beats])
        _delete(Scene, [o.pk for k, o in old_scenes.items() if k not in keep_scenes])
        _delete(Chapter, [o.pk for k, o in old_chapters.items() if k not in keep_chapters])
        _delete(Act, [o.pk for k, o in old_acts.items() if k not in keep_acts])

        base = outline.get("base_template")
        changes = {"outline_base_template": "" if base is None else str(base)[:50],
                   **_outline_totals(outline)}
        changes = {k: v for k, v in changes.items() if proj[k] != v}
        if changes:
            from projects.models import Project
            Project.objects.filter(pk=project_id).update(**changes)


def _sync_doc(scene: Scene, doc, old, new: list) -> None:
    """Write the scene's prose only if it changed; each change bumps `rev`."""
    h = rows.content_hash(doc)
    if old is None:
        new.append(SceneContent(scene=scene, doc=doc, doc_hash=h, rev=1))
    elif old[1] != h:
        SceneContent.objects.filter(pk=old[0]).update(doc=doc, doc_hash=h, rev=F("rev") + 1)


def _delete(model, pks: list) -> None:
    if pks:
        model.objects.filter(pk__in=pks).delete()


_TOTAL_FIELDS = ("total_acts", "total_chapters", "total_scenes", "total_word_count")



def _outline_totals(outline: dict) -> dict:
    """Count acts/chapters/scenes and sum each scene's stored `words`.

    Uses only the in-memory outline dict (series scale: never recount prose).
    A scene with no `words` counts as 0.
    """
    acts = chapters = scenes = words = 0
    for act in _children(outline or {}, "acts"):
        acts += 1
        for ch in _children(act, "chapters"):
            chapters += 1
            for sc in _children(ch, "scenes"):
                scenes += 1
                w = sc.get("words")
                words += w if isinstance(w, int) and not isinstance(w, bool) else 0
    return {
        "total_acts": acts,
        "total_chapters": chapters,
        "total_scenes": scenes,
        "total_word_count": words,
    }


# ---- outline settings (Project columns) ------------------------------------ #

def load_pov_default(ctx) -> dict:
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return {}
    proj = _project_row(project_id, "pov_default")
    data = proj["pov_default"] if proj else None
    if not isinstance(data, dict):
        return {}
    _refresh_pov_names(project_id, [data])
    return data


def save_pov_default(ctx, pov: dict) -> None:
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return
    from projects.models import Project
    Project.objects.filter(pk=project_id).update(pov_default=pov)


def load_scene_pipelines(ctx) -> dict:
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return {}
    proj = _project_row(project_id, "scene_pipelines")
    data = proj["scene_pipelines"] if proj else None
    return data if isinstance(data, dict) else {}


def save_scene_pipelines(ctx, switches: dict) -> None:
    project_id = getattr(ctx, "project_id", None)
    if not project_id:
        return
    from projects.models import Project
    Project.objects.filter(pk=project_id).update(scene_pipelines=switches)
