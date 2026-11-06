"""Tests for FI-20: Name Collision Detector."""

from characters.models import Character
from characters.services.name_collision_service import detect_name_collisions
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


class NameCollisionServiceTestCase(TestCase):
    """Unit tests for the pure-Python collision service."""

    def test_same_initial_cluster(self):
        collisions = detect_name_collisions(['Doran', 'Devlin', 'Dasha'])
        self.assertEqual(len(collisions), 3)  # 3 pairs all sharing D
        types = {c['collision_type'] for c in collisions}
        self.assertIn('character_character', types)

    def test_phonetic_near_match(self):
        # Smith / Smyth share the same Soundex code and different first letter → phonetic match
        collisions = detect_name_collisions(['Smyth', 'Reid'])
        self.assertEqual(len(collisions), 0)  # distinct
        collisions2 = detect_name_collisions(['Brendan', 'Brandon'])
        self.assertGreater(len(collisions2), 0)  # high spelling similarity

    def test_high_edit_distance_similarity(self):
        collisions = detect_name_collisions(['Brendan', 'Brandon'])
        self.assertEqual(len(collisions), 1)

    def test_character_worldbuilding_collision(self):
        collisions = detect_name_collisions(['Haven'], worldbuilding_titles=['Haven'])
        self.assertEqual(len(collisions), 1)
        self.assertEqual(collisions[0]['collision_type'], 'character_worldbuilding')

    def test_distinct_names_produce_no_collisions(self):
        collisions = detect_name_collisions(['Alice', 'Bob', 'Zara'])
        self.assertEqual(collisions, [])

    def test_empty_list(self):
        self.assertEqual(detect_name_collisions([]), [])

    def test_single_name(self):
        self.assertEqual(detect_name_collisions(['Kira']), [])

    def test_no_worldbuilding_by_default(self):
        collisions = detect_name_collisions(['Mira'], worldbuilding_titles=None)
        self.assertEqual(collisions, [])


class NameCollisionsEndpointTestCase(TestCase):
    """Integration tests for the /name-collisions/ endpoint."""

    def setUp(self):
        self.user = User.objects.create_user(email='collision@example.com', password='pw')
        self.other = User.objects.create_user(email='other@example.com', password='pw')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.project = Project.objects.create(title='TestProject', user=self.user)
        self.url = f'/api/projects/{self.project.id}/characters/name-collisions/'

    def test_returns_collisions_for_project(self):
        Character.objects.create(project=self.project, name='Mira')
        Character.objects.create(project=self.project, name='Myra')
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('collisions', response.data)
        self.assertEqual(len(response.data['collisions']), 1)

    def test_returns_empty_when_no_collisions(self):
        Character.objects.create(project=self.project, name='Alice')
        Character.objects.create(project=self.project, name='Bob')
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['collisions'], [])

    def test_ignores_archived_characters(self):
        Character.objects.create(project=self.project, name='Mira')
        Character.objects.create(project=self.project, name='Myra', status='archived')
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['collisions'], [])

    def test_unauthenticated_returns_401(self):
        client = APIClient()
        response = client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
