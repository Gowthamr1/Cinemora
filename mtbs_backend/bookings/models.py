import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from showtimes.models import Showtime

# How long an unpaid booking may hold its seats before it expires.
PAYMENT_WINDOW_MINUTES = 15

# How early someone may be let in. The gate stays open until the show ends, so
# a latecomer isn't turned away by effective_status() having flipped to
# COMPLETED the moment the titles rolled.
CHECK_IN_OPENS_MINUTES_BEFORE = 60

# No I, O, 0 or 1: the same code has to survive being read off a cracked phone
# screen and typed into the manual box at the door.
REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
REFERENCE_LENGTH = 10


def generate_reference():
    """An unguessable ticket code.

    `secrets`, not `random`: this is the credential that gets someone through a
    door, and `random` is reproducible from a handful of observed outputs. The
    primary key would be far worse — it's sequential, so a forger only has to
    count.
    """
    return 'BK' + ''.join(secrets.choice(REFERENCE_ALPHABET)
                          for _ in range(REFERENCE_LENGTH))


class Booking(models.Model):
    PENDING = 'PENDING'
    CONFIRMED = 'CONFIRMED'
    CANCELLED = 'CANCELLED'
    COMPLETED = 'COMPLETED'
    EXPIRED = 'EXPIRED'

    STATUS_CHOICES = (
        (PENDING, 'Pending Payment'),
        (CONFIRMED, 'Confirmed'),
        (CANCELLED, 'Cancelled'),
        (COMPLETED, 'Completed'),
        (EXPIRED, 'Expired'),
    )

    # Statuses where the booking no longer holds its seats.
    RELEASED_STATUSES = (CANCELLED, EXPIRED)

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='bookings')
    showtime = models.ForeignKey(Showtime, on_delete=models.CASCADE, related_name='bookings')
    num_seats = models.PositiveIntegerField()
    # The specific seat numbers this booking holds, e.g. [12, 50].
    # num_seats is kept in sync as len(seats) for backward compatibility.
    seats = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PENDING)
    # What the ticket QR encodes. unique=True indexes it, so the gate lookup is
    # a single indexed hit.
    reference = models.CharField(max_length=16, unique=True, editable=False)
    # Null means the ticket has never been used. That's the whole of the
    # "not already used" check — without it a screenshot works for a whole row.
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='tickets_checked_in',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        # Each index matches a query this project actually runs; the column
        # order matches the filter-then-sort order those queries use.
        indexes = [
            # BookingViewSet.get_queryset: filter(user=...).order_by('-created_at')
            models.Index(fields=['user', '-created_at']),
            # sweep_stale_bookings: the PENDING-past-window scan, which runs on
            # every booking list and every create.
            models.Index(fields=['status', 'created_at']),
            # The seat map: showtime.bookings.exclude(status__in=RELEASED).
            # Django already indexes the `showtime` FK alone, but this lets the
            # status filter be answered from the index too.
            models.Index(fields=['showtime', 'status']),
        ]

    def save(self, *args, **kwargs):
        # Only on first write. Every existing caller that passes `update_fields`
        # is updating a row that already has one, so this never fights them.
        if not self.reference:
            while True:
                candidate = generate_reference()
                if not Booking.objects.filter(reference=candidate).exists():
                    self.reference = candidate
                    break
        super().save(*args, **kwargs)

    @property
    def expires_at(self):
        """When an unpaid booking loses its seats. None once it's paid."""
        if self.status != self.PENDING or not self.created_at:
            return None
        return self.created_at + timezone.timedelta(minutes=PAYMENT_WINDOW_MINUTES)

    @property
    def is_past_show(self):
        return self.showtime.start_time <= timezone.now()

    @property
    def check_in_opens_at(self):
        """Earliest moment the gate will admit this ticket."""
        return self.showtime.start_time - timezone.timedelta(
            minutes=CHECK_IN_OPENS_MINUTES_BEFORE)

    def effective_status(self):
        """The status a client should see, accounting for the passage of time.

        PENDING bookings past their payment window read as EXPIRED, and
        CONFIRMED bookings whose show has started read as COMPLETED, without
        needing a background job to have run first.
        """
        if self.status == self.PENDING:
            expiry = self.expires_at
            if expiry and timezone.now() >= expiry:
                return self.EXPIRED
        elif self.status == self.CONFIRMED and self.is_past_show:
            return self.COMPLETED
        return self.status

    def can_cancel(self):
        """Cancellable only while it still holds seats and the show is ahead."""
        status = self.effective_status()
        if status in (self.CANCELLED, self.EXPIRED):
            return False, 'This booking is already closed.'
        # Checked before COMPLETED: a played show is the more useful reason,
        # and COMPLETED is only ever reached by the show having started.
        if self.is_past_show:
            return False, 'The show has already started, so it can no longer be cancelled.'
        if status == self.COMPLETED:
            return False, 'This booking is already closed.'
        return True, ''

    def __str__(self):
        return f"{self.user.username} - {self.showtime.movie.title} - {self.num_seats} seats"
