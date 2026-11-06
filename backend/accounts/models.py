from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """
    Custom user manager for email-based authentication.

    Emails are case-insensitive: "Ann@X.com" and "ann@x.com" are one account.
    New emails are stored all lowercase, and login looks them up ignoring case.
    """

    @classmethod
    def normalize_email(cls, email):
        # Django's version only lowercases the domain; we lowercase it all.
        return (email or '').strip().lower()

    def get_by_natural_key(self, username):
        # Used by Django's login (ModelBackend) to find the user by email.
        return self.get(**{f'{self.model.USERNAME_FIELD}__iexact': username})

    def create_user(self, email, password=None, **extra_fields):
        """
        Create and return a regular user with an email and password.
        """
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """
        Create and return a superuser with an email and password.
        """
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """
    Custom User model with email as the primary identifier.
    Extends Django's AbstractUser to use email instead of username.
    """
    email = models.EmailField(unique=True)
    username = None  # Remove username field
    # Which terms this user agreed to, and when. Set by the server at sign-up;
    # empty for accounts made another way (admin, createsuperuser).
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    terms_version = models.CharField(max_length=32, blank=True, default='')
    # When the user clicked the link in the verify_email email (or finished a
    # password reset, which also proves they own the inbox). Empty = not yet.
    # When REQUIRE_EMAIL_VERIFICATION is on, an unverified user can't sign in.
    email_verified_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        db_table = 'auth_user'
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return self.email

    @property
    def is_email_verified(self):
        return self.email_verified_at is not None

    def mark_email_verified(self):
        """Record that the user owns their inbox. True only the first time."""
        if self.email_verified_at is not None:
            return False
        now = timezone.now()
        # One conditional UPDATE, so two clicks at once can't both count as first.
        updated = type(self).objects.filter(pk=self.pk, email_verified_at__isnull=True).update(email_verified_at=now)
        self.email_verified_at = now
        return updated == 1
