"""Create the Postgres table behind the "throttle" cache (see settings.CACHES).

Done as a migration so the production migrate workflow creates it; no manual
`createcachetable` step.
"""
from django.core.management import call_command
from django.db import migrations

TABLE = 'throttle_cache'


def create_table(apps, schema_editor):
    call_command('createcachetable', TABLE, database=schema_editor.connection.alias, verbosity=0)


def drop_table(apps, schema_editor):
    schema_editor.execute(f'DROP TABLE IF EXISTS {schema_editor.quote_name(TABLE)}')


class Migration(migrations.Migration):
    dependencies = []

    operations = [migrations.RunPython(create_table, drop_table)]
