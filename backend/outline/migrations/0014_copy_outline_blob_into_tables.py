"""Phase 4b, step 2 of 3: copy every OutlineStore blob into the new tables.

Per project: acts / chapters / scenes / beats become rows (in order), each
scene's prose becomes its SceneContent row (rev 0), and a beat's
`from_rough` / `from_item` become real links when that thread / thread beat
still exists. `base_template`, `pov_default` and `scene_pipelines` move onto
Project. Prose history (SceneRevision) is linked to its scene row; history of
scenes that no longer exist is dropped (deleting a scene deletes its history).

The item → columns conversion is `outline.outline_rows` (pure functions, also
used by `outline.store.save_outline`), so a later load gives back the same dict.
"""
import uuid
from collections import defaultdict

from django.db import migrations

from outline import outline_rows as rows


def _children(raw, key):
    items = raw.get(key)
    return [x for x in items if isinstance(x, dict)] if isinstance(items, list) else []


def _unique_uid(raw, prefix, seen):
    uid = str(raw.get("id") or "").strip()
    if not uid or uid in seen:
        uid = f"{prefix}-{uuid.uuid4().hex[:8]}"
        while uid in seen:
            uid = f"{prefix}-{uuid.uuid4().hex[:8]}"
    seen.add(uid)
    return uid


def _resolver(PlotThread, ThreadBeat, project_id):
    threads = dict(PlotThread.objects.filter(project_id=project_id).values_list("uid", "id"))
    beats, by_uid = {}, defaultdict(list)
    for tid, uid, pk in ThreadBeat.objects.filter(
            thread__project_id=project_id).values_list("thread_id", "uid", "id"):
        beats[(tid, uid)] = pk
        by_uid[uid].append(pk)

    def resolve(rough, item):
        thread_id = threads.get(rough) if rough else None
        beat_id = None
        if item:
            if thread_id is not None:
                beat_id = beats.get((thread_id, item))
            elif not rough and len(by_uid.get(item, ())) == 1:
                beat_id = by_uid[item][0]
        return thread_id, beat_id
    return resolve


def copy_blobs(apps, schema_editor):
    OutlineStore = apps.get_model("outline", "OutlineStore")
    Project = apps.get_model("projects", "Project")
    Character = apps.get_model("characters", "Character")
    PlotThread = apps.get_model("outline", "PlotThread")
    ThreadBeat = apps.get_model("outline", "ThreadBeat")
    Act = apps.get_model("outline", "Act")
    Chapter = apps.get_model("outline", "Chapter")
    Scene = apps.get_model("outline", "Scene")
    SceneContent = apps.get_model("outline", "SceneContent")
    OutlineBeat = apps.get_model("outline", "OutlineBeat")
    SceneRevision = apps.get_model("outline", "SceneRevision")

    for store in OutlineStore.objects.all().iterator():
        pid = store.project_id
        data = store.data if isinstance(store.data, dict) else {}
        base = data.get("base_template")
        Project.objects.filter(pk=pid).update(
            outline_base_template="" if base is None else str(base)[:50],
            pov_default=store.pov_default if isinstance(store.pov_default, dict) else {},
            scene_pipelines=store.scene_pipelines if isinstance(store.scene_pipelines, dict) else {},
        )
        char_ids = set(Character.objects.filter(project_id=pid).values_list("id", flat=True))
        resolve = _resolver(PlotThread, ThreadBeat, pid)

        seen, acts = set(), []
        for pos, raw in enumerate(_children(data, "acts")):
            acts.append((raw, Act(project_id=pid, uid=_unique_uid(raw, "ac", seen),
                                  **rows.act_fields(raw, pos))))
        Act.objects.bulk_create([a for _, a in acts])

        seen, chapters = set(), []
        for raw_act, act in acts:
            for pos, raw in enumerate(_children(raw_act, "chapters")):
                chapters.append((raw, Chapter(
                    project_id=pid, act_id=act.pk, uid=_unique_uid(raw, "ch", seen),
                    **rows.chapter_fields(raw, pos, char_ids.__contains__))))
        Chapter.objects.bulk_create([c for _, c in chapters])

        seen, scenes = set(), []
        for raw_ch, chapter in chapters:
            for pos, raw in enumerate(_children(raw_ch, "scenes")):
                scenes.append((raw, Scene(
                    project_id=pid, chapter_id=chapter.pk, uid=_unique_uid(raw, "sc", seen),
                    **rows.scene_fields(raw, pos))))
        Scene.objects.bulk_create([s for _, s in scenes])

        docs, beats = [], []
        for raw_sc, scene in scenes:
            has_doc, doc = rows.scene_doc(raw_sc)
            if has_doc:
                docs.append(SceneContent(scene_id=scene.pk, doc=doc,
                                         doc_hash=rows.content_hash(doc), rev=0))
            seen = set()
            for pos, raw in enumerate(_children(raw_sc, "beats")):
                beats.append(OutlineBeat(scene_id=scene.pk, uid=_unique_uid(raw, "bt", seen),
                                         **rows.beat_fields(raw, pos, resolve)))
        SceneContent.objects.bulk_create(docs, batch_size=200)
        OutlineBeat.objects.bulk_create(beats, batch_size=1000)

        # Totals as save_outline would roll them up.
        totals = {"total_acts": len(acts), "total_chapters": len(chapters),
                  "total_scenes": len(scenes),
                  "total_word_count": sum(s.words or 0 for _, s in scenes)}
        Project.objects.filter(pk=pid).update(**totals)

    # Link each prose-history row to its scene; drop history of gone scenes.
    scene_pk = {(p, u): pk for pk, p, u in Scene.objects.values_list("id", "project_id", "uid")}
    orphans = []
    for rev_pk, pid, sid in SceneRevision.objects.values_list("id", "project_id", "scene_id"):
        pk = scene_pk.get((pid, sid))
        if pk is None:
            orphans.append(rev_pk)
        else:
            SceneRevision.objects.filter(pk=rev_pk).update(scene_ref_id=pk)
    if orphans:
        SceneRevision.objects.filter(pk__in=orphans).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("outline", "0013_outline_tables"),
    ]

    operations = [
        migrations.RunPython(copy_blobs, migrations.RunPython.noop),
    ]
