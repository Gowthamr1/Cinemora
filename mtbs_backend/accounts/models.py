from django.contrib.auth.models import AbstractUser
from django.db import models

class CustomUser(AbstractUser):
    ROLE_USER = 'USER'
    ROLE_STAFF = 'STAFF'
    ROLE_ADMIN = 'ADMIN'

    ROLE_CHOICES = (
        (ROLE_USER, 'User'),
        # Sits between the other two: works the door and nothing else. Not to
        # be confused with Django's own `is_staff`, which is unrelated and
        # controls the Django admin site — a ROLE_STAFF user has is_staff=False.
        (ROLE_STAFF, 'Ticket Staff'),
        (ROLE_ADMIN, 'Admin'),
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_USER)

    class Meta(AbstractUser.Meta):
        # Inherit rather than replace: AbstractUser.Meta carries the translated
        # verbose names the Django admin displays.
        # Role gates every admin endpoint, so it is read on nearly every
        # authenticated request and on every "list the admins" query.
        indexes = [models.Index(fields=['role'])]

    @property
    def is_admin(self):
        """Single source of truth for 'may use the admin APIs'.

        Django superusers count: someone created by `createsuperuser` has full
        access to the Django admin already, so refusing them the REST admin
        endpoints would be a confusing distinction without a security benefit.

        ROLE_STAFF deliberately does NOT count. Every admin endpoint in the
        project gates on this one property, so widening it by a single role
        would silently hand door staff the analytics revenue figures, the
        catalogue, and everyone else's bookings.
        """
        return self.role == self.ROLE_ADMIN or self.is_superuser

    @property
    def can_verify_tickets(self):
        """May work the door: scan a ticket and be told whether to admit.

        Admins included, so a manager can cover a shift without a second
        account. This is the *only* thing ROLE_STAFF adds over an anonymous
        visitor — they still cannot book, pay, or see anyone's bookings.
        """
        return self.role == self.ROLE_STAFF or self.is_admin

    @property
    def can_book(self):
        """May buy tickets. Door staff are here to check them, not sell them."""
        return self.role != self.ROLE_STAFF

    def __str__(self):
        return f"{self.username} ({self.role})"
