from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from unfold.admin import ModelAdmin

from .models import User


class UserAdmin(BaseUserAdmin, ModelAdmin):
    """
    Custom admin configuration for User model.
    """
    list_display = ('email', 'first_name', 'last_name', 'is_active', 'email_verified_at', 'date_joined')
    list_filter = ('is_active', 'is_staff', 'date_joined')
    search_fields = ('email', 'first_name', 'last_name')
    ordering = ('-date_joined',)

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
        # Editable, so support can unlock someone whose verify email never arrived.
        ('Email', {'fields': ('email_verified_at',)}),
        ('Terms', {'fields': ('terms_accepted_at', 'terms_version')}),
    )
    readonly_fields = ('terms_accepted_at', 'terms_version')

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'first_name', 'last_name', 'password1', 'password2'),
        }),
    )


admin.site.register(User, UserAdmin)
