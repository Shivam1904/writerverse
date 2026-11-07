"""Proposal.thread (FK to night_eyes.ChatThread) becomes a plain thread_id UUID.

The column keeps its name, type and data: drop the FK constraint, then swap the
field in Django's state only. The kernel table no longer depends on chat.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('consistency', '0016_alter_proposal_source'),
    ]

    operations = [
        migrations.AlterField(
            model_name='proposal',
            name='thread',
            field=models.ForeignKey(
                blank=True, null=True, db_index=False, db_constraint=False,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='proposals', to='night_eyes.chatthread',
                to_field='thread_id',
            ),
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RemoveIndex(
                    model_name='proposal',
                    name='consistency_thread__02df57_idx',
                ),
                migrations.RemoveField(
                    model_name='proposal',
                    name='thread',
                ),
                migrations.AddField(
                    model_name='proposal',
                    name='thread_id',
                    field=models.UUIDField(blank=True, null=True),
                ),
                migrations.AddIndex(
                    model_name='proposal',
                    index=models.Index(fields=['thread_id', 'status'], name='consistency_thread__02df57_idx'),
                ),
            ],
        ),
    ]
