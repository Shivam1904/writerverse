from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("outline", "0006_outlinestore_scene_pipelines"),
        # FK-holders must drop their references before we delete the tables
        ("characters", "0014_remove_entitymention_scene"),
    ]

    operations = [
        # SceneGenerationDiff has FK → Outline; drop first
        migrations.DeleteModel(
            name="SceneGenerationDiff",
        ),
        # SceneEntityReference has FK → Outline; drop next
        migrations.DeleteModel(
            name="SceneEntityReference",
        ),
        # Beat has FK → Outline; drop before Outline
        migrations.DeleteModel(
            name="Beat",
        ),
        # Outline has FK → OutlineCollection (and self-FK parent); drop next
        migrations.DeleteModel(
            name="Outline",
        ),
        # OutlineCollection is now leaf; drop last
        migrations.DeleteModel(
            name="OutlineCollection",
        ),
    ]
