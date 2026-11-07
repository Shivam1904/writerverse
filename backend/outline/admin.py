from django.contrib import admin
from django.db.models import JSONField
from django_json_widget.widgets import JSONEditorWidget
from unfold.admin import ModelAdmin, TabularInline

from .models import (
    Act,
    Chapter,
    OutlineBeat,
    PlotThread,
    Scene,
    SceneContent,
    SceneRevision,
    ThreadBeat,
)

_JSON_WIDGET = {JSONField: {'widget': JSONEditorWidget}}


class ThreadBeatInline(TabularInline):
    model = ThreadBeat
    fields = ('position', 'uid', 'kind', 'text', 'updated_at')
    extra = 0


@admin.register(PlotThread)
class PlotThreadAdmin(ModelAdmin):
    list_display = ('id', 'project', 'position', 'title', 'scope_type', 'scope_name', 'source')
    list_filter = ('project', 'source')
    search_fields = ('title', 'uid')
    raw_id_fields = ('project',)
    inlines = [ThreadBeatInline]


@admin.register(ThreadBeat)
class ThreadBeatAdmin(ModelAdmin):
    list_display = ('id', 'thread', 'position', 'kind', 'text', 'updated_at')
    list_filter = ('kind', 'thread__project')
    search_fields = ('text', 'uid')
    raw_id_fields = ('thread',)


# ---- grand outline -------------------------------------------------------- #

class ChapterInline(TabularInline):
    model = Chapter
    fields = ('position', 'uid', 'title', 'pov_mode', 'pov_name')
    extra = 0
    show_change_link = True


class SceneInline(TabularInline):
    model = Scene
    fields = ('position', 'uid', 'title', 'words')
    extra = 0
    show_change_link = True


class OutlineBeatInline(TabularInline):
    model = OutlineBeat
    fields = ('position', 'uid', 'kind', 'text', 'thread', 'thread_beat')
    raw_id_fields = ('thread', 'thread_beat')
    extra = 0


@admin.register(Act)
class ActAdmin(ModelAdmin):
    formfield_overrides = _JSON_WIDGET
    list_display = ('id', 'project', 'position', 'uid', 'title')
    list_filter = ('project',)
    search_fields = ('title', 'uid')
    raw_id_fields = ('project',)
    inlines = [ChapterInline]


@admin.register(Chapter)
class ChapterAdmin(ModelAdmin):
    formfield_overrides = _JSON_WIDGET
    list_display = ('id', 'project', 'act', 'position', 'uid', 'title', 'pov_mode')
    list_filter = ('project',)
    search_fields = ('title', 'uid')
    raw_id_fields = ('project', 'act', 'pov_character')
    inlines = [SceneInline]


@admin.register(Scene)
class SceneAdmin(ModelAdmin):
    formfield_overrides = _JSON_WIDGET
    list_display = ('id', 'project', 'chapter', 'position', 'uid', 'title', 'words')
    list_filter = ('project',)
    search_fields = ('title', 'uid')
    raw_id_fields = ('project', 'chapter')
    inlines = [OutlineBeatInline]


@admin.register(SceneContent)
class SceneContentAdmin(ModelAdmin):
    formfield_overrides = _JSON_WIDGET
    list_display = ('id', 'scene', 'rev')
    list_filter = ('scene__project',)
    raw_id_fields = ('scene',)
    readonly_fields = ('doc_hash', 'rev')


@admin.register(OutlineBeat)
class OutlineBeatAdmin(ModelAdmin):
    formfield_overrides = _JSON_WIDGET
    list_display = ('id', 'scene', 'position', 'kind', 'text', 'thread')
    list_filter = ('kind', 'scene__project')
    search_fields = ('text', 'uid')
    raw_id_fields = ('scene', 'thread', 'thread_beat')


@admin.register(SceneRevision)
class SceneRevisionAdmin(ModelAdmin):
    formfield_overrides = _JSON_WIDGET
    list_display = ('id', 'project', 'scene', 'created_at')
    list_filter = ('project',)
    raw_id_fields = ('project', 'scene')
    readonly_fields = ('content_hash', 'created_at')
