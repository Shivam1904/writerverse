"""Phase 4b, step 3 of 3: SceneRevision now points at its Scene row (the old
string `scene_id` goes), and the old OutlineStore blob table is dropped."""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("outline", "0014_copy_outline_blob_into_tables"),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name="scenerevision",
            name="outline_sce_project_368e8e_idx",
        ),
        migrations.RemoveField(
            model_name="scenerevision",
            name="scene_id",
        ),
        migrations.RenameField(
            model_name="scenerevision",
            old_name="scene_ref",
            new_name="scene",
        ),
        migrations.AlterField(
            model_name="scenerevision",
            name="scene",
            field=models.ForeignKey(
                db_index=False, on_delete=django.db.models.deletion.CASCADE,
                related_name="revisions", to="outline.scene"),
        ),
        migrations.AlterField(
            model_name="scenerevision",
            name="project",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="scene_revisions", to="projects.project"),
        ),
        migrations.AddIndex(
            model_name="scenerevision",
            index=models.Index(fields=["scene", "-id"], name="outline_scenerev_scene_idx"),
        ),
        migrations.DeleteModel(
            name="OutlineStore",
        ),
    ]
