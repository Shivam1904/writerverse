from django.urls import path

from .views import (
    ChangePasswordView,
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    DeleteAccountView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ResendVerificationView,
    UserLogoutView,
    UserProfileView,
    UserRegistrationView,
    VerifyEmailView,
)

app_name = 'accounts'

urlpatterns = [
    # Authentication endpoints
    path('login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('register/', UserRegistrationView.as_view(), name='register'),
    path('verify-email/', VerifyEmailView.as_view(), name='verify_email'),
    path('verify-email/resend/', ResendVerificationView.as_view(), name='verify_email_resend'),
    path('logout/', UserLogoutView.as_view(), name='logout'),
    path('me/', UserProfileView.as_view(), name='profile'),
    path('password-change/', ChangePasswordView.as_view(), name='password_change'),
    path('delete-account/', DeleteAccountView.as_view(), name='delete_account'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password_reset'),
    path('password-reset-confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
]
