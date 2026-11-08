import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('projects', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Braindump',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(help_text='Braindump title', max_length=200)),
                ('content', models.TextField(blank=True, help_text='Braindump content/description')),
                ('pnote', models.TextField(blank=True, help_text='Planning note')),
                ('summary', models.TextField(blank=True, help_text='Summary')),
                ('tags', models.JSONField(blank=True, default=list, help_text='List of tag strings for categorization')),
                ('ai_data', models.JSONField(blank=True, default=dict, help_text='Full AI annotation payload (phrases, packs, entities, tags, meta). Shape is intentionally loose — written by annotate_braindump.')),
                ('category', models.CharField(choices=[('plot', 'Plot'), ('character', 'Character'), ('world', 'World'), ('dialogue', 'Dialogue'), ('scene', 'Scene'), ('other', 'Other')], default='other', help_text='Braindump category', max_length=20)),
                ('priority', models.CharField(choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High')], default='medium', help_text='Braindump priority level', max_length=10)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('in-progress', 'In Progress'), ('completed', 'Completed'), ('processed', 'Processed'), ('archived', 'Archived')], default='draft', help_text='Braindump status', max_length=15)),
                ('order', models.PositiveIntegerField(default=0, help_text='Display order for the braindump')),
                ('ai_generated', models.BooleanField(default=False, help_text="True when this entry was created by the AI (Night Eyes) rather than typed by the author. Drives the quiet hover-only 'ai' marker; the author still owns the star/highlight.")),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='braindumps', to='projects.project')),
            ],
            options={
                'ordering': ['order', '-created_at'],
                'db_table': 'planning_braindump',
            },
        ),
        migrations.AddIndex(
            model_name='braindump',
            index=models.Index(fields=['project', 'category'], name='planning_br_project_c5fa6c_idx'),
        ),
        migrations.AddIndex(
            model_name='braindump',
            index=models.Index(fields=['project', 'priority'], name='planning_br_project_b93b4b_idx'),
        ),
        migrations.AddIndex(
            model_name='braindump',
            index=models.Index(fields=['project', 'status'], name='planning_br_project_aad9e5_idx'),
        ),
        migrations.AddIndex(
            model_name='braindump',
            index=models.Index(fields=['project', 'created_at'], name='planning_br_project_ce3a18_idx'),
        ),
        migrations.AddIndex(
            model_name='braindump',
            index=models.Index(fields=['project', 'order'], name='planning_br_project_b84a56_idx'),
        ),
    ]
