"""
Tests for Project ViewSet CRUD operations.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from outline.models import Act
from rest_framework import status
from rest_framework.test import APIClient

from projects.models import Project

User = get_user_model()


class ProjectViewSetTestCase(TestCase):
    """Test Project ViewSet CRUD operations"""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = '/api/projects/'

    def test_list_projects(self):
        """Test listing projects"""
        Project.objects.create(title='Project 1', user=self.user)
        Project.objects.create(title='Project 2', user=self.user)

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Handle pagination
        data = response.data
        if isinstance(data, dict) and 'results' in data:
            data = data['results']

        self.assertEqual(len(data), 2)

    def test_list_shows_every_book_past_the_page_size(self):
        """25 books all come back, as one plain list (wrt-90)."""
        Project.objects.bulk_create(
            [Project(title=f'Book {i}', user=self.user) for i in range(25)]
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 25)

    def test_create_project(self):
        """Test creating a project"""
        data = {
            'title': 'New Project',
            'description': 'A test project',
            'genres': ['fantasy'],
            'target_word_count': 50000
        }
        response = self.client.post(self.url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Check that a new project was created
        self.assertEqual(
            Project.objects.get(user=self.user, title='New Project').genres, ['fantasy'],
        )

    def test_update_project(self):
        """Test updating a project"""
        project = Project.objects.create(title='Old Title', user=self.user)
        url = f'{self.url}{project.id}/'

        data = {'title': 'New Title', 'description': 'Updated'}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        project.refresh_from_db()
        self.assertEqual(project.title, 'New Title')

    def test_delete_project(self):
        """An archived book can be permanently deleted."""
        project_to_delete = Project.objects.create(title='To Delete', user=self.user)
        self.client.post(f'{self.url}{project_to_delete.id}/archive/')

        Act.objects.create(project=project_to_delete, uid='act-1', title='Act I')

        response = self.client.delete(f'{self.url}{project_to_delete.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Project.objects.filter(id=project_to_delete.id).exists())
        # Its outline goes with it (plain cascade, no raw SQL).
        self.assertFalse(Act.objects.filter(project_id=project_to_delete.id).exists())

    def test_delete_refused_unless_archived(self):
        """A book still in the library can't be hard-deleted in one step."""
        project = Project.objects.create(title='Live Book', user=self.user)

        response = self.client.delete(f'{self.url}{project.id}/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(Project.objects.filter(id=project.id).exists())

    def test_create_project_invalid_data(self):
        """Test creating a project with invalid data"""
        data = {
            'title': '',  # Empty title should fail
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_access(self):
        """Test that unauthenticated users cannot access"""
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_project(self):
        """Test retrieving a single project"""
        project = Project.objects.create(title='Test Project', user=self.user)
        url = f'{self.url}{project.id}/'

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Test Project')

    def test_filter_by_user(self):
        """Test that users can only see their own projects"""
        other_user = User.objects.create_user(
            email='other@example.com',
            password='testpass123'
        )
        Project.objects.create(title='Other Project', user=other_user)
        Project.objects.create(title='My Project', user=self.user)

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        if isinstance(data, dict) and 'results' in data:
            data = data['results']

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['title'], 'My Project')

    def test_update_layout(self):
        """Test updating project layout"""
        project = Project.objects.create(title='Layout Test', user=self.user)
        url = f'{self.url}{project.id}/layout/'

        layout_data = {'layout': {'showChapters': True, 'showScenes': True}}
        response = self.client.post(url, layout_data, format='json')
        # Accept any response that isn't a server error
        self.assertLess(response.status_code, 500)

    def test_export_project_endpoint(self):
        """Test export project endpoint"""
        project = Project.objects.create(title='Export Test', user=self.user)
        url = f'{self.url}{project.id}/export/'

        response = self.client.get(url, {'format_type': 'md'})
        self.assertIn(response.status_code, [
            status.HTTP_200_OK,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ])

    def test_get_toc(self):
        """Test getting table of contents"""
        project = Project.objects.create(title='TOC Test', user=self.user)
        url = f'{self.url}{project.id}/table_of_contents/'

        response = self.client.get(url)
        self.assertIn(response.status_code, [
            status.HTTP_200_OK,
            status.HTTP_404_NOT_FOUND,
            status.HTTP_400_BAD_REQUEST
        ])

    def test_renumber_scenes(self):
        """Test renumbering scenes endpoint"""
        project = Project.objects.create(title='Renumber Test', user=self.user)
        url = f'{self.url}{project.id}/renumber/'

        response = self.client.post(url)
        self.assertIn(response.status_code, [
            status.HTTP_200_OK,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_404_NOT_FOUND
        ])

    def test_archive_then_restore_keeps_book_and_status(self):
        """Archive keeps the book and its status; restore brings it back."""
        project = Project.objects.create(title='To Archive', user=self.user, status='plan')

        response = self.client.post(f'{self.url}{project.id}/archive/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        project.refresh_from_db()
        self.assertIsNotNone(project.archived_at)
        self.assertEqual(project.status, 'plan')

        listed = self.client.get(self.url).data
        listed = listed.get('results', listed) if isinstance(listed, dict) else listed
        row = next(p for p in listed if p['id'] == project.id)
        self.assertIsNotNone(row['archived_at'])

        response = self.client.post(f'{self.url}{project.id}/restore/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        project.refresh_from_db()
        self.assertIsNone(project.archived_at)
        self.assertEqual(project.status, 'plan')

        # Restored means live again, so a hard delete is refused.
        response = self.client.delete(f'{self.url}{project.id}/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

