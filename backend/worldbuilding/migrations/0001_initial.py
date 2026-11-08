import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('projects', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Worldbuilding',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(help_text='Worldbuilding title', max_length=200)),
                ('content', models.TextField(blank=True, help_text='Worldbuilding content/description')),
                ('pnote', models.TextField(blank=True, help_text='Planning note')),
                ('summary', models.TextField(blank=True, help_text='Summary')),
                ('tags', models.JSONField(blank=True, default=list, help_text='List of tag strings for categorization')),
                ('extracted_rules', models.JSONField(blank=True, default=list, help_text='Atomic world rules extracted by AI from content. Read-only — managed by World Rule Extractor.')),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('in-progress', 'In Progress'), ('completed', 'Completed'), ('archived', 'Archived')], default='draft', help_text='Worldbuilding status', max_length=15)),
                ('order', models.PositiveIntegerField(default=0, help_text='Display order for the worldbuilding')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='worldbuildings', to='projects.project')),
            ],
            options={
                'ordering': ['order', '-created_at'],
                'db_table': 'planning_worldbuilding',
            },
        ),
        migrations.AddIndex(
            model_name='worldbuilding',
            index=models.Index(fields=['project'], name='planning_wo_project_7c2ed1_idx'),
        ),
        migrations.AddIndex(
            model_name='worldbuilding',
            index=models.Index(fields=['project', 'created_at'], name='planning_wo_project_c1b810_idx'),
        ),
        migrations.AddIndex(
            model_name='worldbuilding',
            index=models.Index(fields=['project', 'order'], name='planning_wo_project_c9b3f2_idx'),
        ),
        migrations.AddIndex(
            model_name='worldbuilding',
            index=models.Index(fields=['project', 'status'], name='planning_wo_project_5b4f6b_idx'),
        ),
    ]
