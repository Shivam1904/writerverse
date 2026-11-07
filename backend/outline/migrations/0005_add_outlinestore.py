import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("outline", "0004_add_threadstore"),
        ("projects", "0009_alter_project_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="OutlineStore",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("data", models.JSONField(blank=True, default=dict)),
                ("base", models.CharField(default="three_act", max_length=50)),
                ("pov_default", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "project",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="outline_store",
                        to="projects.project",
                    ),
                ),
            ],
            options={
                "db_table": "outline_outlinestore",
            },
        ),
    ]
