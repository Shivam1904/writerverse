from django.contrib import admin
from django.db.models import JSONField
from django_json_widget.widgets import JSONEditorWidget
from unfold.admin import ModelAdmin

from .models import ActivityEvent


@admin.register(ActivityEvent)
class ActivityEventAdmin(ModelAdmin):
    """Developer debug log: filter by project and kind to see what the app/AI did."""
    formfield_overrides = {
        JSONField: {'widget': JSONEditorWidget},
    }
    list_display = ('created_at', 'project', 'kind', 'name')
    list_filter = ('kind', 'project')
    search_fields = ('name',)
    date_hierarchy = 'created_at'
    raw_id_fields = ('project',)
    list_per_page = 100
