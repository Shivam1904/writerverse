# Account emails and email verification

> Covers: `backend/accounts/emails.py`, `backend/accounts/tokens.py`, `backend/accounts/templates/accounts/emails/`, `backend/accounts/views.py`, `frontend/src/components/EmailVerification.tsx`, `frontend/src/components/VerifyEmailPage.tsx`

WriterVerse sends a few short emails about the account itself: confirm your email,
welcome, reset your password, "your password changed", and "your account is deleted".
No marketing, no AI. All of them go through one function, `send_account_email(kind, user, context)`
in `backend/accounts/emails.py`.

## The emails

| Kind | Sent when | Link inside |
| --- | --- | --- |
| `verify_email` | Sign-up, and when the user asks for a new link (sign-up "Check your inbox" screen, login, or a dead link page) | `/verify-email?token=…`, works 24 hours, once |
| `welcome` | Once, the first time the email is confirmed (verify link, or a finished password reset) | `/library` |
| `password_reset` | "Forgot password" | `/reset-password?uid=…&token=…`, works 1 hour, once |
| `password_changed` | After a password reset **and** after "Change password" on the Profile page | `/forgot-password` ("if this wasn't you") |
| `account_deleted` | After "Delete account" succeeds. Goes to the old address. | none |

Every email has a plain-text body and an HTML body (multipart), signed "— The WriterVerse team",
with the footer "You're getting this because you have a WriterVerse account. Questions? Just reply."
The from address is `DEFAULT_FROM_EMAIL`; a display name works (`WriterVerse <hq@writerverse.info>`).
That inbox receives mail, so replies reach us.

**Sending never breaks a request.** If the mail server fails, `send_account_email` logs the
kind, the user id and the error type (never the body: links hold tokens) and returns `False`.
The API answer stays the same, so a failure can't tell a stranger which emails have accounts.
SMTP has a 10 second timeout (`EMAIL_TIMEOUT`).

## Templates

`backend/accounts/templates/accounts/emails/`. For each kind:

- `<kind>_subject.txt`: one line.
- `<kind>.txt`: plain text, extends `base.txt` (greeting, sign-off, footer).
- `<kind>.html`: extends `base.html`, the one layout. It matches the style of the landing site's waitlist email, so all our mail looks like one family: a white card with a gold top bar, the logo (`https://writerverse.info/logo.png`) next to a small-caps wordmark, a two-line serif hero (the second line in italic gold), the body, an italic sign-off and a small footer. A child only fills blocks: `preheader` (the inbox preview line), `hero_title`, `hero_accent`, `content`, and optionally `notice` / `after_notice` / `footer`. The HTML uses tables and inline styles only, because Gmail and Outlook ignore stylesheets. Buttons come from `_button.html`, which has a separate version for Outlook. The "if this wasn't you" box comes from `_notice.html`.

Every template gets `first_name`, `frontend_url`, plus what the caller passes (`link`, `hours`).
To add an email: add the kind to `KINDS` in `emails.py`, add its three templates, call
`send_account_email` where it happens, and add a test in `backend/accounts/tests/test_emails.py`.

## Email verification

`User.email_verified_at` is empty until the user proves they own the inbox.
`REQUIRE_EMAIL_VERIFICATION` (settings; on when deployed, off locally and in CI, can be set by env)
decides whether that matters:

- **On:** sign-up creates the account and sends `verify_email`, but returns no tokens:
  the answer is `{"verification_required": true, "email": …}` and the page shows **Check your inbox**
  (with **Resend link** and **Wrong email? Sign up again**). Login with the right password
  but an unconfirmed email gets a 403 with `code: "email_not_verified"`; the login page then
  shows "Please confirm your email first" and a **Resend link** button. The password is checked
  first, so without it nobody learns whether an email is confirmed. Token refresh is refused too.
- **Off:** sign-up signs the user in straight away, as before. The verify email is still sent.

The link opens `/verify-email` (frontend), which posts the token to `/api/auth/verify-email/`.
On success the email is marked confirmed, `welcome` is sent, and the answer carries a token pair,
so the user lands in their library signed in. An expired, used or broken link shows
"That link didn't work" with a form to send a new one (`/api/auth/verify-email/resend/`,
which answers the same for every email).

The token (`backend/accounts/tokens.py`) is signed with the server's secret and holds the
user id and email. It works only while the account is unconfirmed, so a used link is dead.
Finishing a password reset also marks the email confirmed: the reset link came to that inbox.
Accounts that existed before verification were marked confirmed by migration `0004`.
In the admin, staff can set `email_verified_at` by hand (e.g. the email never arrived).

## Try it locally

Without `EMAIL_HOST`, Django's console backend prints each email (text and HTML) in the
`make local` terminal. With `DEV_SHORTCUTS_ENABLED` (on only in local dev: local runtime, `DEBUG`, `FRONTEND_URL` on localhost; never on a deployed or public server), the API also returns
`dev_verify_link` / `dev_reset_link`, and the pages show the link in a dashed "Dev shortcut" box.
To try the full gate locally, set `REQUIRE_EMAIL_VERIFICATION=true` in `backend/.env`.
To print every email without a server: `render_account_email(kind, user, context)` in a
`manage.py shell` returns subject, text and HTML.
