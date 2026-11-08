"""
Tests for Character ViewSet CRUD operations.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from rest_framework import status
from rest_framework.test import APIClient

from characters.models import Character

User = get_user_model()


class CharacterViewSetTestCase(TestCase):
    """Test Character ViewSet CRUD operations"""

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
        self.base_url = f'/api/projects/{self.project.id}/characters/'

    def test_list_characters(self):
        """Test listing characters"""
        Character.objects.create(project=self.project, name='Hero')
        Character.objects.create(project=self.project, name='Villain')

        response = self.client.get(self.base_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Handle pagination
        data = response.data
        if isinstance(data, dict) and 'results' in data:
            data = data['results']

        self.assertEqual(len(data), 2)

    def test_retrieve_character(self):
        """Test retrieving a single character"""
        character = Character.objects.create(
            project=self.project, name='Test Character'
        )
        url = f'{self.base_url}{character.id}/'

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Test Character')

    def test_create_character(self):
        """Test creating a character"""
        data = {
            'name': 'New Character',
            'type': 'protagonist',
            'story': 'A hero journey',
            'want': 'To save the world',
            'need': 'To overcome fear',
        }
        response = self.client.post(self.base_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify character was created in database
        self.assertTrue(
            Character.objects.filter(project=self.project, name='New Character').exists()
        )

    def test_update_character(self):
        """Test updating a character"""
        character = Character.objects.create(
            project=self.project, name='Old Name'
        )
        url = f'{self.base_url}{character.id}/'

        data = {'name': 'New Name', 'story': 'Updated story'}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        character.refresh_from_db()
        self.assertEqual(character.name, 'New Name')

    def test_delete_character(self):
        """Test deleting a character"""
        character = Character.objects.create(
            project=self.project, name='To Delete'
        )
        url = f'{self.base_url}{character.id}/'

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Character.objects.filter(project=self.project).count(), 0)
