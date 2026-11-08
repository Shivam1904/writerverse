"""Copied every GaugeStore blob into the gauge tables (0004 then dropped it).

The copy has run on every database that had GaugeStore rows. It used the live
`gauges.store.save_gauges`, which has changed since (data points now link to
`outline.Scene`), so it is a no-op now: a fresh database has no blobs to copy.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("gauges", "0002_gauge_tables"),
    ]

    operations = [
        migrations.RunPython(migrations.RunPython.noop, migrations.RunPython.noop),
    ]
