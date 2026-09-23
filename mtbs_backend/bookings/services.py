"""Booking lifecycle rules: seat release, refunds and time-based transitions.

Kept out of the views so the cancel endpoint, the legacy PATCH path and the
sweep command all apply exactly the same rules.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from showtimes.models import Showtime
from showtimes.realtime import push_seat_state_on_commit
from wallet.models import WalletTransaction
from wallet.services import apply_delta
from .models import PAYMENT_WINDOW_MINUTES, Booking

# Cancel this far ahead of the show for a full refund; later cancellations
# keep a portion as a late-cancellation fee.
FULL_REFUND_HOURS = 24
LATE_REFUND_RATE = Decimal('0.50')


def refund_rate(booking, now=None):
    """Fraction of the ticket price returned if cancelled right now."""
    now = now or timezone.now()
    hours_ahead = (booking.showtime.start_time - now).total_seconds() / 3600
    return Decimal('1.00') if hours_ahead >= FULL_REFUND_HOURS else LATE_REFUND_RATE


def refund_preview(booking, now=None):
    """What the user would get back, for showing before they confirm."""
    payment = getattr(booking, 'payment', None)
    if not payment or payment.status != 'SUCCESS' or payment.is_refunded:
        return {'eligible': False, 'rate': 0.0, 'amount': 0.0}
    # A booking that can't be cancelled can't be refunded either, so don't
    # quote a figure the user could never actually claim.
    if not booking.can_cancel()[0]:
        return {'eligible': False, 'rate': 0.0, 'amount': 0.0}
    rate = refund_rate(booking, now)
    return {
        'eligible': True,
        'rate': float(rate),
        'amount': float((payment.amount * rate).quantize(Decimal('0.01'))),
    }


def _release_seats(booking):
    """Give this booking's seats back to its showtime.

    Clamped to total_seats so a double release can never invent capacity.

    Every path that frees a seat comes through here — cancellation and expiry
    alike — so this is the one place the live seat map needs telling.
    """
    showtime = Showtime.objects.select_for_update().get(pk=booking.showtime_id)
    freed = len(booking.seats or []) or booking.num_seats
    showtime.seats_available = min(showtime.total_seats, showtime.seats_available + freed)
    showtime.save(update_fields=['seats_available'])
    push_seat_state_on_commit(showtime.pk)


@transaction.atomic
def cancel_booking(booking):
    """Cancel, release the seats and issue a (mock) refund.

    Returns the refund detail dict. Raises ValueError with a user-facing
    message when the booking isn't cancellable.
    """
    booking = Booking.objects.select_for_update().select_related('showtime').get(pk=booking.pk)
    allowed, reason = booking.can_cancel()
    if not allowed:
        raise ValueError(reason)

    _release_seats(booking)

    refund = {'eligible': False, 'rate': 0.0, 'amount': 0.0}
    payment = getattr(booking, 'payment', None)
    if payment and payment.status == 'SUCCESS' and not payment.is_refunded:
        rate = refund_rate(booking)
        payment.refund_amount = (payment.amount * rate).quantize(Decimal('0.01'))
        payment.refund_status = payment.REFUND_COMPLETE
        payment.refunded_at = timezone.now()
        payment.save(update_fields=['refund_amount', 'refund_status', 'refunded_at'])
        refund = {'eligible': True, 'rate': float(rate), 'amount': float(payment.refund_amount)}

        # A wallet-paid booking is refunded back to the wallet it came from.
        # apply_delta runs inside this same atomic block (as a savepoint), so
        # the credit, its ledger row and the cancellation all commit together
        # or not at all. A card payment, in this mock, has nowhere to go back
        # to — the refund_amount on the payment record is the whole story.
        if payment.method == payment.METHOD_WALLET and payment.refund_amount > 0:
            apply_delta(
                user=booking.user,
                amount=payment.refund_amount,
                kind=WalletTransaction.BOOKING_REFUND,
                description=f'Refund for booking {booking.reference}',
            )

    booking.status = Booking.CANCELLED
    booking.cancelled_at = timezone.now()
    booking.save(update_fields=['status', 'cancelled_at'])
    return refund


@transaction.atomic
def expire_booking(booking):
    """Drop an unpaid booking that sat past its payment window."""
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if booking.status != Booking.PENDING:
        return False
    _release_seats(booking)
    booking.status = Booking.EXPIRED
    booking.save(update_fields=['status'])
    return True


def sweep_stale_bookings():
    """Apply time-based transitions and free up seats they were holding.

    Called on booking reads and by the `sweep_bookings` management command, so
    the project needs no scheduler to stay consistent.
    """
    now = timezone.now()
    expired = completed = 0

    stale = Booking.objects.filter(
        status=Booking.PENDING,
        created_at__lt=now - timezone.timedelta(minutes=PAYMENT_WINDOW_MINUTES),
    ).select_related('showtime')
    for booking in stale:
        if expire_booking(booking):
            expired += 1

    # Seats aren't released here: the show has been played, not given up.
    completed = Booking.objects.filter(
        status=Booking.CONFIRMED, showtime__start_time__lte=now,
    ).update(status=Booking.COMPLETED)

    return {'expired': expired, 'completed': completed}


# What the gate can say. The frontend switches on these, not on the prose.
VERIFY_VALID = 'VALID'
VERIFY_NOT_FOUND = 'NOT_FOUND'
VERIFY_CANCELLED = 'CANCELLED'
VERIFY_EXPIRED = 'EXPIRED'
VERIFY_UNPAID = 'UNPAID'
VERIFY_ALREADY_USED = 'ALREADY_USED'
VERIFY_TOO_EARLY = 'TOO_EARLY'
VERIFY_SHOW_ENDED = 'SHOW_ENDED'


def verify_ticket(reference, staff_user=None, now=None):
    """Decide whether to let this ticket holder through the door.

    Returns `(booking_or_None, code, message)`. On a VALID result the booking is
    stamped as used, so a second scan of the same code is refused.

    The check order is the design: each rejection should name the most useful
    reason for whoever is standing at the door.
    """
    now = now or timezone.now()
    reference = (reference or '').strip().upper()

    # Tolerates the QR payload as well as a bare code, so the scanner doesn't
    # have to strip the prefix that makes the payload self-describing.
    if reference.startswith('BOOKING:'):
        reference = reference[len('BOOKING:'):].strip()

    if not reference:
        return None, VERIFY_NOT_FOUND, 'No ticket code was scanned.'

    try:
        booking = (
            Booking.objects
            .select_related('showtime', 'showtime__movie', 'user')
            .get(reference=reference)
        )
    except Booking.DoesNotExist:
        return None, VERIFY_NOT_FOUND, f'No booking exists with code {reference}.'

    status = booking.effective_status()
    if status == Booking.CANCELLED:
        return booking, VERIFY_CANCELLED, 'This booking was cancelled.'
    if status == Booking.EXPIRED:
        return booking, VERIFY_EXPIRED, 'This booking expired before it was paid for.'
    if status == Booking.PENDING:
        return booking, VERIFY_UNPAID, 'This booking has not been paid for yet.'

    # Deliberately not gated on status == CONFIRMED: effective_status() reads
    # COMPLETED the moment the show starts, so that check would turn away every
    # latecomer. The window below is the real rule.
    if now < booking.check_in_opens_at:
        opens = timezone.localtime(booking.check_in_opens_at).strftime('%d %b %Y, %I:%M %p')
        return booking, VERIFY_TOO_EARLY, f'Too early — entry opens at {opens}.'

    ends_at = booking.showtime.end_time or booking.showtime.compute_end_time()
    if now > ends_at:
        return booking, VERIFY_SHOW_ENDED, 'This show has already finished.'

    # Single use, under a lock. Two ushers scanning the same forwarded
    # screenshot at two doors in the same second both read `checked_in_at` as
    # None otherwise, and both let their person in.
    with transaction.atomic():
        locked = Booking.objects.select_for_update().get(pk=booking.pk)
        if locked.checked_in_at:
            when = timezone.localtime(locked.checked_in_at).strftime('%d %b %Y, %I:%M %p')
            who = locked.checked_in_by.username if locked.checked_in_by else 'staff'
            booking.refresh_from_db()
            return (booking, VERIFY_ALREADY_USED,
                    f'Already checked in at {when} by {who}.')

        locked.checked_in_at = now
        locked.checked_in_by = staff_user if (staff_user and staff_user.is_authenticated) else None
        locked.save(update_fields=['checked_in_at', 'checked_in_by'])

    booking.checked_in_at = locked.checked_in_at
    booking.checked_in_by = locked.checked_in_by
    return booking, VERIFY_VALID, 'Valid ticket — admit.'
