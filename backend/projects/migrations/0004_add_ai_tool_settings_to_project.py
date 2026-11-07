# Generated migration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0003_add_total_acts_to_project'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='ai_tool_settings',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Dev-only settings for toggling AI tools on/off. Shape: {disabled_tools: [], disabled_planners: []}"
            ),
        ),
    ]
