from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("gauges", "0003_copy_gaugestore"),
    ]

    operations = [
        migrations.DeleteModel(
            name="GaugeStore",
        ),
    ]
