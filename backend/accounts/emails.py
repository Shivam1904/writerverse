"""Account emails: the one place that sends mail to a user about their account.

Each email is a *kind* with three templates in ``templates/accounts/emails/``:

- ``<kind>_subject.txt``: one line,
- ``<kind>.txt``: the plain-text body (extends ``base.txt``),
- ``<kind>.html``: the HTML body (extends ``base.html``).

Both bodies get the same context: ``first_name``, ``frontend_url``, plus
whatever the caller passes (e.g. ``link``). Locally the console backend prints
every email in the ``make local`` terminal; prod sends through SMTP.

Sending never raises into the request. A broken mail server must not turn a
sign-up or a password reset into a 500 (and a different response for known
emails would tell a stranger which accounts exist). The failure is logged
without the email's content, since links in it carry tokens.
"""
import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)

VERIFY_EMAIL = 'verify_email'
WELCOME = 'welcome'
PASSWORD_RESET = 'password_reset'
PASSWORD_CHANGED = 'password_changed'
ACCOUNT_DELETED = 'account_deleted'

KINDS = (VERIFY_EMAIL, WELCOME, PASSWORD_RESET, PASSWORD_CHANGED, ACCOUNT_DELETED)

TEMPLATE_DIR = 'accounts/emails'


def render_account_email(kind, user, context=None):
    """(subject, text, html) for one email. Raises if a template is missing."""
    if kind not in KINDS:
        raise ValueError(f'Unknown account email kind: {kind}')
    ctx = {
        'first_name': (user.first_name or '').strip(),
        'frontend_url': settings.FRONTEND_URL.rstrip('/'),
        **(context or {}),
    }
    subject = render_to_string(f'{TEMPLATE_DIR}/{kind}_subject.txt', ctx)
    # A header can't hold a newline; templates end with one.
    subject = ' '.join(subject.split())
    text = render_to_string(f'{TEMPLATE_DIR}/{kind}.txt', ctx).strip() + '\n'
    html = render_to_string(f'{TEMPLATE_DIR}/{kind}.html', ctx)
    return subject, text, html


def send_account_email(kind, user, context=None, user_id=None):
    """Send one account email to ``user.email``. True if sent, False if not.

    ``user`` only needs ``email``, ``first_name`` and ``pk``, so a user object
    that was just deleted still works (it keeps its fields in memory). Django
    clears ``pk`` on delete, so pass ``user_id`` to keep it in the log lines.
    """
    user_id = user_id or user.pk
    try:
        subject, text, html = render_account_email(kind, user, context)
        message = EmailMultiAlternatives(
            subject=subject,
            body=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        message.attach_alternative(html, 'text/html')
        message.send()
    except Exception as exc:  # noqa: BLE001 - mail must never break the request
        # Only the kind, the user id and the error type: the body has tokens.
        logger.error(
            'Account email failed: kind=%s user_id=%s error=%s',
            kind, user_id, type(exc).__name__,
        )
        return False
    logger.info('Account email sent: kind=%s user_id=%s', kind, user_id)
    return True
