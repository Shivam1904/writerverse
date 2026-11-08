from rest_framework import serializers

from worldbuilding.models import Worldbuilding


class WorldbuildingSerializer(serializers.ModelSerializer):
    tag_list = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()

    class Meta:
        model = Worldbuilding
        fields = [
            'id', 'title', 'content', 'tags', 'tag_list', 'color',
            'project', 'order', 'status', 'status_display',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'project', 'tag_list', 'status_display',
            'created_at', 'updated_at'
        ]

    def validate_tags(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Tags must be a list")
        for tag in value:
            if not isinstance(tag, str):
                raise serializers.ValidationError("All tags must be strings")
        return value

    def get_tag_list(self, obj):
        return obj.tags if isinstance(obj.tags, list) else []

    def get_status_display(self, obj):
        return obj.get_status_display()

class WorldbuildingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Worldbuilding
        fields = ['title', 'content', 'tags', 'order', 'status']
