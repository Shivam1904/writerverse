from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("characters", "0015_delete_entitymention"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="character",
            name="chart_ids",
        ),
    ]
