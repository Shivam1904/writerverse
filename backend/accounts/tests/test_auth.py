import importlib
from unittest import mock

from common.throttling import SharedScopedRateThrottle
from django.conf import settings
from django.contrib import admin
from django.contrib.auth.tokens import default_token_generator
from django.contrib.contenttypes.models import ContentType
from django.core import mail
from django.db import connection
from django.test import TestCase, override_settings
from django.urls import clear_url_caches, reverse, reverse_lazy
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

import config.urls
from accounts.models import User


class PasswordResetTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='resettest@example.com',
            password='OldPass123!',
            first_name='Test',
            last_name='User',
        )

    def test_request_reset_sends_email_for_known_user(self):
        response = self.client.post(reverse('accounts:password_reset'), {'email': self.user.email})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('reset-password', mail.outbox[0].body)

    def test_request_reset_is_silent_for_unknown_email(self):
        response = self.client.post(reverse('accounts:password_reset'), {'email': 'nobody@example.com'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(DEV_SHORTCUTS_ENABLED=True)
    def test_request_reset_includes_dev_link_when_shortcuts_enabled(self):
        response = self.client.post(reverse('accounts:password_reset'), {'email': self.user.email})
        self.assertIn('reset-password', response.json()['dev_reset_link'])

    @override_settings(DEV_SHORTCUTS_ENABLED=False)
    def test_request_reset_omits_dev_link_when_shortcuts_disabled(self):
        response = self.client.post(reverse('accounts:password_reset'), {'email': self.user.email})
        self.assertNotIn('dev_reset_link', response.json())

    def test_confirm_reset_changes_password(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        response = self.client.post(reverse('accounts:password_reset_confirm'), {
            'uid': uid,
            'token': token,
            'new_password': 'NewPass456!',
        })
        self.assertEqual(response.status_code, 200)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPass456!'))

    def test_confirm_reset_rejects_reused_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        url = reverse('accounts:password_reset_confirm')

        self.client.post(url, {'uid': uid, 'token': token, 'new_password': 'NewPass456!'})
        second = self.client.post(url, {'uid': uid, 'token': token, 'new_password': 'AnotherPass789!'})
        self.assertEqual(second.status_code, 400)

    def test_confirm_reset_rejects_garbage_uid_and_token(self):
        response = self.client.post(reverse('accounts:password_reset_confirm'), {
            'uid': 'garbage',
            'token': 'garbage',
            'new_password': 'X1234567!',
        })
        self.assertEqual(response.status_code, 400)


class AdminExposureTests(TestCase):
    """SA-72: prod hides the admin behind DJANGO_ADMIN_PATH and locks out guessers."""

    SECRET = 'sa72-hidden-admin/'

    def _reload_urls(self):
        importlib.reload(config.urls)
        # Another root URLconf that includes config.urls copied its patterns at
        # import time, so it must be rebuilt too or the reload has no effect.
        if settings.ROOT_URLCONF != 'config.urls':
            importlib.reload(importlib.import_module(settings.ROOT_URLCONF))
        clear_url_caches()

    def _prod_urls(self, admin_path):
        """Rebuild the URLconf as prod would (DEBUG and LOCAL_DEV off); restore it after the test."""
        overrides = override_settings(DEBUG=False, LOCAL_DEV=False, ADMIN_PATH=admin_path)
        overrides.enable()
        self.addCleanup(self._reload_urls)
        self.addCleanup(overrides.disable)
        self._reload_urls()

    def test_admin_not_routed_in_prod_without_env_var(self):
        self._prod_urls('')
        self.assertEqual(self.client.get('/admin/').status_code, 404)

    def test_admin_served_only_at_secret_path(self):
        self._prod_urls(self.SECRET)
        self.assertEqual(self.client.get('/admin/').status_code, 404)
        self.assertEqual(self.client.get(f'/{self.SECRET}login/').status_code, 200)

    def test_auto_register_loop_skipped_when_debug_off(self):
        was_registered = admin.site.is_registered(ContentType)
        if was_registered:
            admin.site.unregister(ContentType)

        def restore():
            if was_registered and not admin.site.is_registered(ContentType):
                admin.site.register(ContentType)

        self.addCleanup(restore)
        self._prod_urls(self.SECRET)
        self.assertFalse(admin.site.is_registered(ContentType))

    def test_admin_login_locks_out_after_repeated_failures(self):
        self._prod_urls(self.SECRET)
        User.objects.create_superuser(email='boss@example.com', password='RightPass123!')
        url = f'/{self.SECRET}login/'
        for _ in range(5):
            self.client.post(url, {'username': 'boss@example.com', 'password': 'wrong'})
        # Locked: even the right password is refused now.
        response = self.client.post(url, {'username': 'boss@example.com', 'password': 'RightPass123!'})
        self.assertEqual(response.status_code, 429)
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_api_login_not_locked_by_admin_lockout(self):
        User.objects.create_user(email='writer@example.com', password='RightPass123!')
        url = reverse('accounts:token_obtain_pair')
        for _ in range(6):
            self.client.post(url, {'email': 'writer@example.com', 'password': 'wrong'})
        response = self.client.post(url, {'email': 'writer@example.com', 'password': 'RightPass123!'})
        self.assertEqual(response.status_code, 200)


class AuthThrottleTests(TestCase):
    """The 'auth' rate limit (30/min) trips, and its counter lives in Postgres
    so every serverless worker sees the same count (SA-34)."""

    url = reverse_lazy('accounts:token_obtain_pair')
    body = {'email': 'nobody@example.com', 'password': 'wrong'}

    def test_login_returns_429_after_the_limit(self):
        # Freeze the throttle's clock. Each failed login runs the slow password
        # hasher, so on a busy machine 31 logins can take over a minute; the
        # oldest ones would then fall out of the 1-minute window and the 31st
        # request would get a 400 instead of a 429.
        patcher = mock.patch.object(SharedScopedRateThrottle, 'timer', return_value=1_000_000.0)
        patcher.start()
        self.addCleanup(patcher.stop)
        for _ in range(30):
            self.assertNotEqual(self.client.post(self.url, self.body).status_code, 429)

        response = self.client.post(self.url, self.body)

        self.assertEqual(response.status_code, 429)
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) FROM throttle_cache')
            self.assertGreater(cursor.fetchone()[0], 0)

    def test_next_test_starts_with_a_clean_count(self):
        # Runs after the test above (alphabetical); its DB rows were rolled back.
        self.assertNotEqual(self.client.post(self.url, self.body).status_code, 429)


# --- SA-57: change password + delete account -------------------------------

OLD_PW = 'OldPass123!word'
NEW_PW = 'Brand-new-Pass-456'


def _login(client, email, password):
    """Real JWT login: tokens come from the login endpoint, like in the app."""
    resp = client.post(reverse('accounts:token_obtain_pair'), {'email': email, 'password': password})
    assert resp.status_code == 200, resp.content
    return resp.json()


def _me(client, access):
    return client.get(reverse('accounts:profile'), HTTP_AUTHORIZATION=f'Bearer {access}')


def _refresh(client, refresh):
    return client.post(reverse('accounts:token_refresh'), {'refresh': refresh})


class ChangePasswordTests(TestCase):
    url = reverse_lazy('accounts:password_change')

    def setUp(self):
        self.user = User.objects.create_user(
            email='writer@example.com', password=OLD_PW, first_name='Ann', last_name='Lee',
        )

    def _post(self, access, **body):
        return self.client.post(self.url, body, HTTP_AUTHORIZATION=f'Bearer {access}')

    def test_needs_login(self):
        resp = self.client.post(self.url, {'current_password': OLD_PW, 'new_password': NEW_PW})
        self.assertEqual(resp.status_code, 401)

    def test_happy_path_signs_out_other_devices_and_keeps_this_one(self):
        laptop = _login(self.client, self.user.email, OLD_PW)
        phone = _login(self.client, self.user.email, OLD_PW)

        resp = self._post(laptop['access'], current_password=OLD_PW, new_password=NEW_PW)

        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PW))
        # The phone's access and refresh tokens both stop working...
        self.assertEqual(_me(self.client, phone['access']).status_code, 401)
        self.assertEqual(_refresh(self.client, phone['refresh']).status_code, 401)
        # ...and so do the laptop's old ones; the laptop uses the fresh pair.
        self.assertEqual(_me(self.client, laptop['access']).status_code, 401)
        self.assertEqual(_refresh(self.client, laptop['refresh']).status_code, 401)
        self.assertEqual(_me(self.client, resp.json()['access']).status_code, 200)
        self.assertEqual(_refresh(self.client, resp.json()['refresh']).status_code, 200)
        # The old password no longer logs in; the new one does.
        bad = self.client.post(reverse('accounts:token_obtain_pair'),
                               {'email': self.user.email, 'password': OLD_PW})
        self.assertEqual(bad.status_code, 400)
        _login(self.client, self.user.email, NEW_PW)

    def test_wrong_current_password_changes_nothing(self):
        tokens = _login(self.client, self.user.email, OLD_PW)
        resp = self._post(tokens['access'], current_password='nope-nope', new_password=NEW_PW)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('current_password', resp.json())
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(OLD_PW))
        self.assertEqual(_me(self.client, tokens['access']).status_code, 200)

    def test_new_password_runs_django_validators(self):
        tokens = _login(self.client, self.user.email, OLD_PW)
        for weak in ('short', '12345678901', 'password123', 'writer@example.com'):
            resp = self._post(tokens['access'], current_password=OLD_PW, new_password=weak)
            self.assertEqual(resp.status_code, 400, weak)
            self.assertIn('new_password', resp.json())
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(OLD_PW))

    def test_new_password_must_differ(self):
        tokens = _login(self.client, self.user.email, OLD_PW)
        resp = self._post(tokens['access'], current_password=OLD_PW, new_password=OLD_PW)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('new_password', resp.json())

    def test_guessing_is_rate_limited(self):
        tokens = _login(self.client, self.user.email, OLD_PW)
        for _ in range(10):
            resp = self._post(tokens['access'], current_password='guess', new_password=NEW_PW)
            self.assertEqual(resp.status_code, 400)
        resp = self._post(tokens['access'], current_password=OLD_PW, new_password=NEW_PW)
        self.assertEqual(resp.status_code, 429)


class PasswordResetEndsSessionsTests(TestCase):
    def test_reset_signs_out_every_device(self):
        user = User.objects.create_user(email='r@example.com', password=OLD_PW, first_name='R', last_name='S')
        tokens = _login(self.client, user.email, OLD_PW)
        resp = self.client.post(reverse('accounts:password_reset_confirm'), {
            'uid': urlsafe_base64_encode(force_bytes(user.pk)),
            'token': default_token_generator.make_token(user),
            'new_password': NEW_PW,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(_me(self.client, tokens['access']).status_code, 401)
        self.assertEqual(_refresh(self.client, tokens['refresh']).status_code, 401)


class RegistrationEmailCaseTests(TestCase):
    def test_same_email_in_other_case_is_rejected(self):
        User.objects.create_user(email='ann@example.com', password=OLD_PW, first_name='A', last_name='L')
        resp = self.client.post(reverse('accounts:register'), {
            'email': 'Ann@Example.com', 'first_name': 'A', 'last_name': 'L',
            'password': NEW_PW, 'password_confirm': NEW_PW,
        })
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(User.objects.count(), 1)


class EmailCaseAtLoginTests(TestCase):
    """Email case never matters: stored lowercase, found ignoring case (wrt-89)."""

    def test_signup_stores_email_lowercase(self):
        resp = self.client.post(reverse('accounts:register'), {
            'email': 'Sam.Writer@Example.COM', 'first_name': 'S', 'last_name': 'S',
            'password': NEW_PW, 'password_confirm': NEW_PW,
        })
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(User.objects.get().email, 'sam.writer@example.com')

    def test_login_ignores_case(self):
        User.objects.create_user(email='Ann@Example.com', password=OLD_PW, first_name='A', last_name='L')
        self.assertEqual(User.objects.get().email, 'ann@example.com')
        for typed in ('ann@example.com', 'ANN@EXAMPLE.COM', 'Ann@example.com'):
            resp = self.client.post(reverse('accounts:token_obtain_pair'), {'email': typed, 'password': OLD_PW})
            self.assertEqual(resp.status_code, 200, typed)

    def test_login_finds_an_older_mixed_case_row(self):
        # A row saved before emails were lowercased still signs in.
        User.objects.create_user(email='x@x.com', password=OLD_PW, first_name='A', last_name='L')
        User.objects.update(email='Mixed@Example.com')
        resp = self.client.post(reverse('accounts:token_obtain_pair'), {'email': 'mixed@example.com', 'password': OLD_PW})
        self.assertEqual(resp.status_code, 200)


class AccountLogsTests(TestCase):
    """Login and sign-up logs carry the user id, never the email or IP (wrt-89)."""

    def test_login_and_signup_logs_have_no_email_or_ip(self):
        with self.assertLogs('accounts.views', level='INFO') as logs:
            self.client.post(reverse('accounts:register'), {
                'email': 'secret.person@example.com', 'first_name': 'S', 'last_name': 'P',
                'password': NEW_PW, 'password_confirm': NEW_PW,
            }, REMOTE_ADDR='203.0.113.7')
            _login(self.client, 'secret.person@example.com', NEW_PW)
        text = '\n'.join(logs.output)
        self.assertIn('Successful login', text)
        self.assertNotIn('secret.person', text)
        self.assertNotIn('203.0.113.7', text)


class RegistrationTermsTests(TestCase):
    """SA-50: the server records who accepted which terms, and when."""

    def _register(self, **extra):
        body = {
            'email': 'new@example.com', 'first_name': 'N', 'last_name': 'W',
            'password': NEW_PW, 'password_confirm': NEW_PW, **extra,
        }
        return self.client.post(reverse('accounts:register'), body, content_type='application/json')

    def test_accepted_terms_are_recorded_with_server_version_and_time(self):
        resp = self._register(accepted_terms=True)
        self.assertEqual(resp.status_code, 201)
        user = User.objects.get(email='new@example.com')
        self.assertEqual(user.terms_version, settings.TERMS_VERSION)
        self.assertIsNotNone(user.terms_accepted_at)

    @override_settings(REQUIRE_TERMS_ACCEPTANCE=True)
    def test_deployed_signup_without_terms_is_rejected(self):
        for extra in ({}, {'accepted_terms': False}):
            resp = self._register(**extra)
            self.assertEqual(resp.status_code, 400)
            self.assertIn('accepted_terms', resp.json())
        self.assertFalse(User.objects.exists())

    @override_settings(REQUIRE_TERMS_ACCEPTANCE=False)
    def test_local_signup_without_terms_is_allowed_and_not_recorded(self):
        resp = self._register()
        self.assertEqual(resp.status_code, 201)
        user = User.objects.get(email='new@example.com')
        self.assertIsNone(user.terms_accepted_at)
        self.assertEqual(user.terms_version, '')

    def test_client_cannot_set_terms_version_or_time(self):
        resp = self._register(
            accepted_terms=True, terms_version='made-up', terms_accepted_at='2000-01-01T00:00:00Z',
        )
        self.assertEqual(resp.status_code, 201)
        user = User.objects.get(email='new@example.com')
        self.assertEqual(user.terms_version, settings.TERMS_VERSION)
        self.assertGreater(user.terms_accepted_at.year, 2000)


class ProfileUpdateFieldsTests(TestCase):
    def test_put_cannot_change_email_or_staff_flags(self):
        user = User.objects.create_user(email='p@example.com', password=OLD_PW, first_name='P', last_name='Q')
        tokens = _login(self.client, user.email, OLD_PW)
        resp = self.client.put(
            reverse('accounts:profile'),
            data='{"first_name": "New", "email": "evil@example.com", "is_staff": true, "is_superuser": true}',
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {tokens['access']}",
        )
        self.assertEqual(resp.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.first_name, 'New')
        self.assertEqual(user.email, 'p@example.com')
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)


class DeleteAccountTests(TestCase):
    url = reverse_lazy('accounts:delete_account')

    def setUp(self):
        from braindumps.models import Braindump
        from characters.models import Character
        from projects.models import Project
        from usage.models import AIUsage

        self.models = (Project, Character, Braindump, AIUsage)
        self.user = User.objects.create_user(email='gone@example.com', password=OLD_PW,
                                             first_name='G', last_name='O')
        self.other = User.objects.create_user(email='stay@example.com', password=OLD_PW,
                                              first_name='S', last_name='T')
        for u, tag in ((self.user, 'u'), (self.other, 'o')):
            project = Project.objects.create(user=u, title=f'Book {tag}')
            Character.objects.create(project=project, name='Hero')
            Braindump.objects.create(project=project, title='Idea', content='x')
            AIUsage.objects.create(user=u, feature='chat', idempotency_key=f'k-{tag}')

    def _post(self, access, **body):
        return self.client.post(self.url, body, HTTP_AUTHORIZATION=f'Bearer {access}')

    def test_needs_login(self):
        resp = self.client.post(self.url, {'current_password': OLD_PW, 'confirm': 'DELETE'})
        self.assertEqual(resp.status_code, 401)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_wrong_password_keeps_account(self):
        tokens = _login(self.client, self.user.email, OLD_PW)
        resp = self._post(tokens['access'], current_password='nope', confirm='DELETE')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('current_password', resp.json())
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_confirm_word_must_be_exact(self):
        tokens = _login(self.client, self.user.email, OLD_PW)
        for word in ('', 'delete', 'DELETE ', 'yes'):
            resp = self._post(tokens['access'], current_password=OLD_PW, confirm=word)
            self.assertEqual(resp.status_code, 400, word)
        resp = self._post(tokens['access'], current_password=OLD_PW)
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_deletes_user_and_everything_they_own_only(self):
        Project, Character, Braindump, AIUsage = self.models
        laptop = _login(self.client, self.user.email, OLD_PW)
        phone = _login(self.client, self.user.email, OLD_PW)

        resp = self._post(laptop['access'], current_password=OLD_PW, confirm='DELETE')

        self.assertEqual(resp.status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertEqual(list(Project.objects.values_list('user_id', flat=True)), [self.other.pk])
        self.assertEqual(Character.objects.count(), 1)
        self.assertEqual(Braindump.objects.count(), 1)
        self.assertEqual(list(AIUsage.objects.values_list('user_id', flat=True)), [self.other.pk])
        # Signed out everywhere: no token of the deleted user works.
        for device in (laptop, phone):
            self.assertEqual(_me(self.client, device['access']).status_code, 401)
            self.assertEqual(_refresh(self.client, device['refresh']).status_code, 401)
        bad = self.client.post(reverse('accounts:token_obtain_pair'),
                               {'email': self.user.email, 'password': OLD_PW})
        self.assertEqual(bad.status_code, 400)
        # The other user still logs in.
        _login(self.client, self.other.email, OLD_PW)
