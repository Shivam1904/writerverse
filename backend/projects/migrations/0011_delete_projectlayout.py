from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0010_remove_book_fks_add_book_config"),
    ]

    operations = [
        migrations.DeleteModel(
            name="ProjectLayout",
        ),
    ]
