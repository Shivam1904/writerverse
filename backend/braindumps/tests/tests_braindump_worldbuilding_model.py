"""
Tests for Braindump and Worldbuilding models
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from worldbuilding.models import Worldbuilding

from braindumps.models import Braindump

User = get_user_model()


class BraindumpModelTestCase(TestCase):
    """Test Braindump model"""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123'
        )
        self.project = Project.objects.create(
            title='Test Project',
            user=self.user
        )

    def test_create_braindump(self):
        """Test creating a braindump"""
        braindump = Braindump.objects.create(
            project=self.project,
            title='Character Braindumps',
            content='Braindumps for characters',
            pinned=True,
        )
        self.assertEqual(braindump.title, 'Character Braindumps')
        self.assertEqual(braindump.project, self.project)
        self.assertTrue(braindump.pinned)

    def test_not_pinned_by_default(self):
        braindump = Braindump.objects.create(project=self.project, title='Loose idea')
        self.assertFalse(braindump.pinned)

    def test_braindump_str(self):
        """Test braindump string representation"""
        braindump = Braindump.objects.create(
            project=self.project,
            title='Test Braindump'
        )
        self.assertIn('Test Braindump', str(braindump))



class WorldbuildingModelTestCase(TestCase):
    """Test Worldbuilding model"""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123'
        )
        self.project = Project.objects.create(
            title='Test Project',
            user=self.user
        )

    def test_create_worldbuilding(self):
        """Test creating a worldbuilding entry"""
        wb = Worldbuilding.objects.create(
            project=self.project,
            title='Magic System',
            content='Details about magic',
            order=1
        )
        self.assertEqual(wb.title, 'Magic System')
        self.assertEqual(wb.project, self.project)

    def test_worldbuilding_str(self):
        """Test worldbuilding string representation"""
        wb = Worldbuilding.objects.create(
            project=self.project,
            title='Test Worldbuilding'
        )
        self.assertIn('Test Worldbuilding', str(wb))


    def test_status_display(self):
        """Test get_status_display method"""
        wb = Worldbuilding.objects.create(
            project=self.project,
            title='Test',
            status='draft'
        )
        display = wb.get_status_display()
        self.assertIn('Draft', display)
