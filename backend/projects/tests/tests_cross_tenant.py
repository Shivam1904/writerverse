"""Cross-tenant tests: user B must never reach user A's data.

One test per main API area. Each builds data owned by user A, then calls the
real endpoint as user B and expects 404 (or 403). A second assertion checks
A's data is untouched where the call is a write.
"""
from braindumps.models import Braindump
from characters.models import Character
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from worldbuilding.models import Worldbuilding

from projects.models import Project

User = get_user_model()

DENIED = (403, 404)


class CrossTenantTests(TestCase):
    def setUp(self):
        self.user_a = User.objects.create_user(email='a@example.com', password='x')
        self.user_b = User.objects.create_user(email='b@example.com', password='x')
        self.project = Project.objects.create(title='A book', user=self.user_a)
        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)
        self.pid = self.project.id

    def test_owner_control_routes_resolve(self):
        """Positive control: the owner gets 200, so a renamed route can't fake a 404."""
        client_a = APIClient()
        client_a.force_authenticate(user=self.user_a)
        for path in (
            f'/api/projects/{self.pid}/',
            f'/api/projects/{self.pid}/characters/',
            f'/api/projects/{self.pid}/worldbuildings/',
            f'/api/projects/{self.pid}/braindumps/',
        ):
            with self.subTest(path=path):
                self.assertEqual(client_a.get(path).status_code, 200)

    # --- projects ---
    def test_projects_detail_update_delete_denied(self):
        url = f'/api/projects/{self.pid}/'
        self.assertIn(self.client_b.get(url).status_code, DENIED)
        self.assertIn(
            self.client_b.patch(url, {'title': 'hacked'}, format='json').status_code,
            DENIED,
        )
        self.assertIn(self.client_b.delete(url).status_code, DENIED)
        self.project.refresh_from_db()
        self.assertEqual(self.project.title, 'A book')

    # --- outline / scenes (served by the op route) ---
    def test_outline_scenes_op_denied(self):
        resp = self.client_b.post(
            f'/api/consistency/projects/{self.pid}/op/get_grand_outline/', {}, format='json',
        )
        self.assertIn(resp.status_code, DENIED)

    # --- characters ---
    def test_characters_denied(self):
        ch = Character.objects.create(project=self.project, name='Hero')
        base = f'/api/projects/{self.pid}/characters/'
        self.assertIn(self.client_b.get(base).status_code, DENIED)
        self.assertIn(self.client_b.get(f'{base}{ch.id}/').status_code, DENIED)
        self.assertIn(
            self.client_b.patch(f'{base}{ch.id}/', {'name': 'X'}, format='json').status_code,
            DENIED,
        )
        self.assertIn(self.client_b.delete(f'{base}{ch.id}/').status_code, DENIED)
        ch.refresh_from_db()
        self.assertEqual(ch.name, 'Hero')

    def test_characters_facade_route_denied(self):
        resp = self.client_b.get(f'/api/consistency/projects/{self.pid}/characters/')
        self.assertIn(resp.status_code, DENIED)

    # --- world ---
    def test_worldbuilding_denied(self):
        wb = Worldbuilding.objects.create(project=self.project, title='Magic', content='x')
        base = f'/api/projects/{self.pid}/worldbuildings/'
        self.assertIn(self.client_b.get(base).status_code, DENIED)
        self.assertIn(self.client_b.get(f'{base}{wb.id}/').status_code, DENIED)
        self.assertIn(self.client_b.delete(f'{base}{wb.id}/').status_code, DENIED)
        self.assertTrue(Worldbuilding.objects.filter(id=wb.id).exists())

    # --- braindumps ---
    def test_braindumps_denied(self):
        bd = Braindump.objects.create(project=self.project, title='Idea', content='x')
        base = f'/api/projects/{self.pid}/braindumps/'
        self.assertIn(self.client_b.get(base).status_code, DENIED)
        self.assertIn(self.client_b.get(f'{base}{bd.id}/').status_code, DENIED)
        self.assertIn(self.client_b.delete(f'{base}{bd.id}/').status_code, DENIED)
        self.assertTrue(Braindump.objects.filter(id=bd.id).exists())

    # --- consistency / night_eyes ---
    def test_consistency_and_night_eyes_denied(self):
        base = f'/api/consistency/projects/{self.pid}/'
        for path in ('threads/', 'pending-proposals/', 'usage/', 'frame/'):
            with self.subTest(path=path):
                self.assertIn(self.client_b.get(base + path).status_code, DENIED)
        for path in ('chat/', 'reset/', 'op/accept_proposal/', 'op/reject_proposal/'):
            with self.subTest(path=path):
                resp = self.client_b.post(base + path, {'message': 'hi'}, format='json')
                self.assertIn(resp.status_code, DENIED)
