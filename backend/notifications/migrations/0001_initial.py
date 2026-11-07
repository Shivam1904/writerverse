import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("projects", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True,
                                           serialize=False, verbose_name="ID")),
                ("title", models.CharField(blank=True, max_length=200)),
                ("content", models.TextField(blank=True)),
                ("target_url", models.CharField(blank=True, max_length=512)),
                ("slug", models.CharField(blank=True, max_length=64)),
                ("status", models.CharField(
                    choices=[("active", "Active"), ("archived", "Archived")],
                    default="active",
                    max_length=16,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("project", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="notifications",
                    to="projects.project",
                )),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(
                        fields=["project", "status", "-created_at"],
                        name="notificatio_project_0f7a3b_idx",
                    ),
                ],
            },
        ),
    ]
