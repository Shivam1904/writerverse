from django.contrib import admin
from django.db.models import JSONField
from django_json_widget.widgets import JSONEditorWidget
from unfold.admin import ModelAdmin

from .models import Project


@admin.register(Project)
class ProjectAdmin(ModelAdmin):
    formfield_overrides = {
        JSONField: {'widget': JSONEditorWidget},
    }
    list_display = ('id', 'title', 'user', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('title', 'description', 'user__email')
    ordering = ('-created_at',)
