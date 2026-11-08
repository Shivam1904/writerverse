from rest_framework import serializers

from braindumps.models import Braindump


class BraindumpSerializer(serializers.ModelSerializer):
    tag_list = serializers.SerializerMethodField()

    class Meta:
        model = Braindump
        fields = [
            'id', 'title', 'content', 'tags', 'tag_list', 'pinned', 'project',
            'order', 'ai_data', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'project', 'tag_list', 'created_at', 'updated_at']

    def validate_tags(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Tags must be a list")
        for tag in value:
            if not isinstance(tag, str):
                raise serializers.ValidationError("All tags must be strings")
        return value

    def get_tag_list(self, obj):
        return obj.tags if isinstance(obj.tags, list) else []

class BraindumpCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Braindump
        fields = ['id', 'title', 'content', 'tags', 'pinned', 'order', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
