"""
Tests for Braindump and Worldbuilding serializers
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from worldbuilding.models import Worldbuilding
from worldbuilding.serializers import WorldbuildingSerializer

from braindumps.models import Braindump
from braindumps.serializers import BraindumpSerializer

User = get_user_model()


class BraindumpSerializerTestCase(TestCase):
    """Test Braindump serializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123'
        )
        self.project = Project.objects.create(
            title='Test Project',
            user=self.user
        )

    def test_valid_serializer(self):
        """Test valid braindump serialization"""
        braindump = Braindump.objects.create(
            project=self.project,
            title='Character Braindumps',
            content='Braindumps here',
            pinned=True,
        )
        serializer = BraindumpSerializer(braindump)
        data = serializer.data
        self.assertEqual(data['title'], 'Character Braindumps')
        self.assertTrue(data['pinned'])

    def test_tag_list(self):
        """tag_list mirrors tags, and is [] when tags is not a list"""
        braindump = Braindump.objects.create(
            project=self.project,
            title='Tagged',
            tags=['braindump', 'character', 'plot']
        )
        self.assertEqual(BraindumpSerializer(braindump).data['tag_list'], ['braindump', 'character', 'plot'])
        braindump.tags = None
        self.assertEqual(BraindumpSerializer(braindump).data['tag_list'], [])

    def test_validate_tags(self):
        """Test tags validation"""
        data = {
            'title': 'Test',
            'project': self.project.id,
            'tags': ['valid', 123],  # 123 is not a string
        }
        serializer = BraindumpSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('tags', serializer.errors)


class WorldbuildingSerializerTestCase(TestCase):
    """Test Worldbuilding serializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123'
        )
        self.project = Project.objects.create(
            title='Test Project',
            user=self.user
        )

    def test_valid_serializer(self):
        """Test valid worldbuilding serialization"""
        wb = Worldbuilding.objects.create(
            project=self.project,
            title='Magic System',
            content='Details about magic',
            order=1
        )
        serializer = WorldbuildingSerializer(wb)
        data = serializer.data
        self.assertEqual(data['title'], 'Magic System')

    def test_tag_list(self):
        """tag_list mirrors tags, and is [] when tags is not a list"""
        wb = Worldbuilding.objects.create(
            project=self.project,
            title='Tagged',
            tags=['magic', 'system', 'rules']
        )
        self.assertEqual(WorldbuildingSerializer(wb).data['tag_list'], ['magic', 'system', 'rules'])
        wb.tags = None
        self.assertEqual(WorldbuildingSerializer(wb).data['tag_list'], [])

    def test_validate_tags(self):
        """Test tags validation"""
        data = {
            'title': 'Test',
            'project': self.project.id,
            'tags': [123, 'valid'],  # 123 is not a string
        }
        serializer = WorldbuildingSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('tags', serializer.errors)
