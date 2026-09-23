# bookings/views.py
from django.db import transaction
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from accounts.permissions import CanBook, CanVerifyTickets
from showtimes.models import Showtime
from showtimes.realtime import push_seat_state_on_commit
from .models import Booking
from .serializers import BookingSerializer
from .services import (VERIFY_VALID, cancel_booking, refund_preview,
                       sweep_stale_bookings, verify_ticket)


class BookingViewSet(viewsets.ModelViewSet):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]
    # Read only by ScopedRateThrottle, which only the `verify` action below
    # installs; the default Anon/User throttles on every other action ignore it.
    throttle_scope = 'verify'

    def get_permissions(self):
        # Door staff are the one authenticated role that must not reach this.
        # Blocking `create` here rather than inside perform_create means the
        # refusal happens before any seat locking or sweeping work is done.
        if self.action == 'create':
            return [CanBook()]
        return super().get_permissions()

    def get_queryset(self):
        # `review` is the reverse OneToOne the serializer reads for its
        # can_review / review fields; select_related keeps the dashboard's
        # booking list one query instead of one per booking.
        qs = (Booking.objects
              .select_related('showtime__movie', 'showtime__theatre',
                              'payment', 'review')
              .all())
        user = self.request.user
        # Admins see everything; regular users only see their own bookings.
        if getattr(user, 'is_admin', False):
            qs = qs.order_by('-created_at')
        else:
            qs = qs.filter(user=user).order_by('-created_at')

        # `?status=CONFIRMED` — the responses are paginated, so a client that
        # wants a total can ask for the filtered `count` instead of paging
        # through every booking to tally them itself.
        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status.upper())
        return qs

    def list(self, request, *args, **kwargs):
        # Settle expiries/completions first so the list is never stale, and so
        # abandoned bookings hand their seats back without a scheduler.
        sweep_stale_bookings()
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        showtime = serializer.validated_data['showtime']
        seats = serializer.validated_data.get('seats') or []

        # De-duplicate while preserving order.
        seats = list(dict.fromkeys(seats))
        if not seats:
            raise ValidationError({'detail': 'Please select at least one seat.'})

        # Release seats held by bookings that timed out before checking space.
        sweep_stale_bookings()

        # Lock the showtime row so concurrent bookings can't grab the same seat.
        with transaction.atomic():
            showtime = Showtime.objects.select_for_update().get(pk=showtime.pk)

            # Reject seat numbers that don't exist for this showtime.
            invalid = [s for s in seats if s < 1 or s > showtime.total_seats]
            if invalid:
                raise ValidationError(
                    {'detail': f'Invalid seat number(s): {invalid}. '
                               f'This show has seats 1–{showtime.total_seats}.'}
                )

            # Collect seats held by bookings that haven't released them.
            taken = set()
            for booked in (showtime.bookings
                           .exclude(status__in=Booking.RELEASED_STATUSES)
                           .values_list('seats', flat=True)):
                taken.update(booked or [])

            clashes = [s for s in seats if s in taken]
            if clashes:
                labels = ', '.join(showtime.seat_labels(sorted(clashes)))
                raise ValidationError(
                    {'detail': f'Seat(s) already booked: {labels}. '
                               f'Please pick different seats.'}
                )

            showtime.seats_available = max(0, showtime.seats_available - len(seats))
            showtime.save(update_fields=['seats_available'])
            serializer.save(user=self.request.user, num_seats=len(seats), seats=seats)

            # Grey these seats out for everyone else watching this show — but
            # only once the rows above are committed, so nobody is told a seat
            # is gone on the strength of a transaction that might roll back.
            push_seat_state_on_commit(showtime.pk)

    @action(detail=True, methods=['get'])
    def refund_quote(self, request, pk=None):
        """What the user gets back if they cancel now — shown before confirming."""
        booking = self.get_object()
        allowed, reason = booking.can_cancel()
        return Response({
            'can_cancel': allowed,
            'reason': reason,
            'refund': refund_preview(booking),
        })

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        try:
            refund = cancel_booking(booking)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
        booking.refresh_from_db()
        return Response({
            'detail': 'Booking cancelled. Your seats are back on sale.',
            'refund': refund,
            'booking': self.get_serializer(booking).data,
        })

    @action(detail=False, methods=['post'], permission_classes=[CanVerifyTickets],
            throttle_classes=[ScopedRateThrottle])
    def verify(self, request):
        """The door scanner: is this ticket good, and has it been used?

        `detail=False`, so it never goes near `get_object()` and the per-user
        scoping in `get_queryset` is beside the point — staff are checking
        other people's tickets, which is the entire job.

        Open to ROLE_STAFF as well as admins. That is deliberately the only
        endpoint in the project a staff account can reach beyond the public
        catalogue and its own profile.

        Throttled because an unthrottled lookup is an enumeration oracle: the
        reference keyspace only holds up if guesses cost something.
        """
        booking, code, message = verify_ticket(
            request.data.get('reference'), staff_user=request.user)

        # 200 even on a rejection. A ticket that isn't valid is still a
        # successful answer to a legitimate question, and putting it in the
        # error channel would tangle it with the 401 refresh handling in the
        # frontend's axios interceptor.
        return Response({
            'valid': code == VERIFY_VALID,
            'code': code,
            'message': message,
            'booking': self.get_serializer(booking).data if booking else None,
        })

    def partial_update(self, request, *args, **kwargs):
        booking = self.get_object()

        # Legacy path: the dashboard used to cancel via PATCH status=CANCELLED.
        # Route it through the same service so refunds still happen.
        if request.data.get('status') == 'CANCELLED':
            try:
                cancel_booking(booking)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
            booking.refresh_from_db()
            return Response(self.get_serializer(booking).data)

        # Everything else about a booking is fixed once made. The serializer
        # already refuses to write `seats`/`showtime` on update, so this is
        # only about answering honestly instead of returning 200 for a
        # request that changed nothing.
        return Response(
            {'detail': 'A booking cannot be edited. Cancel it and book again, '
                       'or POST to this booking\'s /cancel/ endpoint.'},
            status=http_status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def update(self, request, *args, **kwargs):
        # PUT is partial_update's blunter sibling and would otherwise skip the
        # cancel routing above entirely.
        return self.partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Bookings are cancelled, never deleted.

        A raw DELETE drops the row without handing the seats back — the
        showtime's `seats_available` would stay decremented for a booking that
        no longer exists, and any payment against it would lose its refund
        trail. `cancel_booking` does both properly.
        """
        return Response(
            {'detail': 'Bookings cannot be deleted. Cancel the booking instead '
                       'so the seats are released and any refund is recorded.'},
            status=http_status.HTTP_405_METHOD_NOT_ALLOWED,
        )
