import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('outline', '0001_initial'),
        ('projects', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SceneGenerationDiff',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('original_content', models.TextField(help_text='Original scene content before generation')),
                ('generated_content', models.TextField(help_text='AI-generated content')),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('line_differences', models.JSONField(blank=True, default=list)),
                ('line_acceptance', models.JSONField(blank=True, default=dict)),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('reviewing', 'Reviewing'),
                        ('accepted', 'Accepted'),
                        ('rejected', 'Rejected'),
                        ('partial', 'Partially Accepted'),
                    ],
                    default='pending',
                    max_length=20,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('scene', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='generation_diffs',
                    to='outline.outline',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='OutlineGenerationDiff',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('generated_outline', models.JSONField(blank=True, default=dict)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('line_differences', models.JSONField(blank=True, default=list)),
                ('line_acceptance', models.JSONField(blank=True, default=dict)),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('reviewing', 'Reviewing'),
                        ('accepted', 'Accepted'),
                        ('rejected', 'Rejected'),
                        ('partial', 'Partially Accepted'),
                    ],
                    default='pending',
                    max_length=20,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('project', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='outline_generation_diffs',
                    to='projects.project',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='scenegenerationdiff',
            index=models.Index(fields=['scene', 'status'], name='outline_sce_scene_i_status_idx'),
        ),
        migrations.AddIndex(
            model_name='scenegenerationdiff',
            index=models.Index(fields=['scene', 'created_at'], name='outline_sce_scene_i_creat_idx'),
        ),
        migrations.AddIndex(
            model_name='outlinegenerationdiff',
            index=models.Index(fields=['project', 'status'], name='outline_gen_project_status_idx'),
        ),
        migrations.AddIndex(
            model_name='outlinegenerationdiff',
            index=models.Index(fields=['project', 'created_at'], name='outline_gen_project_creat_idx'),
        ),
    ]
