from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("characters", "0014_remove_entitymention_scene"),
    ]

    operations = [
        migrations.DeleteModel(
            name="EntityMention",
        ),
    ]
