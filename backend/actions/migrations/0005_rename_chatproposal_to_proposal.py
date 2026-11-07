# Hand-edited from auto-generated CREATE/DELETE shape into a proper rename +
# additive migration. Auto-generated form (CreateModel(Proposal) +
# DeleteModel(ChatProposal)) would drop the existing rows; we keep them
# instead. Phase-2 / Night Eyes rename — see PROGRESS.md row 2r.

import django.db.models.deletion
from django.db import migrations, models


def _backfill_project_from_thread(apps, schema_editor):
    """For every existing chat-originated Proposal (carried over from
    ChatProposal), populate the new `project` denormalised FK from the
    linked thread's project. Source defaults to 'chat' via the column
    default; `page` is backfilled from the thread's `page` column."""
    Proposal = apps.get_model("consistency", "Proposal")
    for p in Proposal.objects.select_related("thread").all():
        if p.thread is not None:
            p.project_id = p.thread.project_id
            p.page = p.thread.page or ""
            p.save(update_fields=["project_id", "page"])


def _noop_reverse(apps, schema_editor):
    # Reversing the rename loses `project` / `source` / `page` columns
    # anyway, so reverse-backfill is meaningless.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("consistency", "0004_chatthread_read_baseline"),
        ("projects", "0004_add_ai_tool_settings_to_project"),
    ]

    operations = [
        # 1. Rename the table (preserves all existing rows + their data).
        migrations.RenameModel(
            old_name="ChatProposal",
            new_name="Proposal",
        ),
        # 2. Loosen the thread FK so button / cron paths can leave it null.
        migrations.AlterField(
            model_name="proposal",
            name="thread",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="proposals",
                to="consistency.chatthread",
                to_field="thread_id",
            ),
        ),
        # 3. Add the new denormalised + metadata fields, nullable so the
        #    AddField can run without a default round-trip on existing rows.
        migrations.AddField(
            model_name="proposal",
            name="project",
            field=models.ForeignKey(
                null=True,  # temporarily nullable to allow the add; backfilled next
                on_delete=django.db.models.deletion.CASCADE,
                related_name="proposals",
                to="projects.project",
            ),
        ),
        migrations.AddField(
            model_name="proposal",
            name="source",
            field=models.CharField(
                choices=[
                    ("chat", "Chat"),
                    ("button", "Button"),
                    ("cron", "Cron"),
                    ("suggestion", "Suggestion"),
                ],
                default="chat",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="proposal",
            name="page",
            field=models.CharField(blank=True, max_length=64),
        ),
        # 4. Backfill the new `project` from the chat thread's project on
        #    every existing row, then tighten the FK to non-null.
        migrations.RunPython(_backfill_project_from_thread, _noop_reverse),
        migrations.AlterField(
            model_name="proposal",
            name="project",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="proposals",
                to="projects.project",
            ),
        ),
        # 5. New composite index for the rehydration endpoint
        #    (`WHERE project_id = ? AND status = 'PROPOSED'`).
        migrations.AddIndex(
            model_name="proposal",
            index=models.Index(
                fields=["project", "status"],
                name="consistency_project_209686_idx",
            ),
        ),
    ]
