from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('consistency', '0006_proposal_failed_status'),
    ]

    operations = [
        migrations.RenameField(
            model_name='consistencysession',
            old_name='thoughts',
            new_name='braindumps',
        ),
    ]
