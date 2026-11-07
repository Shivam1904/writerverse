"""Phase 4b, step 1 of 3: create the outline tables (Act → Chapter → Scene →
OutlineBeat, SceneContent) next to the old OutlineStore blob, and a temporary
`scene_ref` link on SceneRevision. 0014 copies the data, 0015 drops the old."""
import django.db.models.deletion
from django.db import migrations, models


def _stamps():
    return [
        ("created_at", models.DateTimeField(blank=True, null=True)),
        ("updated_at", models.DateTimeField(blank=True, null=True)),
        ("extra", models.JSONField(blank=True, default=dict)),
    ]


def _pk():
    return ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"))


class Migration(migrations.Migration):

    dependencies = [
        ("characters", "0019_trim_indexes"),
        ("outline", "0012_plotthread_character"),
        ("projects", "0018_outline_settings"),
    ]

    operations = [
        migrations.CreateModel(
            name="Act",
            fields=[
                _pk(),
                ("project", models.ForeignKey(
                    db_index=False, on_delete=django.db.models.deletion.CASCADE,
                    related_name="outline_acts", to="projects.project")),
                ("uid", models.CharField(max_length=100)),
                ("title", models.TextField(blank=True, null=True)),
                ("position", models.PositiveIntegerField(default=0)),
                *_stamps(),
            ],
            options={"db_table": "outline_act", "ordering": ["position", "id"]},
        ),
        migrations.CreateModel(
            name="Chapter",
            fields=[
                _pk(),
                ("project", models.ForeignKey(
                    db_index=False, on_delete=django.db.models.deletion.CASCADE,
                    related_name="outline_chapters", to="projects.project")),
                ("act", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name="chapters",
                    to="outline.act")),
                ("uid", models.CharField(max_length=100)),
                ("title", models.TextField(blank=True, null=True)),
                ("position", models.PositiveIntegerField(default=0)),
                ("pov_mode", models.CharField(blank=True, max_length=40, null=True)),
                ("pov_name", models.CharField(blank=True, max_length=200)),
                ("pov_character", models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="pov_chapters", to="characters.character")),
                *_stamps(),
            ],
            options={"db_table": "outline_chapter", "ordering": ["position", "id"]},
        ),
        migrations.CreateModel(
            name="Scene",
            fields=[
                _pk(),
                ("project", models.ForeignKey(
                    db_index=False, on_delete=django.db.models.deletion.CASCADE,
                    related_name="outline_scenes", to="projects.project")),
                ("chapter", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name="scenes",
                    to="outline.chapter")),
                ("uid", models.CharField(max_length=100)),
                ("title", models.TextField(blank=True, null=True)),
                ("position", models.PositiveIntegerField(default=0)),
                ("words", models.PositiveIntegerField(blank=True, null=True)),
                ("analysis", models.JSONField(blank=True, null=True)),
                ("entity_links", models.JSONField(blank=True, null=True)),
                *_stamps(),
            ],
            options={"db_table": "outline_scene", "ordering": ["position", "id"]},
        ),
        migrations.CreateModel(
            name="SceneContent",
            fields=[
                _pk(),
                ("scene", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE, related_name="content",
                    to="outline.scene")),
                ("doc", models.JSONField(blank=True, null=True)),
                ("doc_hash", models.CharField(blank=True, max_length=64)),
                ("rev", models.PositiveIntegerField(default=0)),
            ],
            options={"db_table": "outline_scenecontent"},
        ),
        migrations.CreateModel(
            name="OutlineBeat",
            fields=[
                _pk(),
                ("scene", models.ForeignKey(
                    db_index=False, on_delete=django.db.models.deletion.CASCADE,
                    related_name="beats", to="outline.scene")),
                ("uid", models.CharField(max_length=100)),
                ("kind", models.CharField(blank=True, max_length=20, null=True)),
                ("text", models.TextField(blank=True, null=True)),
                ("position", models.PositiveIntegerField(default=0)),
                ("written", models.BooleanField(blank=True, null=True)),
                ("thread", models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="outline_beats", to="outline.plotthread")),
                ("thread_beat", models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="outline_beats", to="outline.threadbeat")),
                *_stamps(),
            ],
            options={"db_table": "outline_outlinebeat", "ordering": ["position", "id"]},
        ),
        migrations.AddConstraint(
            model_name="act",
            constraint=models.UniqueConstraint(fields=("project", "uid"), name="uniq_outline_act_uid"),
        ),
        migrations.AddConstraint(
            model_name="chapter",
            constraint=models.UniqueConstraint(fields=("project", "uid"), name="uniq_outline_chapter_uid"),
        ),
        migrations.AddConstraint(
            model_name="scene",
            constraint=models.UniqueConstraint(fields=("project", "uid"), name="uniq_outline_scene_uid"),
        ),
        migrations.AddConstraint(
            model_name="outlinebeat",
            constraint=models.UniqueConstraint(fields=("scene", "uid"), name="uniq_outline_beat_uid"),
        ),
        migrations.AddField(
            model_name="scenerevision",
            name="scene_ref",
            field=models.ForeignKey(
                null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name="+", to="outline.scene"),
        ),
    ]
