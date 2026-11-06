"""
Authentication views using DRF class-based views (best practice).
Clean, maintainable, and automatically generates proper OpenAPI schemas.
"""
import logging

from common.throttling import SharedScopedRateThrottle
from django.conf import settings
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .emails import (
    ACCOUNT_DELETED,
    PASSWORD_CHANGED,
    PASSWORD_RESET,
    VERIFY_EMAIL,
    WELCOME,
    send_account_email,
)
from .models import User
from .serializers import (
    ChangePasswordSerializer,
    DeleteAccountSerializer,
    PasswordCheckedTokenRefreshSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ResendVerificationSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
    UserUpdateSerializer,
    VerifyEmailSerializer,
)
from .tokens import (
    PASSWORD_RESET_HOURS,
    VERIFY_EMAIL_HOURS,
    forgot_password_link,
    library_link,
    password_reset_link,
    user_for_verify_email_token,
    verify_email_link,
)

logger = logging.getLogger(__name__)

LINK_INVALID = 'link_invalid'


def send_verify_email(user):
    """Email the verify link; return the link (for the dev shortcut)."""
    link = verify_email_link(user)
    send_account_email(VERIFY_EMAIL, user, {'link': link, 'hours': VERIFY_EMAIL_HOURS})
    return link


def confirm_email(user):
    """Mark the inbox as proven. The first time, send the welcome email."""
    if user.mark_email_verified():
        send_account_email(WELCOME, user, {'link': library_link()})


def send_password_changed(user):
    send_account_email(PASSWORD_CHANGED, user, {'link': forgot_password_link()})


def signed_in_response(user, status_code=status.HTTP_200_OK):
    """A fresh token pair plus the profile: what login, register and verify return."""
    refresh = RefreshToken.for_user(user)
    return Response({
        'refresh': str(refresh),
        'access': str(refresh.access_token),
        'user': UserProfileSerializer(user).data,
    }, status=status_code)


def end_all_sessions(user):
    """Blacklist every refresh token this user still has, so no device can
    get a new access token. Access tokens already out die on their own: they
    carry a password hash (CHECK_REVOKE_TOKEN), or the user no longer exists."""
    outstanding = OutstandingToken.objects.filter(user=user, blacklistedtoken__isnull=True)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=t) for t in outstanding], ignore_conflicts=True,
    )


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom JWT token obtain view that uses email instead of username.
    Automatically generates OpenAPI schema.
    Includes rate limiting for login attempts.
    """
    serializer_class = UserLoginSerializer
    throttle_classes = [SharedScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        # No emails or IP addresses in logs: they are personal data.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']

        logger.info("Successful login: user id=%s", user.pk)

        return signed_in_response(user)


class UserRegistrationView(GenericAPIView):
    """
    User registration endpoint. Always emails a verify-email link.

    With REQUIRE_EMAIL_VERIFICATION on (deployed), no tokens come back: the
    answer is `verification_required: true` and the user signs in by clicking
    the link. Off (local, CI), the user is signed in right away as before.
    """
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [SharedScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.save()
        link = send_verify_email(user)

        logger.info("Successful registration: user id=%s", user.pk)

        if settings.REQUIRE_EMAIL_VERIFICATION:
            response = Response(
                {'verification_required': True, 'email': user.email},
                status=status.HTTP_201_CREATED,
            )
        else:
            response = signed_in_response(user, status.HTTP_201_CREATED)
        # Dev only (off when deployed): the link in the answer, no inbox needed.
        if settings.DEV_SHORTCUTS_ENABLED:
            response.data['dev_verify_link'] = link
        return response


class VerifyEmailView(GenericAPIView):
    """
    The verify-email link lands here (via the frontend's /verify-email page).
    Marks the email verified, sends the welcome email, and signs the user in.
    A link works once, for 24 hours.
    """
    serializer_class = VerifyEmailSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [SharedScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = user_for_verify_email_token(serializer.validated_data['token'])
        if user is None:
            return Response({
                'detail': 'This link has expired or was already used.',
                'code': LINK_INVALID,
            }, status=status.HTTP_400_BAD_REQUEST)

        confirm_email(user)
        logger.info("Email verified: user id=%s", user.pk)
        return signed_in_response(user)


class ResendVerificationView(GenericAPIView):
    """
    Send the verify-email link again. Same answer whether or not the email has
    an unverified account, so it can't be used to find out who signed up.
    """
    serializer_class = ResendVerificationSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [SharedScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data['email'],
            email_verified_at__isnull=True,
            is_active=True,
        ).first()

        response_data = {'detail': "If that email is waiting to be confirmed, we've sent a new link."}
        if user is not None:
            link = send_verify_email(user)
            # Dev only (off when deployed).
            if settings.DEV_SHORTCUTS_ENABLED:
                response_data['dev_verify_link'] = link
        return Response(response_data)


class CustomTokenRefreshView(TokenRefreshView):
    """
    Custom JWT token refresh view with rate limiting.
    Limits token refresh attempts to prevent abuse.
    """
    serializer_class = PasswordCheckedTokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class UserProfileView(GenericAPIView):
    """
    User profile management endpoint.
    Automatically generates OpenAPI schema for GET and PUT methods.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'PUT':
            return UserUpdateSerializer
        return UserProfileSerializer

    def get(self, request, *args, **kwargs):
        """Get current user profile."""
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    def put(self, request, *args, **kwargs):
        """Update current user profile."""
        serializer = self.get_serializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(UserProfileSerializer(request.user).data)


class PasswordResetRequestView(GenericAPIView):
    """
    Request a password reset email. Always returns 200 regardless of whether
    the email is registered or the email could be sent, so the endpoint can't
    be used to enumerate users.
    """
    serializer_class = PasswordResetRequestSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [SharedScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            user = None

        response_data = {'detail': 'If an account exists for that email, a reset link has been sent.'}

        if user is not None:
            reset_link = password_reset_link(user)
            logger.info("Password reset requested: user id=%s", user.pk)
            send_account_email(PASSWORD_RESET, user, {'link': reset_link, 'hours': PASSWORD_RESET_HOURS})

            # Dev only (off when deployed): the link in the answer, no inbox needed.
            if settings.DEV_SHORTCUTS_ENABLED:
                response_data['dev_reset_link'] = reset_link

        return Response(response_data)


class PasswordResetConfirmView(GenericAPIView):
    """
    Confirm a password reset using the uid/token from the emailed link.
    The link came to the user's inbox, so this also verifies their email.
    """
    serializer_class = PasswordResetConfirmSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [SharedScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = serializer.save()
            end_all_sessions(user)
        confirm_email(user)
        send_password_changed(user)

        logger.info("Password reset completed: user id=%s", user.pk)
        return Response({'detail': 'Password has been reset successfully.'})


class ChangePasswordView(GenericAPIView):
    """
    Change the password while signed in. Needs the current password.
    Every other device is signed out; this one gets fresh tokens back.
    """
    serializer_class = ChangePasswordSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SharedScopedRateThrottle]
    throttle_scope = 'account'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user

        with transaction.atomic():
            user.set_password(serializer.validated_data['new_password'])
            user.save(update_fields=['password'])
            end_all_sessions(user)
        refresh = RefreshToken.for_user(user)
        send_password_changed(user)

        logger.info("Password changed for user id=%s", user.pk)
        return Response({
            'detail': 'Password changed.',
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        })


class DeleteAccountView(GenericAPIView):
    """
    Permanently delete the signed-in account and everything it owns.
    Needs the current password and the word DELETE. Cannot be undone.

    Deleting the user cascades to its projects (and every row under them)
    and every other row that points at the user (e.g. its AI usage records).
    Any app that keeps records it must legally retain has to protect them itself.
    """
    serializer_class = DeleteAccountSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SharedScopedRateThrottle]
    throttle_scope = 'account'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        user_id = user.pk

        with transaction.atomic():
            end_all_sessions(user)
            user.delete()
        # The deleted user object still holds its email and first name.
        send_account_email(ACCOUNT_DELETED, user, user_id=user_id)

        logger.info("Account deleted: user id=%s", user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserLogoutView(APIView):
    """
    User logout endpoint.
    Automatically generates OpenAPI schema.
    Logout does not require authentication to handle expired token cases.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        """Logout user by blacklisting refresh token."""
        try:
            refresh_token = request.data.get("refresh")
            if refresh_token:
                token = RefreshToken(refresh_token)
                try:
                    token.blacklist()
                except Exception as e:
                    # If blacklisting fails (e.g., already blacklisted), that's okay
                    logger.warning(f"Token blacklisting failed: {e}")
            return Response(status=status.HTTP_205_RESET_CONTENT)
        except Exception as e:
            logger.error(f"Logout error: {e}")
            # Still return success to allow client-side cleanup
            return Response(status=status.HTTP_205_RESET_CONTENT)
