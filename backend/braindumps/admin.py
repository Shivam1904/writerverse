from django.contrib import admin
from django.db.models import JSONField
from django_json_widget.widgets import JSONEditorWidget
from unfold.admin import ModelAdmin

from .models import Braindump


@admin.register(Braindump)
class BraindumpAdmin(ModelAdmin):
    formfield_overrides = {
        JSONField: {'widget': JSONEditorWidget},
    }
    list_display = ('id', 'title', 'project', 'pinned', 'created_at', 'deleted_at')
    list_filter = ('pinned', 'project', ('deleted_at', admin.EmptyFieldListFilter))
    search_fields = ('title', 'content', 'project__title')
    ordering = ('project', '-created_at')
    raw_id_fields = ('project',)

    def get_queryset(self, request):
        # Show soft-deleted ideas too (clear `deleted_at` to restore one by hand).
        return Braindump.all_objects.select_related('project')

