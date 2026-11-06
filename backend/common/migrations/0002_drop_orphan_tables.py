"""Drop tables left behind by apps that were removed (`analytics`, `storystate`).

No model or code refers to them; every one was empty when checked on
2026-10-03 (a full backup was taken first). Also forget those apps'
migration history so Django doesn't list them as applied-but-unknown.
"""
from django.db import migrations

ORPHAN_TABLES = [
    "analytics_chapterstats",
    "analytics_projectstats",
    "analytics_storyhealthflag",
    "analytics_objectprovenance",
    "analytics_relationshipstate",
    "analytics_knowledgeevent",
    "analytics_timelineevent",
    "storystate_timelineevent",
    "storystate_knowledgeevent",
    "storystate_relationshipstate",
    "storystate_objectprovenance",
]


def drop_orphans(apps, schema_editor):
    # CASCADE is Postgres-only; other databases (CI's SQLite) never had them.
    cascade = " CASCADE" if schema_editor.connection.vendor == "postgresql" else ""
    for t in ORPHAN_TABLES:
        schema_editor.execute(f'DROP TABLE IF EXISTS "{t}"{cascade};')
    schema_editor.execute(
        "DELETE FROM django_migrations WHERE app IN ('analytics', 'storystate');")


class Migration(migrations.Migration):

    dependencies = [("common", "0001_throttle_cache_table")]

    operations = [
        migrations.RunPython(drop_orphans, migrations.RunPython.noop),
    ]
