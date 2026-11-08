import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("projects", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChatThread",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("thread_id", models.UUIDField(db_index=True, unique=True)),
                ("title", models.CharField(blank=True, max_length=120)),
                ("page", models.CharField(blank=True, max_length=64)),
                ("read_baseline", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_message_at", models.DateTimeField(auto_now=True)),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="chat_threads",
                        to="projects.project",
                    ),
                ),
            ],
            options={"ordering": ["-last_message_at"]},
        ),
    ]
