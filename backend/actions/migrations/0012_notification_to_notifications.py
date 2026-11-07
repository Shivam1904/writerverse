from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("consistency", "0011_chatthread_to_night_eyes"),
        ("notifications", "0001_initial"),
    ]

    operations = [
        migrations.DeleteModel(name="Notification"),
    ]
