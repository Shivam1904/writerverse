from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0017_drop_story_columns"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="outline_base_template",
            field=models.CharField(
                blank=True, max_length=50,
                help_text="The structure the outline was started from (e.g. three_act). Blank = no outline yet.",
            ),
        ),
        migrations.AddField(
            model_name="project",
            name="pov_default",
            field=models.JSONField(
                blank=True, default=dict,
                help_text="POV a new chapter starts with: {mode, character, character_id?}.",
            ),
        ),
        migrations.AddField(
            model_name="project",
            name="scene_pipelines",
            field=models.JSONField(
                blank=True, default=dict,
                help_text="On/off switch per scene analysis pipeline: {<key>: bool}.",
            ),
        ),
    ]
