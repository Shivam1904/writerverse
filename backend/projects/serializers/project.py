"""
Project-related serializers
"""

from common.html_sanitizer import sanitize_content_field
from rest_framework import serializers

from ..models import (
    Project,
)


class ProjectSerializer(serializers.ModelSerializer):
    """
    Project serializer with computed fields
    """
    total_word_count = serializers.ReadOnlyField()
    total_chapters = serializers.ReadOnlyField()
    book_config = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = Project
        fields = [
            'id', 'title', 'description', 'synopsis', 'genres', 'tones', 'themes',
            'logline', 'perspective', 'tense', 'audience', 'status',
            'target_word_count', 'total_word_count',
            'total_chapters', 'book_config',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_title(self, value):
        """Sanitize title to prevent XSS attacks"""
        return sanitize_content_field(value, 'plain_text')

    def validate_description(self, value):
        """Sanitize description to prevent XSS attacks"""
        return sanitize_content_field(value, 'plain_text')

    def validate_synopsis(self, value):
        """Sanitize synopsis to prevent XSS attacks"""
        return sanitize_content_field(value, 'plain_text')

    def validate_theme(self, value):
        """Sanitize theme to prevent XSS attacks"""
        return sanitize_content_field(value, 'plain_text')


class ProjectListSerializer(serializers.ModelSerializer):
    """
    Lightweight project serializer for list views
    """
    progress_percentage = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            'id', 'title', 'description', 'synopsis', 'genres', 'tones', 'status', 'target_word_count',
            'total_word_count', 'total_acts', 'total_chapters', 'total_scenes', 'progress_percentage',
            'created_at', 'updated_at', 'archived_at'
        ]

    def get_progress_percentage(self, obj):
        """Calculate progress percentage based on word count"""
        if not obj.target_word_count or obj.target_word_count == 0:
            return 0
        return min(100, round((obj.total_word_count / obj.target_word_count) * 100, 1))

