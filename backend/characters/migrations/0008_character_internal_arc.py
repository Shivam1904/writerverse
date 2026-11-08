from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("characters", "0007_character_aliases"),
    ]

    operations = [
        migrations.AddField(
            model_name="character",
            name="internal_arc",
            field=models.TextField(
                blank=True,
                default="",
                help_text="The character's internal/emotional arc — the inner belief/need that changes",
            ),
        ),
    ]
