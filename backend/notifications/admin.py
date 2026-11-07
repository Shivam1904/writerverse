from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(ModelAdmin):
    list_display = ("id", "project", "title", "slug", "status", "created_at")
    list_filter = ("status", "slug", "project")
