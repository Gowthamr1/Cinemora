from django.db import models

from bookings.models import Booking


class Payment(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('SUCCESS', 'Success'),
        ('FAILED', 'Failed'),
    )

    # Refunds are tracked separately from the original charge so a refunded
    # booking still shows what was paid and when.
    REFUND_NONE = 'NONE'
    REFUND_PENDING = 'PENDING'
    REFUND_COMPLETE = 'REFUNDED'
    REFUND_CHOICES = (
        (REFUND_NONE, 'No refund'),
        (REFUND_PENDING, 'Refund processing'),
        (REFUND_COMPLETE, 'Refunded'),
    )

    # How the booking was paid for. WALLET routes its refund back to the
    # wallet balance (see bookings.services.cancel_booking) rather than to a
    # card that, in this mock, never existed.
    METHOD_CARD = 'CARD'
    METHOD_WALLET = 'WALLET'
    METHOD_CHOICES = (
        (METHOD_CARD, 'Card'),
        (METHOD_WALLET, 'Wallet'),
    )

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name='payment')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    method = models.CharField(max_length=10, choices=METHOD_CHOICES, default=METHOD_CARD)
    refund_status = models.CharField(max_length=10, choices=REFUND_CHOICES, default=REFUND_NONE)
    refund_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    refunded_at = models.DateTimeField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            # Every revenue figure on the analytics dashboard starts with
            # status='SUCCESS', and the daily series adds a timestamp window.
            models.Index(fields=['status', 'timestamp']),
            # PaymentViewSet lists newest-first.
            models.Index(fields=['-timestamp']),
        ]

    @property
    def is_refunded(self):
        return self.refund_status == self.REFUND_COMPLETE

    @property
    def net_amount(self):
        """What the business actually kept, after any refund."""
        return self.amount - (self.refund_amount or 0)

    def __str__(self):
        return f"Payment for Booking {self.booking.id} - {self.status}"
