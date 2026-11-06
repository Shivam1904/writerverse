# accounts

Custom user model with email-based authentication and JWT tokens.

## Role in the System

WriterVerse replaces username-based auth with email-first registration. The `User` model extends Django's `AbstractUser`, removes the username field entirely, and uses email as the primary identifier. Authentication is handled via JWT (SimpleJWT) with access/refresh token pairs.

The app also lets a signed-in user change their password and delete their account (SA-57).

## How It Connects

- `User` is the FK target for `Project.user` and `AIUsage` (usage), all `CASCADE`. Deleting a user deletes all of it.
- All other domain apps reference User indirectly through Project.
- JWT tokens issued here are consumed by every authenticated endpoint across the backend.

## Key Patterns

- **No username**: `USERNAME_FIELD = 'email'`, `username = None`. Registration requires only email + password.
- **Custom UserManager**: `create_user()` and `create_superuser()` both work with email only.
- **Token blacklist**: Logout blacklists the refresh token via `rest_framework_simplejwt.token_blacklist`.
- **Password in the token**: `CHECK_REVOKE_TOKEN` puts a hash of the password in every token. A password change or reset makes all older tokens fail; `end_all_sessions()` also blacklists every refresh token. The refresh view refuses a refresh token from before the last password change.
- **Terms acceptance** (SA-50): register takes `accepted_terms`. When true, the server sets `terms_accepted_at` (now) and `terms_version` (the `TERMS_VERSION` setting); the client never sends either. `REQUIRE_TERMS_ACCEPTANCE` (setting, default on when deployed) makes it required. Both can be set from the environment. Accounts made in the admin or with `createsuperuser` have no terms record.
- **Account emails** (`emails.py`): one function, `send_account_email(kind, user, context)`, renders `templates/accounts/emails/<kind>_subject.txt`, `<kind>.txt` and `<kind>.html` and sends text + HTML. It never raises; a failure is logged (no body, no tokens) and returns `False`. Kinds: `verify_email` (sign-up, resend), `welcome` (first time the email is confirmed), `password_reset` (link works 1 hour), `password_changed` (after a reset or a change), `account_deleted` (after delete, to the old address). Locally the console backend prints them in the server terminal. Full page: [`docs/how-it-works/account-emails.md`](../../docs/how-it-works/account-emails.md).
- **Email verification**: `User.email_verified_at`. With `REQUIRE_EMAIL_VERIFICATION` (settings, on when deployed) register returns `verification_required` instead of tokens, and login (after the password check) and refresh refuse an unconfirmed user (`code: email_not_verified`, 403). `verify-email/` takes the signed token from the link (`tokens.py`: 24 hours, dead once used), confirms, sends `welcome` and returns tokens. `verify-email/resend/` answers the same for every email. A finished password reset also confirms the email.
- **Change password** (`password-change/`): current password + Django validators; returns a fresh token pair for this device.
- **Delete account** (`delete-account/`): current password + the exact word `DELETE`, checked on the server; ends all sessions, then deletes the user (everything owned cascades).
- **Rate limiting**: login, register, verify email (and resend) and password reset share the `auth` scope (30/min). Change password and delete account use the stricter `account` scope (10/hour per user), so a stolen token can't be used to guess the password.
- **django-axes** only guards the Django admin login, not the API.
- **Email case**: emails are stored all lowercase (`UserManager.normalize_email`) and login finds the user ignoring case (`get_by_natural_key`), so `Ann@X.com` and `ann@x.com` are one account.
- **Logs**: account logs name the user id only, never the email or IP address.

## Source Map

| File | Purpose |
|------|---------|
| [models.py](models.py) | `User` model, `UserManager` |
| [views.py](views.py) | Login, register, verify email, logout, profile, token refresh, password reset/change, delete account |
| [serializers.py](serializers.py) | Registration, login, profile, update serializers |
| [emails.py](emails.py) | `send_account_email()`: every email to a user about their account |
| [tokens.py](tokens.py) | The emailed links and their tokens (verify email, password reset) |
| [templates/accounts/emails/](templates/accounts/emails/) | Subject, text and HTML template per email |
| [urls.py](urls.py) | Auth route definitions (`/api/auth/`) |
