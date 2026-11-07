import django.db.models.deletion
from django.db import migrations, models


def copy_chatthreads(apps, schema_editor):
    ConsistencyChatThread = apps.get_model('consistency', 'ChatThread')
    NightEyesChatThread = apps.get_model('night_eyes', 'ChatThread')
    
    threads_to_create = []
    for old_thread in ConsistencyChatThread.objects.all():
        threads_to_create.append(NightEyesChatThread(
            id=old_thread.id,
            thread_id=old_thread.thread_id,
            title=old_thread.title,
            page=old_thread.page,
            read_baseline=old_thread.read_baseline,
            created_at=old_thread.created_at,
            last_message_at=old_thread.last_message_at,
            project_id=old_thread.project_id,
        ))
    if threads_to_create:
        NightEyesChatThread.objects.bulk_create(threads_to_create)
        
        # Reset serial sequence on PostgreSQL
        if schema_editor.connection.vendor == 'postgresql':
            with schema_editor.connection.cursor() as cursor:
                cursor.execute(
                    "SELECT setval(pg_get_serial_sequence('night_eyes_chatthread', 'id'), coalesce(max(id), 1)) FROM night_eyes_chatthread;"
                )


def reverse_copy_chatthreads(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    """Move ChatThread from consistency to night_eyes.

    Requires night_eyes.0001_initial to have created the night_eyes_chatthread
    table first. Updates Proposal.thread FK to point there, then drops the old
    consistency_chatthread table.
    """

    dependencies = [
        ("consistency", "0010_remove_gauges_field"),
        ("night_eyes", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(copy_chatthreads, reverse_copy_chatthreads),
        migrations.AlterField(
            model_name="proposal",
            name="thread",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="proposals",
                to="night_eyes.chatthread",
                to_field="thread_id",
            ),
        ),
        migrations.DeleteModel(
            name="ChatThread",
        ),
    ]

