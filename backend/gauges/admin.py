from django.contrib import admin
from django.db.models import JSONField
from django_json_widget.widgets import JSONEditorWidget
from unfold.admin import ModelAdmin, TabularInline

from .models import (
    GaugeAnalysis,
    GaugeBinding,
    GaugeCandidate,
    GaugeDataPoint,
    GaugePreset,
)

_JSON = {JSONField: {'widget': JSONEditorWidget}}


@admin.register(GaugePreset)
class GaugePresetAdmin(ModelAdmin):
    formfield_overrides = _JSON
    list_display = ('uid', 'name', 'type_id', 'project', 'position')
    list_filter = ('project',)
    search_fields = ('uid', 'name')
    raw_id_fields = ('project',)


@admin.register(GaugeBinding)
class GaugeBindingAdmin(ModelAdmin):
    formfield_overrides = _JSON
    list_display = ('binding_id', 'scope_type', 'scope_name', 'character', 'project', 'bound_at')
    list_filter = ('project', 'scope_type')
    search_fields = ('binding_id', 'scope_name')
    raw_id_fields = ('project', 'character')


@admin.register(GaugeCandidate)
class GaugeCandidateAdmin(ModelAdmin):
    formfield_overrides = _JSON
    list_display = ('uid', 'kind', 'project', 'position')
    list_filter = ('project', 'kind')
    search_fields = ('uid',)
    raw_id_fields = ('project',)


class GaugeDataPointInline(TabularInline):
    model = GaugeDataPoint
    formfield_overrides = _JSON
    fields = ('position', 'tick_id', 'scene', 'value', 'confidence', 'reasoning')
    raw_id_fields = ('scene',)
    extra = 0


@admin.register(GaugeAnalysis)
class GaugeAnalysisAdmin(ModelAdmin):
    formfield_overrides = _JSON
    list_display = ('binding', 'verdict', 'score', 'analysed_at')
    search_fields = ('binding__binding_id', 'verdict')
    raw_id_fields = ('binding',)
    inlines = [GaugeDataPointInline]


@admin.register(GaugeDataPoint)
class GaugeDataPointAdmin(ModelAdmin):
    formfield_overrides = _JSON
    list_display = ('analysis', 'position', 'tick_id', 'scene', 'confidence')
    search_fields = ('tick_id', 'scene__uid')
    raw_id_fields = ('analysis', 'scene')
