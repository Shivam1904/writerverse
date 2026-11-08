from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import ChatThread


@admin.register(ChatThread)
class ChatThreadAdmin(ModelAdmin):
    list_display = ["thread_id", "project", "page", "title", "last_message_at"]
    list_filter = ["page"]
    search_fields = ["thread_id", "title"]
    readonly_fields = ["thread_id", "created_at", "last_message_at"]
