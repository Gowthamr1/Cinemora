"""Pushing seat availability to everyone watching a showtime.

The seat map is derived, never stored: `booked_seats` is recomputed from the
bookings that still hold seats. So every push carries the *whole* current state
rather than a delta — a client that reconnects after a dropped connection is
correct again immediately, with no replay log and no way to drift.

Broadcasts are fired from `transaction.on_commit` so a seat is never announced
as taken before the row that takes it is durable.
"""
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from bookings.models import Booking
from .models import Showtime

GROUP_TEMPLATE = 'showtime.{}.seats'


def group_name(showtime_id):
    return GROUP_TEMPLATE.format(int(showtime_id))


def seat_state(showtime_id):
    """The full public seat picture for one showtime.

    Deliberately mirrors the fields `ShowtimeSerializer` already exposes over
    HTTP, so the socket reveals nothing that `GET /showtimes/<id>/` doesn't.
    """
    showtime = (Showtime.objects
                .filter(pk=showtime_id)
                .values('id', 'total_seats', 'seats_available')
                .first())
    if showtime is None:
        return None

    taken = set()
    for seats in (Booking.objects
                  .filter(showtime_id=showtime_id)
                  .exclude(status__in=Booking.RELEASED_STATUSES)
                  .values_list('seats', flat=True)):
        taken.update(seats or [])

    return {
        'type': 'seat_state',
        'showtime': showtime['id'],
        'booked_seats': sorted(taken),
        'total_seats': showtime['total_seats'],
        'seats_available': showtime['seats_available'],
    }


async def apush_seat_state(showtime_id, payload=None):
    """Async broadcast — used from inside the consumer's own event loop."""
    layer = get_channel_layer()
    if layer is None:  # pragma: no cover - only when CHANNEL_LAYERS is unset
        return
    if payload is None:
        from channels.db import database_sync_to_async
        payload = await database_sync_to_async(seat_state)(showtime_id)
    if payload is None:
        return
    await layer.group_send(group_name(showtime_id),
                           {'type': 'seat.state', 'payload': payload})


def push_seat_state(showtime_id):
    """Sync broadcast — used from DRF views and service functions."""
    layer = get_channel_layer()
    if layer is None:  # pragma: no cover - only when CHANNEL_LAYERS is unset
        return
    payload = seat_state(showtime_id)
    if payload is None:
        return
    async_to_sync(layer.group_send)(
        group_name(showtime_id), {'type': 'seat.state', 'payload': payload})


def push_seat_state_on_commit(showtime_id):
    """Queue a broadcast for after the surrounding transaction commits.

    Outside a transaction this runs immediately, which is what the sweep and the
    cancel endpoint want.
    """
    transaction.on_commit(lambda: push_seat_state(showtime_id))
