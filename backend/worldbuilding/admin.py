from django.contrib import admin
from django.db.models import JSONField
from django_json_widget.widgets import JSONEditorWidget
from unfold.admin import ModelAdmin

from .models import StoryItem, StoryRule, WorldBlock, Worldbuilding


@admin.register(Worldbuilding)
class WorldbuildingAdmin(ModelAdmin):
    formfield_overrides = {
        JSONField: {'widget': JSONEditorWidget},
    }
    list_display = ('id', 'title', 'project', 'order', 'created_at', 'deleted_at')
    list_filter = ('project', ('deleted_at', admin.EmptyFieldListFilter))
    search_fields = ('title', 'content', 'project__title')
    ordering = ('project', 'order', '-created_at')
    raw_id_fields = ('project',)

    def get_queryset(self, request):
        # Show soft-deleted entries too (clear `deleted_at` to restore one by hand).
        return Worldbuilding.all_objects.select_related('project')


@admin.register(WorldBlock)
class WorldBlockAdmin(ModelAdmin):
    list_display = ('id', 'project', 'name', 'label', 'glyph', 'color', 'updated_at')
    list_filter = ('project',)
    search_fields = ('name', 'label')
    raw_id_fields = ('project',)


@admin.register(StoryItem)
class StoryItemAdmin(ModelAdmin):
    list_display = ('id', 'project', 'name', 'created_at')
    list_filter = ('project',)
    search_fields = ('name', 'description')
    raw_id_fields = ('project',)


@admin.register(StoryRule)
class StoryRuleAdmin(ModelAdmin):
    list_display = ('id', 'project', 'text', 'scope', 'created_at')
    list_filter = ('project',)
    search_fields = ('text',)
    raw_id_fields = ('project',)
