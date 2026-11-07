from django.contrib import admin
from django.db.models import JSONField
from django_json_widget.widgets import JSONEditorWidget
from unfold.admin import ModelAdmin

from .models import ProjectDomainVersion, Proposal


@admin.register(Proposal)
class ProposalAdmin(ModelAdmin):
    formfield_overrides = {
        JSONField: {'widget': JSONEditorWidget},
    }
    list_display = ('id', 'project', 'capability', 'source', 'status', 'created_at')
    list_filter = ('status', 'source', 'project')
    search_fields = ('capability',)
    ordering = ('-created_at',)
    raw_id_fields = ('project',)


@admin.register(ProjectDomainVersion)
class ProjectDomainVersionAdmin(ModelAdmin):
    list_display = ('id', 'project', 'domain', 'changed_at')
    list_filter = ('domain', 'project')
    ordering = ('project', 'domain')
    raw_id_fields = ('project',)
