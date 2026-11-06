"""The links we email, and the tokens inside them.

- **Verify email** (``/verify-email?token=...``): a signed, timestamped token
  (``django.core.signing``) holding the user id and email. It works for 24 hours
  and only while the account is unverified, so once it is used it is dead. The
  email is in it so a link sent to an old address can't verify a new one.
- **Password reset** (``/reset-password?uid=...&token=...``): Django's own
  ``default_token_generator``. It dies when the password changes (so it works
  once) and after ``PASSWORD_RESET_TIMEOUT`` (1 hour, settings.py).
"""
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.utils.encoding import force_bytes
from django.utils.http import urlencode, urlsafe_base64_encode

from .models import User

VERIFY_EMAIL_SALT = 'accounts.verify-email'
VERIFY_EMAIL_MAX_AGE = timedelta(hours=24)
VERIFY_EMAIL_HOURS = int(VERIFY_EMAIL_MAX_AGE.total_seconds() // 3600)
PASSWORD_RESET_HOURS = settings.PASSWORD_RESET_TIMEOUT // 3600


def _frontend_link(path, **params):
    base = settings.FRONTEND_URL.rstrip('/') + path
    return f'{base}?{urlencode(params)}' if params else base


def make_verify_email_token(user):
    return signing.dumps({'u': user.pk, 'e': user.email}, salt=VERIFY_EMAIL_SALT)


def user_for_verify_email_token(token):
    """The unverified user this token belongs to, or None (bad, expired or used)."""
    try:
        data = signing.loads(token, salt=VERIFY_EMAIL_SALT, max_age=VERIFY_EMAIL_MAX_AGE)
    except signing.BadSignature:  # also covers SignatureExpired
        return None
    if not isinstance(data, dict):
        return None
    return User.objects.filter(
        pk=data.get('u'), email=data.get('e'), email_verified_at__isnull=True, is_active=True,
    ).first()


def verify_email_link(user):
    return _frontend_link('/verify-email', token=make_verify_email_token(user))


def password_reset_link(user):
    return _frontend_link(
        '/reset-password',
        uid=urlsafe_base64_encode(force_bytes(user.pk)),
        token=default_token_generator.make_token(user),
    )


def forgot_password_link():
    return _frontend_link('/forgot-password')


def library_link():
    return _frontend_link('/library')
