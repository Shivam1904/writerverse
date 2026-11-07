from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("outline", "0007_delete_dead_outline_models"),
    ]

    operations = [
        migrations.DeleteModel(
            name="EntityLink",
        ),
        migrations.DeleteModel(
            name="OutlineGenerationDiff",
        ),
    ]
