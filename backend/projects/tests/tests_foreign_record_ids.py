"""Foreign record ids: user B, working in B's OWN project, names a record
that lives in user A's project. Every route must refuse it (404) and leave
A's record alone. Also: values that come from the URL (the project, the record
id in the path) can't be overridden by the request body (SA-145).

`tests_cross_tenant.py` covers the other shape (B calling A's project URL).
"""
import uuid

from actions.models import Proposal
from braindumps.models import Braindump
from characters.models import Character
from django.contrib.auth import get_user_model
from django.test import TestCase
from night_eyes.models import ChatThread
from outline.models import PlotThread
from rest_framework.test import APIClient
from worldbuilding.models import Worldbuilding

from projects.models import Project

User = get_user_model()


class ForeignRecordIdTests(TestCase):
    def setUp(self):
        self.user_a = User.objects.create_user(email='a@example.com', password='x')
        self.user_b = User.objects.create_user(email='b@example.com', password='x')
        self.proj_a = Project.objects.create(title='A book', user=self.user_a)
        self.proj_b = Project.objects.create(title='B book', user=self.user_b)
        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)
        self.char_a = Character.objects.create(project=self.proj_a, name='Hero A')
        self.char_b = Character.objects.create(project=self.proj_b, name='Hero B')
        self.bd_a = Braindump.objects.create(project=self.proj_a, title='Idea A', content='x')
        self.wb_a = Worldbuilding.objects.create(project=self.proj_a, title='Magic A', content='x')

    def _op(self, capability, args):
        return self.client_b.post(
            f'/api/consistency/projects/{self.proj_b.id}/op/{capability}/',
            args, format='json',
        )

    # --- facade semantic route: the URL id wins (SA-145) ---
    def test_facade_body_cannot_retarget_path_id(self):
        url = f'/api/consistency/projects/{self.proj_b.id}/characters/{self.char_b.id}/'
        other = Character.objects.create(project=self.proj_b, name='Other B')
        resp = self.client_b.patch(url, {'id': other.id, 'name': 'X'}, format='json')
        self.assertEqual(resp.status_code, 400)
        other.refresh_from_db()
        self.char_b.refresh_from_db()
        self.assertEqual(other.name, 'Other B')
        self.assertEqual(self.char_b.name, 'Hero B')

    def test_facade_body_may_repeat_the_same_id(self):
        url = f'/api/consistency/projects/{self.proj_b.id}/characters/{self.char_b.id}/'
        resp = self.client_b.patch(url, {'id': self.char_b.id, 'name': 'Renamed'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.char_b.refresh_from_db()
        self.assertEqual(self.char_b.name, 'Renamed')

    def test_facade_foreign_character_id_404(self):
        url = f'/api/consistency/projects/{self.proj_b.id}/characters/{self.char_a.id}/'
        self.assertEqual(self.client_b.patch(url, {'name': 'X'}, format='json').status_code, 404)
        self.assertEqual(self.client_b.delete(url).status_code, 404)
        self.char_a.refresh_from_db()
        self.assertEqual(self.char_a.name, 'Hero A')
        self.assertIsNone(self.char_a.deleted_at)

    # --- op route: capabilities look records up inside the URL project ---
    def test_op_foreign_ids_refused(self):
        thread_a = PlotThread.objects.create(project=self.proj_a, uid='th_a', title='A plot')
        prop_a = Proposal.objects.create(
            project=self.proj_a, source='button', capability='update_character',
            args={}, proposal={'capability': 'update_character', 'args': {}, 'preview': {}},
        )
        cases = [
            ('update_character', {'id': self.char_a.id, 'name': 'X'}),
            ('delete_character', {'id': self.char_a.id}),
            ('get_character_full', {'character_id': self.char_a.id}),
            ('delete_braindump', {'id': self.bd_a.id}),
            ('update_worldbuilding', {'id': self.wb_a.id, 'title': 'X'}),
            ('delete_plot_thread', {'thread_id': 'th_a'}),
            ('reject_proposal', {'proposal_id': str(prop_a.id)}),
        ]
        for cap, args in cases:
            with self.subTest(cap=cap):
                self.assertEqual(self._op(cap, args).status_code, 404)
        self.char_a.refresh_from_db()
        self.assertEqual(self.char_a.name, 'Hero A')
        self.assertIsNone(self.char_a.deleted_at)
        self.assertTrue(Braindump.objects.filter(id=self.bd_a.id).exists())
        self.wb_a.refresh_from_db()
        self.assertEqual(self.wb_a.title, 'Magic A')
        self.assertTrue(PlotThread.objects.filter(pk=thread_a.pk).exists())
        prop_a.refresh_from_db()
        self.assertEqual(prop_a.status, Proposal.STATUS_PROPOSED)

    # --- plain REST viewsets: project comes from the URL only ---
    def test_rest_foreign_record_ids_404(self):
        base = f'/api/projects/{self.proj_b.id}'
        for path in (f'characters/{self.char_a.id}/', f'braindumps/{self.bd_a.id}/',
                     f'worldbuildings/{self.wb_a.id}/'):
            with self.subTest(path=path):
                self.assertEqual(self.client_b.get(f'{base}/{path}').status_code, 404)
                resp = self.client_b.patch(f'{base}/{path}', {'title': 'X', 'name': 'X'},
                                           format='json')
                self.assertEqual(resp.status_code, 404)

    def test_rest_body_cannot_move_record_into_foreign_project(self):
        bd_b = Braindump.objects.create(project=self.proj_b, title='Idea B', content='x')
        wb_b = Worldbuilding.objects.create(project=self.proj_b, title='Magic B', content='x')
        base = f'/api/projects/{self.proj_b.id}'
        for path, row in ((f'braindumps/{bd_b.id}/', bd_b),
                          (f'worldbuildings/{wb_b.id}/', wb_b),
                          (f'characters/{self.char_b.id}/', self.char_b)):
            with self.subTest(path=path):
                resp = self.client_b.patch(f'{base}/{path}', {'project': self.proj_a.id},
                                           format='json')
                self.assertEqual(resp.status_code, 200)
                row.refresh_from_db()
                self.assertEqual(row.project_id, self.proj_b.id)

    def test_rest_create_ignores_body_project(self):
        resp = self.client_b.post(
            f'/api/projects/{self.proj_b.id}/braindumps/',
            {'title': 'New', 'content': 'x', 'project': self.proj_a.id}, format='json',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(Braindump.objects.filter(project=self.proj_a, title='New').exists())
        self.assertTrue(Braindump.objects.filter(project=self.proj_b, title='New').exists())

    # --- chat: a thread id from another project can't be resumed ---
    def test_chat_foreign_thread_id_404(self):
        thread_a = ChatThread.objects.create(
            thread_id=uuid.uuid4(), project=self.proj_a, title='A chat',
        )
        resp = self.client_b.post(
            f'/api/consistency/projects/{self.proj_b.id}/ping-answer/',
            {'thread_id': str(thread_a.thread_id), 'answer': 'hi'}, format='json',
        )
        self.assertEqual(resp.status_code, 404)
        thread_a.refresh_from_db()
        self.assertEqual(thread_a.project_id, self.proj_a.id)
