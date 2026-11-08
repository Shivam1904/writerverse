from common.html_sanitizer import sanitize_content_field
from rest_framework import serializers

from ..models import Character


class CharacterSerializer(serializers.ModelSerializer):
    """Character serializer with related metadata and computed fields."""
    mention_count = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()

    class Meta:
        model = Character
        fields = [
            'id', 'name', 'description', 'appearance', 'project', 'type', 'story', 'want', 'want_items',
            'need', 'need_items', 'misbelief', 'misbelief_items', 'permanent_traits',
            'evolving_states', 'is_main_character', 'is_protagonist', 'is_antagonist',
            'status', 'status_display', 'voice_profile', 'relationship_notes',
            'portrait_url', 'color',
            'mention_count', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'project', 'created_at', 'updated_at', 'mention_count',
            'status_display', 'portrait_url',
        ]

    def get_mention_count(self, obj):
        return 0

    def get_status_display(self, obj):
        return obj.get_status_display()

    def validate_permanent_traits(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Permanent traits must be a dictionary")
        return value

    def validate_appearance(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Appearance must be a dictionary")
        return value

    def validate_evolving_states(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Evolving states must be a dictionary")
        return value

    def validate_voice_profile(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Voice profile must be a dictionary")
        return sanitize_content_field(value, 'rich_text')

class CharacterCreateSerializer(serializers.ModelSerializer):
    """Serializer used when creating new characters."""

    class Meta:
        model = Character
        fields = [
            'name', 'description', 'appearance', 'type', 'story', 'want', 'want_items', 'need', 'need_items',
            'misbelief', 'misbelief_items', 'permanent_traits', 'evolving_states',
            'is_main_character', 'is_protagonist', 'is_antagonist', 'status', 'voice_profile',
            'relationship_notes',
        ]

    def validate_appearance(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Appearance must be a dictionary")
        return value

    def validate_permanent_traits(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Permanent traits must be a dictionary")
        return value

    def validate_evolving_states(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Evolving states must be a dictionary")
        return value
