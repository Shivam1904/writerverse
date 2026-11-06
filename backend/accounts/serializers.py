from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import get_md5_hash_password

from .models import User

EMAIL_NOT_VERIFIED = 'email_not_verified'


class EmailNotVerified(PermissionDenied):
    """403 with a `code` the frontend reads to offer "Resend link".

    Not 401: the app treats a 401 as "session ended" and tries a token refresh.
    """

    def __init__(self):
        super().__init__({
            'detail': 'Please confirm your email first. Check your inbox for our link.',
            'code': EMAIL_NOT_VERIFIED,
        })


def email_verification_blocks(user):
    """True when this user must confirm their email before signing in."""
    return settings.REQUIRE_EMAIL_VERIFICATION and not user.is_email_verified


class UserRegistrationSerializer(serializers.ModelSerializer):
    """
    Serializer for user registration.
    """
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)
    # The sign-up checkbox. Required when deployed (REQUIRE_TERMS_ACCEPTANCE).
    # Only `true` is recorded; the time and terms version come from the server.
    accepted_terms = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = User
        fields = ('email', 'first_name', 'last_name', 'password', 'password_confirm', 'accepted_terms')
        extra_kwargs = {
            'email': {'required': True},
            'first_name': {'required': True},
            'last_name': {'required': True},
        }

    def validate(self, attrs):
        """
        Validate that password and password_confirm match.
        """
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError("Passwords don't match.")
        return attrs

    def validate_accepted_terms(self, value):
        if settings.REQUIRE_TERMS_ACCEPTANCE and not value:
            raise serializers.ValidationError('You must accept the Terms and Conditions to create an account.')
        return value

    def validate_email(self, value):
        """
        Validate that email is unique.
        """
        # Case-insensitive: "Ann@x.com" and "ann@x.com" are the same inbox, and
        # password reset looks emails up case-insensitively.
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return User.objects.normalize_email(value)

    def create(self, validated_data):
        """
        Create a new user with encrypted password.
        """
        validated_data.pop('password_confirm')
        if validated_data.pop('accepted_terms', False):
            validated_data['terms_accepted_at'] = timezone.now()
            validated_data['terms_version'] = settings.TERMS_VERSION
        return User.objects.create_user(**validated_data)


class UserLoginSerializer(serializers.Serializer):
    """
    Serializer for user login.
    """
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        """
        Validate user credentials.
        """
        email = attrs.get('email')
        password = attrs.get('password')

        if email and password:
            # django-axes' auth backend requires the request (SA-72).
            user = authenticate(self.context.get('request'), email=email, password=password)
            if not user:
                raise serializers.ValidationError('Invalid email or password.')
            if not user.is_active:
                raise serializers.ValidationError('User account is disabled.')
            # Only after the password matched: a stranger without the password
            # can't use this answer to learn which emails have accounts.
            if email_verification_blocks(user):
                raise EmailNotVerified()
            attrs['user'] = user
        else:
            raise serializers.ValidationError('Must include email and password.')

        return attrs


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Serializer for user profile information.
    """
    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'date_joined')
        read_only_fields = ('id', 'email', 'date_joined')


class UserUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating user profile.
    """
    class Meta:
        model = User
        fields = ('first_name', 'last_name')


class PasswordResetRequestSerializer(serializers.Serializer):
    """
    Serializer for requesting a password reset email.
    """
    email = serializers.EmailField()


class ResendVerificationSerializer(serializers.Serializer):
    """Resend the verify-email link."""
    email = serializers.EmailField()


class VerifyEmailSerializer(serializers.Serializer):
    """The token from the verify-email link."""
    token = serializers.CharField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """
    Serializer for confirming a password reset with the emailed uid/token.
    """
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate(self, attrs):
        try:
            user_id = force_str(urlsafe_base64_decode(attrs['uid']))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist) as exc:
            raise serializers.ValidationError('This reset link is invalid or has expired.') from exc

        if not default_token_generator.check_token(user, attrs['token']):
            raise serializers.ValidationError('This reset link is invalid or has expired.')

        attrs['user'] = user
        return attrs

    def save(self):
        user = self.validated_data['user']
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


class PasswordCheckedTokenRefreshSerializer(TokenRefreshSerializer):
    """Refresh, but refuse a refresh token from before the last password change.

    Access tokens copy their claims from the refresh token. Without this check
    an old refresh token (say, one minted before CHECK_REVOKE_TOKEN was on)
    would keep handing out access tokens that then fail on every request, and
    the app would never send the user back to the login page.
    """

    def validate(self, attrs):
        refresh = RefreshToken(attrs['refresh'])
        user = User.objects.filter(pk=refresh.payload.get(jwt_settings.USER_ID_CLAIM)).first()
        if user is None:
            raise InvalidToken('User not found.')
        if jwt_settings.CHECK_REVOKE_TOKEN and (
            refresh.payload.get(jwt_settings.REVOKE_TOKEN_CLAIM) != get_md5_hash_password(user.password)
        ):
            raise InvalidToken("The user's password has been changed.")
        if email_verification_blocks(user):
            raise InvalidToken('Email not verified.')
        return super().validate(attrs)


class CurrentPasswordMixin:
    """Checks `current_password` against the signed-in user."""

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Your current password is not correct.')
        return value


class ChangePasswordSerializer(CurrentPasswordMixin, serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = self.context['request'].user
        # Same gate as login and token refresh: this view hands out new tokens.
        if email_verification_blocks(user):
            raise EmailNotVerified()
        if attrs['new_password'] == attrs['current_password']:
            raise serializers.ValidationError(
                {'new_password': ['The new password must be different from the current one.']}
            )
        try:
            validate_password(attrs['new_password'], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)}) from exc
        return attrs


DELETE_CONFIRMATION = 'DELETE'


class DeleteAccountSerializer(CurrentPasswordMixin, serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_confirm(self, value):
        # Exact match, checked on the server too: this cannot be undone.
        if value != DELETE_CONFIRMATION:
            raise serializers.ValidationError(f'Type {DELETE_CONFIRMATION} to confirm.')
        return value
