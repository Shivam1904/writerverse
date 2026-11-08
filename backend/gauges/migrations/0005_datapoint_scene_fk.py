"""GaugeDataPoint.scene_uid (text) → GaugeDataPoint.scene (a real link to
outline.Scene, deleted with the scene).

Fills the link by matching (project, uid). A point whose scene no longer
exists is dropped; a point with no scene uid (a tick that is not a scene) is
kept with no link.
"""
import django.db.models.deletion
from django.db import migrations, models


def link_scenes(apps, schema_editor):
    Point = apps.get_model("gauges", "GaugeDataPoint")
    Scene = apps.get_model("outline", "Scene")
    points = (Point.objects.exclude(scene_uid="")
              .values_list("id", "scene_uid", "analysis__binding__project_id"))
    scenes = {}
    for pk, uid, project_id in points.iterator():
        key = (project_id, uid)
        if key not in scenes:
            scenes[key] = (Scene.objects.filter(project_id=project_id, uid=uid)
                           .values_list("id", flat=True).first())
        if scenes[key] is None:
            Point.objects.filter(pk=pk).delete()
        else:
            Point.objects.filter(pk=pk).update(scene_id=scenes[key])


class Migration(migrations.Migration):

    dependencies = [
        ("gauges", "0004_delete_gaugestore"),
        ("outline", "0015_drop_outlinestore"),
    ]

    operations = [
        migrations.AddField(
            model_name="gaugedatapoint",
            name="scene",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="gauge_points", to="outline.scene",
            ),
        ),
        migrations.RunPython(link_scenes, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="gaugedatapoint",
            name="scene_uid",
        ),
    ]
