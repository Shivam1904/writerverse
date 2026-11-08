from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("characters", "0013_remove_character_relationships"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="entitymention",
            name="scene",
        ),
    ]
