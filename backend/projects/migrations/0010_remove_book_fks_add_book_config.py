# Generated manually 2026-06-21
# Adds book_config JSONField to Project.
# (book_metadata/book_style/page_estimate FK fields were removed from 0001_initial
#  when the books app was deleted; this migration only needs to add book_config.)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0009_alter_project_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="book_config",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Book metadata, style, and page-estimate settings merged into one JSON blob.",
            ),
        ),
    ]
