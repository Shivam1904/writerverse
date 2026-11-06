from django.db import migrations, models
from django.db.models.functions import Now


def mark_existing_users_verified(apps, schema_editor):
    # Accounts made before verification existed must not be locked out
    # (e.g. the production smoke-test account). New sign-ups start unverified.
    User = apps.get_model('accounts', 'User')
    User.objects.filter(email_verified_at__isnull=True).update(email_verified_at=Now())


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_user_terms_acceptance"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(mark_existing_users_verified, migrations.RunPython.noop),
    ]
