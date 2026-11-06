"""Account emails and email verification (accounts/emails.py, accounts/tokens.py).

Django's test runner swaps in the in-memory mail backend, so every sent email
lands in `mail.outbox`.
"""
import re
import smtplib
import time
from datetime import timedelta
from unittest import mock

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.emails import KINDS, send_account_email
from accounts.models import User
from accounts.tokens import make_verify_email_token

PW = 'Plenty-long-Pass-123'
NEW_PW = 'Another-long-Pass-456'
SEND = 'django.core.mail.EmailMultiAlternatives.send'


def make_user(email='ava@example.com', verified=True, **extra):
    user = User.objects.create_user(email=email, password=PW, first_name='Ava', last_name='Lee', **extra)
    if verified:
        user.mark_email_verified()
    return user


def link_in(message, path):
    """The frontend link to `path` in an email's plain-text body."""
    found = re.search(rf'(\S+{re.escape(path)}\S*)', message.body)
    assert found, message.body
    return found.group(1)


def token_from(link):
    from urllib.parse import parse_qs, urlsplit
    return parse_qs(urlsplit(link).query)['token'][0]


def sent(kind_subject):
    return [m for m in mail.outbox if m.subject == kind_subject]


class EmailRenderingTests(TestCase):
    def test_every_kind_sends_text_and_html_with_its_link(self):
        user = make_user()
        for kind in KINDS:
            mail.outbox.clear()
            self.assertTrue(send_account_email(kind, user, {'link': 'https://x.test/l?token=abc', 'hours': 1}))
            [message] = mail.outbox
            self.assertEqual(message.to, [user.email])
            self.assertTrue(message.subject.strip(), kind)
            self.assertNotIn('\n', message.subject)
            self.assertIn('Hi Ava,', message.body)
            self.assertIn('The WriterVerse team', message.body)
            self.assertIn('Just reply.', message.body)
            html, mimetype = message.alternatives[0]
            self.assertEqual(mimetype, 'text/html')
            self.assertIn('The WriterVerse team', html)
            self.assertIn('&copy; 2026 WriterVerse', html)
            if kind != 'account_deleted':
                self.assertIn('https://x.test/l?token=abc', message.body, kind)
                self.assertIn('https://x.test/l?token=abc', html, kind)

    def test_plain_text_is_not_html_escaped(self):
        user = make_user()
        user.first_name = "Ann O'Hara"
        send_account_email('welcome', user, {'link': 'https://x.test/a?b=1&c=2'})
        self.assertIn("Hi Ann O'Hara,", mail.outbox[0].body)
        self.assertIn('https://x.test/a?b=1&c=2', mail.outbox[0].body)

    @override_settings(DEFAULT_FROM_EMAIL='WriterVerse <hq@writerverse.info>')
    def test_from_address_can_have_a_display_name(self):
        send_account_email('welcome', make_user(), {'link': 'https://x.test'})
        self.assertEqual(mail.outbox[0].message()['From'], 'WriterVerse <hq@writerverse.info>')

    def test_send_failure_returns_false_and_logs_no_link(self):
        user = make_user()
        with mock.patch(SEND, side_effect=smtplib.SMTPException('server said no')), \
                self.assertLogs('accounts.emails', 'ERROR') as logs:
            ok = send_account_email('password_reset', user, {'link': 'https://x.test/?token=SECRET', 'hours': 1})
        self.assertFalse(ok)
        self.assertNotIn('SECRET', '\n'.join(logs.output))
        self.assertIn('password_reset', logs.output[0])


@override_settings(REQUIRE_EMAIL_VERIFICATION=True)
class RegisterWithVerificationTests(TestCase):
    body = {'email': 'new@example.com', 'first_name': 'Nia', 'last_name': 'W',
            'password': PW, 'password_confirm': PW, 'accepted_terms': True}

    def register(self):
        return self.client.post(reverse('accounts:register'), self.body, content_type='application/json')

    @override_settings(DEV_SHORTCUTS_ENABLED=False)
    def test_register_returns_no_tokens_and_emails_a_link(self):
        resp = self.register()
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json(), {'verification_required': True, 'email': 'new@example.com'})
        user = User.objects.get(email='new@example.com')
        self.assertIsNone(user.email_verified_at)
        [message] = mail.outbox
        self.assertEqual(message.to, ['new@example.com'])
        self.assertEqual(message.subject, 'Confirm your email for WriterVerse')
        self.assertTrue(link_in(message, '/verify-email?token=').startswith(settings.FRONTEND_URL))
        self.assertIn('24 hours', message.body)

    @override_settings(DEV_SHORTCUTS_ENABLED=True)
    def test_dev_shortcut_returns_the_link(self):
        self.assertIn('/verify-email?token=', self.register().json()['dev_verify_link'])

    def test_register_still_works_when_email_cannot_be_sent(self):
        with mock.patch(SEND, side_effect=smtplib.SMTPException('down')):
            resp = self.register()
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.json()['verification_required'])


@override_settings(REQUIRE_EMAIL_VERIFICATION=False)
class RegisterWithoutVerificationTests(TestCase):
    def test_register_signs_in_right_away_and_still_sends_the_link(self):
        resp = self.client.post(reverse('accounts:register'), {
            'email': 'new@example.com', 'first_name': 'N', 'last_name': 'W',
            'password': PW, 'password_confirm': PW,
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 201)
        self.assertIn('access', resp.json())
        self.assertNotIn('verification_required', resp.json())
        self.assertEqual(len(sent('Confirm your email for WriterVerse')), 1)


class LoginVerificationTests(TestCase):
    url = reverse('accounts:token_obtain_pair')

    def login(self, password=PW):
        return self.client.post(self.url, {'email': 'ava@example.com', 'password': password})

    @override_settings(REQUIRE_EMAIL_VERIFICATION=True)
    def test_unverified_user_with_right_password_gets_email_not_verified(self):
        make_user(verified=False)
        resp = self.login()
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()['code'], 'email_not_verified')
        self.assertNotIn('access', resp.json())

    @override_settings(REQUIRE_EMAIL_VERIFICATION=True)
    def test_wrong_password_does_not_reveal_verification_state(self):
        make_user(verified=False)
        resp = self.login(password='wrong-password')
        self.assertEqual(resp.status_code, 400)
        self.assertNotIn('email_not_verified', resp.content.decode())

    @override_settings(REQUIRE_EMAIL_VERIFICATION=True)
    def test_verified_user_signs_in(self):
        make_user(verified=True)
        self.assertEqual(self.login().status_code, 200)

    @override_settings(REQUIRE_EMAIL_VERIFICATION=False)
    def test_not_required_lets_unverified_user_sign_in(self):
        make_user(verified=False)
        self.assertEqual(self.login().status_code, 200)

    @override_settings(REQUIRE_EMAIL_VERIFICATION=True)
    def test_refresh_is_refused_for_unverified_user(self):
        user = make_user(verified=False)
        refresh = str(RefreshToken.for_user(user))
        resp = self.client.post(reverse('accounts:token_refresh'), {'refresh': refresh})
        self.assertEqual(resp.status_code, 401)
        user.mark_email_verified()
        resp = self.client.post(reverse('accounts:token_refresh'), {'refresh': refresh})
        self.assertEqual(resp.status_code, 200)


@override_settings(REQUIRE_EMAIL_VERIFICATION=True)
class VerifyEmailTests(TestCase):
    url = reverse('accounts:verify_email')

    def setUp(self):
        self.user = make_user(verified=False)

    def verify(self, token):
        return self.client.post(self.url, {'token': token})

    def test_link_verifies_signs_in_and_sends_welcome_once(self):
        token = make_verify_email_token(self.user)
        resp = self.verify(token)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.json())
        self.assertEqual(resp.json()['user']['email'], self.user.email)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.email_verified_at)
        [welcome] = sent('Welcome to WriterVerse')
        self.assertIn('/library', welcome.body)
        # The tokens work.
        me = self.client.get(reverse('accounts:profile'), HTTP_AUTHORIZATION=f"Bearer {resp.json()['access']}")
        self.assertEqual(me.status_code, 200)

    def test_link_works_only_once(self):
        token = make_verify_email_token(self.user)
        self.assertEqual(self.verify(token).status_code, 200)
        again = self.verify(token)
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.json()['code'], 'link_invalid')
        self.assertEqual(len(sent('Welcome to WriterVerse')), 1)

    def test_link_expires_after_24_hours(self):
        token = make_verify_email_token(self.user)
        later = time.time() + timedelta(hours=24, minutes=1).total_seconds()
        with mock.patch('django.core.signing.time.time', return_value=later):
            resp = self.verify(token)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()['code'], 'link_invalid')
        self.user.refresh_from_db()
        self.assertIsNone(self.user.email_verified_at)

    def test_garbage_and_tampered_tokens_are_refused(self):
        token = make_verify_email_token(self.user)
        for bad in ('garbage', token[:-2] + 'xx'):
            self.assertEqual(self.verify(bad).status_code, 400, bad)

    def test_link_for_an_old_email_address_is_refused(self):
        token = make_verify_email_token(self.user)
        self.user.email = 'changed@example.com'
        self.user.save()
        self.assertEqual(self.verify(token).status_code, 400)

    def test_link_from_the_signup_email_works_end_to_end(self):
        resp = self.client.post(reverse('accounts:register'), {
            'email': 'flow@example.com', 'first_name': 'F', 'last_name': 'L',
            'password': PW, 'password_confirm': PW, 'accepted_terms': True,
        }, content_type='application/json')
        self.assertNotIn('access', resp.json())
        token = token_from(link_in(sent('Confirm your email for WriterVerse')[0], '/verify-email?token='))
        self.assertEqual(self.verify(token).status_code, 200)
        login = self.client.post(reverse('accounts:token_obtain_pair'), {'email': 'flow@example.com', 'password': PW})
        self.assertEqual(login.status_code, 200)


@override_settings(DEV_SHORTCUTS_ENABLED=False)
class ResendVerificationTests(TestCase):
    url = reverse('accounts:verify_email_resend')

    def resend(self, email):
        return self.client.post(self.url, {'email': email})

    def test_same_answer_for_unknown_unverified_and_verified(self):
        make_user('waiting@example.com', verified=False)
        make_user('done@example.com', verified=True)
        answers = [self.resend(e) for e in ('nobody@example.com', 'WAITING@example.com', 'done@example.com')]
        self.assertEqual({r.status_code for r in answers}, {200})
        self.assertEqual(len({r.content for r in answers}), 1)
        [message] = mail.outbox
        self.assertEqual(message.to, ['waiting@example.com'])
        self.assertIn('/verify-email?token=', message.body)

    def test_same_answer_when_sending_fails(self):
        make_user('waiting@example.com', verified=False)
        ok = self.resend('nobody@example.com')
        with mock.patch(SEND, side_effect=smtplib.SMTPException('down')):
            failed = self.resend('waiting@example.com')
        self.assertEqual(failed.status_code, 200)
        self.assertEqual(failed.content, ok.content)


@override_settings(DEV_SHORTCUTS_ENABLED=False)
class PasswordEmailsTests(TestCase):
    def setUp(self):
        self.user = make_user()

    def reset_confirm(self, user):
        return self.client.post(reverse('accounts:password_reset_confirm'), {
            'uid': urlsafe_base64_encode(force_bytes(user.pk)),
            'token': default_token_generator.make_token(user),
            'new_password': NEW_PW,
        })

    def test_reset_links_last_one_hour(self):
        self.assertEqual(settings.PASSWORD_RESET_TIMEOUT, 3600)
        self.client.post(reverse('accounts:password_reset'), {'email': self.user.email})
        [message] = sent('Reset your WriterVerse password')
        self.assertIn('/reset-password?uid=', message.body)
        self.assertIn('1 hour ', message.body)

    def test_reset_request_answer_is_the_same_when_sending_fails(self):
        url = reverse('accounts:password_reset')
        unknown = self.client.post(url, {'email': 'nobody@example.com'})
        with mock.patch(SEND, side_effect=smtplib.SMTPException('down')):
            failed = self.client.post(url, {'email': self.user.email})
        self.assertEqual(failed.status_code, 200)
        self.assertEqual(failed.content, unknown.content)

    def test_reset_confirm_sends_password_changed(self):
        self.assertEqual(self.reset_confirm(self.user).status_code, 200)
        [message] = sent('Your WriterVerse password was changed')
        self.assertEqual(message.to, [self.user.email])
        self.assertIn('/forgot-password', message.body)
        self.assertIn('reply to this email', message.body)
        self.assertEqual(sent('Welcome to WriterVerse'), [])  # already verified

    def test_reset_confirm_verifies_an_unverified_email(self):
        user = make_user('late@example.com', verified=False)
        self.assertEqual(self.reset_confirm(user).status_code, 200)
        user.refresh_from_db()
        self.assertIsNotNone(user.email_verified_at)
        self.assertEqual(len(sent('Welcome to WriterVerse')), 1)

    def test_change_password_sends_password_changed(self):
        login = self.client.post(reverse('accounts:token_obtain_pair'), {'email': self.user.email, 'password': PW})
        resp = self.client.post(
            reverse('accounts:password_change'),
            {'current_password': PW, 'new_password': NEW_PW},
            HTTP_AUTHORIZATION=f"Bearer {login.json()['access']}",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(sent('Your WriterVerse password was changed')), 1)

    @override_settings(REQUIRE_EMAIL_VERIFICATION=True)
    def test_change_password_refused_while_email_unverified(self):
        user = make_user('late@example.com', verified=False)
        access = RefreshToken.for_user(user).access_token
        resp = self.client.post(
            reverse('accounts:password_change'),
            {'current_password': PW, 'new_password': NEW_PW},
            HTTP_AUTHORIZATION=f'Bearer {access}',
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()['code'], 'email_not_verified')
        user.refresh_from_db()
        self.assertTrue(user.check_password(PW))

    def test_change_password_still_works_when_email_cannot_be_sent(self):
        login = self.client.post(reverse('accounts:token_obtain_pair'), {'email': self.user.email, 'password': PW})
        with mock.patch(SEND, side_effect=smtplib.SMTPException('down')):
            resp = self.client.post(
                reverse('accounts:password_change'),
                {'current_password': PW, 'new_password': NEW_PW},
                HTTP_AUTHORIZATION=f"Bearer {login.json()['access']}",
            )
        self.assertEqual(resp.status_code, 200)


class AccountDeletedEmailTests(TestCase):
    def test_delete_sends_goodbye_to_the_old_address(self):
        user = make_user()
        login = self.client.post(reverse('accounts:token_obtain_pair'), {'email': user.email, 'password': PW})
        resp = self.client.post(
            reverse('accounts:delete_account'),
            {'current_password': PW, 'confirm': 'DELETE'},
            HTTP_AUTHORIZATION=f"Bearer {login.json()['access']}",
        )
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(User.objects.filter(email=user.email).exists())
        [message] = mail.outbox
        self.assertEqual(message.subject, 'Your WriterVerse account was deleted')
        self.assertEqual(message.to, ['ava@example.com'])
        self.assertIn('Hi Ava,', message.body)

    def test_failed_goodbye_email_still_logs_the_user_id(self):
        user = make_user()
        user_id = user.pk
        login = self.client.post(reverse('accounts:token_obtain_pair'), {'email': user.email, 'password': PW})
        with mock.patch(SEND, side_effect=smtplib.SMTPException('down')), \
                self.assertLogs('accounts.emails', level='ERROR') as logs:
            resp = self.client.post(
                reverse('accounts:delete_account'),
                {'current_password': PW, 'confirm': 'DELETE'},
                HTTP_AUTHORIZATION=f"Bearer {login.json()['access']}",
            )
        self.assertEqual(resp.status_code, 204)
        self.assertIn(f'user_id={user_id}', logs.output[0])
