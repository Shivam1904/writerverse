from django.contrib import admin
from django.db.models import JSONField
from django_json_widget.widgets import JSONEditorWidget
from unfold.admin import ModelAdmin

from .models import Character


@admin.register(Character)
class CharacterAdmin(ModelAdmin):
    formfield_overrides = {
        JSONField: {'widget': JSONEditorWidget},
    }
    list_display = ('id', 'name', 'project', 'is_main_character', 'created_at', 'deleted_at')
    list_filter = ('is_main_character', 'is_protagonist', 'is_antagonist', 'project',
                   ('deleted_at', admin.EmptyFieldListFilter))
    search_fields = ('name', 'description', 'project__title')
    ordering = ('project', 'name')
    raw_id_fields = ('project',)

    def get_queryset(self, request):
        # Show soft-deleted characters too (clear `deleted_at` to restore one by hand).
        return Character.all_objects.select_related('project')
