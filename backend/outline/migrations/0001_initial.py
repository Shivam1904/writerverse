import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('projects', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='OutlineCollection',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(blank=True, help_text='Optional name for this outline collection', max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outline_collections', to='projects.project')),
            ],
            options={
                'ordering': ['-created_at'],
                'db_table': 'planning_outlinecollection',
            },
        ),
        migrations.CreateModel(
            name='Outline',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('type', models.CharField(choices=[('act', 'Act'), ('chapter', 'Chapter'), ('scene', 'Scene')], help_text='Outline item type', max_length=20)),
                ('title', models.CharField(help_text='Outline item title', max_length=200)),
                ('pov', models.CharField(blank=True, help_text='Point of view', max_length=100)),
                ('tense', models.CharField(blank=True, help_text='Tense (past, present, etc.)', max_length=50)),
                ('pnote', models.TextField(blank=True, help_text='Planning note')),
                ('summary', models.TextField(blank=True, help_text='Summary')),
                ('status', models.BooleanField(default=False, help_text='Completion status')),
                ('order', models.PositiveIntegerField(default=1, help_text='Display order')),
                ('content', models.JSONField(blank=True, default=dict, help_text="Scene prose as TipTap/ProseMirror JSON; used when type='scene'")),
                ('word_count', models.PositiveIntegerField(default=0)),
                ('character_count', models.PositiveIntegerField(default=0)),
                ('scene_type', models.CharField(choices=[('action', 'Action'), ('dialogue', 'Dialogue'), ('description', 'Description'), ('transition', 'Transition'), ('flashback', 'Flashback'), ('other', 'Other')], default='other', help_text="Scene classification; used when type='scene'", max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outlines', to='projects.project')),
                ('outline_collection', models.ForeignKey(blank=True, help_text='The outline collection this item belongs to', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='outline_items', to='outline.outlinecollection')),
                ('parent', models.ForeignKey(blank=True, db_column='parent_id', help_text='Parent outline item for hierarchy (act←chapter←scene)', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='children', to='outline.outline')),
            ],
            options={
                'ordering': ['order', 'created_at'],
                'db_table': 'planning_outline',
            },
        ),
        migrations.CreateModel(
            name='Beat',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content', models.TextField(blank=True, help_text='Beat content')),
                ('pnote', models.TextField(blank=True, help_text='Planning note')),
                ('summary', models.TextField(blank=True, help_text='Summary')),
                ('order', models.PositiveIntegerField(default=1, help_text='Display order within outline')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('outline', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='beats', to='outline.outline')),
            ],
            options={
                'ordering': ['order', 'created_at'],
                'db_table': 'planning_beat',
                'unique_together': {('outline', 'order')},
            },
        ),
        migrations.CreateModel(
            name='EntityLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('object_type', models.CharField(choices=[('outline', 'Outline'), ('character', 'Character'), ('scene', 'Scene'), ('chapter', 'Chapter')], help_text='Type of the source object', max_length=50)),
                ('object_id', models.PositiveIntegerField(help_text='ID of the source object')),
                ('link_type', models.CharField(choices=[('braindump', 'Braindump'), ('outline', 'Outline'), ('character', 'Character'), ('worldbuilding', 'Worldbuilding'), ('scene', 'Scene')], help_text='Type of the linked object', max_length=50)),
                ('link_id', models.PositiveIntegerField(help_text='ID of the linked object')),
                ('sync_status', models.CharField(choices=[('synced', 'Synced'), ('pending', 'Pending'), ('failed', 'Failed')], default='synced', help_text='Synchronization status of the link', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['created_at'],
                'db_table': 'entities_entitylink',
                'unique_together': {('object_type', 'object_id', 'link_type', 'link_id')},
            },
        ),
        migrations.CreateModel(
            name='SceneEntityReference',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('entity_type', models.CharField(choices=[('character', 'Character'), ('braindump', 'Braindump'), ('worldbuilding', 'Worldbuilding')], max_length=20)),
                ('entity_id', models.PositiveIntegerField()),
                ('paragraph_index', models.PositiveIntegerField(blank=True, help_text='Paragraph/block index within the scene document (0-based).', null=True)),
                ('doc_path', models.CharField(blank=True, help_text='Opaque path identifier within the TipTap JSON (e.g. block index).', max_length=255)),
                ('snippet', models.TextField(blank=True, help_text='Short text snippet around the reference.')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('scene', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='inline_entity_refs', to='outline.outline')),
            ],
            options={
                'ordering': ['scene_id', 'paragraph_index', 'entity_type', 'entity_id'],
                'db_table': 'entities_sceneentityreference',
            },
        ),
        migrations.AddIndex(
            model_name='outlinecollection',
            index=models.Index(fields=['project', '-created_at'], name='planning_ou_project_5aae3d_idx'),
        ),
        migrations.AddIndex(
            model_name='outline',
            index=models.Index(fields=['project', 'order'], name='planning_ou_project_a3a73d_idx'),
        ),
        migrations.AddIndex(
            model_name='outline',
            index=models.Index(fields=['project', 'type'], name='planning_ou_project_0f1b0e_idx'),
        ),
        migrations.AddIndex(
            model_name='outline',
            index=models.Index(fields=['outline_collection', 'order'], name='planning_ou_outline_a8bf26_idx'),
        ),
        migrations.AddIndex(
            model_name='beat',
            index=models.Index(fields=['outline', 'order'], name='planning_be_outline_cd2e74_idx'),
        ),
        migrations.AddIndex(
            model_name='entitylink',
            index=models.Index(fields=['object_type', 'object_id'], name='entities_en_object__5a17e9_idx'),
        ),
        migrations.AddIndex(
            model_name='entitylink',
            index=models.Index(fields=['link_type', 'link_id'], name='entities_en_link_ty_7f3bf3_idx'),
        ),
        migrations.AddIndex(
            model_name='entitylink',
            index=models.Index(fields=['object_type', 'object_id', 'link_type'], name='entities_en_object__09e3b1_idx'),
        ),
        migrations.AddIndex(
            model_name='sceneentityreference',
            index=models.Index(fields=['entity_type', 'entity_id'], name='entities_sc_entity__e5f5d1_idx'),
        ),
        migrations.AddIndex(
            model_name='sceneentityreference',
            index=models.Index(fields=['scene'], name='entities_sc_scene_i_7a7fba_idx'),
        ),
        migrations.AddIndex(
            model_name='sceneentityreference',
            index=models.Index(fields=['entity_type', 'entity_id', 'scene'], name='entities_sc_entity__0e4aa5_idx'),
        ),
    ]
