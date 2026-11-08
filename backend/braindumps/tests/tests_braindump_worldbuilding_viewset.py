"""
Tests for Braindump and Worldbuilding ViewSets
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from rest_framework import status
from rest_framework.test import APIClient
from worldbuilding.models import Worldbuilding

from braindumps.models import Braindump

User = get_user_model()


class BraindumpViewSetTestCase(TestCase):
    """Test Braindump ViewSet"""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.project = Project.objects.create(
            title='Test Project',
            user=self.user
        )
        self.base_url = f'/api/projects/{self.project.id}/braindumps/'

    def test_list_braindumps(self):
        """Test listing braindumps"""
        Braindump.objects.create(
            project=self.project, title='Braindump 1'
        )
        Braindump.objects.create(
            project=self.project, title='Braindump 2'
        )

        response = self.client.get(self.base_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Handle pagination
        data = response.data
        if isinstance(data, dict) and 'results' in data:
            data = data['results']

        self.assertEqual(len(data), 2)

    def test_create_braindump(self):
        """Test creating a braindump"""
        data = {
            'title': 'New Braindump',
            'content': 'Some content',
            'tags': ['magic', 'system']
        }
        response = self.client.post(self.base_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Braindump.objects.filter(project=self.project, title='New Braindump').exists()
        )

    def test_retrieve_braindump(self):
        """Test retrieving a braindump"""
        braindump = Braindump.objects.create(
            project=self.project, title='Test Braindump'
        )
        url = f'{self.base_url}{braindump.id}/'

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Test Braindump')

    def test_update_braindump(self):
        """Test updating a braindump"""
        braindump = Braindump.objects.create(
            project=self.project, title='Old Title'
        )
        url = f'{self.base_url}{braindump.id}/'

        data = {'title': 'New Title'}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        braindump.refresh_from_db()
        self.assertEqual(braindump.title, 'New Title')

    def test_delete_braindump(self):
        """Test deleting a braindump"""
        braindump = Braindump.objects.create(
            project=self.project, title='To Delete'
        )
        url = f'{self.base_url}{braindump.id}/'

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Braindump.objects.filter(project=self.project).count(), 0)


class WorldbuildingViewSetTestCase(TestCase):
    """Test Worldbuilding ViewSet"""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.project = Project.objects.create(
            title='Test Project',
            user=self.user
        )
        self.base_url = f'/api/projects/{self.project.id}/worldbuildings/'

    def test_list_worldbuildings(self):
        """Test listing worldbuilding entries"""
        Worldbuilding.objects.create(
            project=self.project, title='Magic System'
        )
        Worldbuilding.objects.create(
            project=self.project, title='History'
        )

        response = self.client.get(self.base_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Handle pagination
        data = response.data
        if isinstance(data, dict) and 'results' in data:
            data = data['results']

        self.assertEqual(len(data), 2)

    def test_create_worldbuilding(self):
        """Test creating a worldbuilding entry"""
        data = {
            'title': 'New Worldbuilding',
            'content': 'Details about the world',
            'tags': ['magic', 'rules']
        }
        response = self.client.post(self.base_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Worldbuilding.objects.filter(project=self.project, title='New Worldbuilding').exists()
        )

    def test_retrieve_worldbuilding(self):
        """Test retrieving a worldbuilding entry"""
        wb = Worldbuilding.objects.create(
            project=self.project, title='Test Worldbuilding'
        )
        url = f'{self.base_url}{wb.id}/'

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Test Worldbuilding')

    def test_update_worldbuilding(self):
        """Test updating a worldbuilding entry"""
        wb = Worldbuilding.objects.create(
            project=self.project, title='Old Title'
        )
        url = f'{self.base_url}{wb.id}/'

        data = {'title': 'New Title'}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        wb.refresh_from_db()
        self.assertEqual(wb.title, 'New Title')

    def test_delete_worldbuilding(self):
        """Test deleting a worldbuilding entry"""
        wb = Worldbuilding.objects.create(
            project=self.project, title='To Delete'
        )
        url = f'{self.base_url}{wb.id}/'

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Worldbuilding.objects.filter(project=self.project).count(), 0)
