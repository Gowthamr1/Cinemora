from rest_framework import serializers

from .models import Booking
from .services import refund_preview


class BookingSerializer(serializers.ModelSerializer):
    start_time = serializers.DateTimeField(source='showtime.start_time', read_only=True)
    showtime_title = serializers.CharField(source='showtime.movie.title', read_only=True)
    poster_url = serializers.CharField(source='showtime.movie.poster_url', read_only=True)
    theatre_name = serializers.CharField(source='showtime.theatre.name', read_only=True, default=None)
    screen_number = serializers.IntegerField(source='showtime.screen_number', read_only=True)
    payment_status = serializers.SerializerMethodField()
    refund = serializers.SerializerMethodField()
    # What the booking is worth, and what the user is actually out of pocket
    # after refunds — the dashboard totals read these.
    amount = serializers.SerializerMethodField()
    amount_paid = serializers.SerializerMethodField()
    user = serializers.StringRelatedField()
    # Client sends the chosen seat numbers; num_seats is derived from them.
    seats = serializers.ListField(child=serializers.IntegerField(min_value=1))
    seat_labels = serializers.SerializerMethodField()
    # Time-aware: a PENDING booking past its window reads as EXPIRED, and a
    # CONFIRMED one whose show has played reads as COMPLETED.
    status = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()
    expires_at = serializers.DateTimeField(read_only=True)
    # The dashboard offers "Rate this movie" straight off a played booking, so
    # it needs the movie to build the review URL, whether the show is done, and
    # the review itself if one was already written (to switch to "Edit").
    movie = serializers.IntegerField(source='showtime.movie.id', read_only=True)
    movie_slug = serializers.CharField(source='showtime.movie.slug', read_only=True)
    can_review = serializers.SerializerMethodField()
    review = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'reference', 'showtime', 'showtime_title', 'poster_url',
            'theatre_name', 'screen_number', 'start_time', 'num_seats', 'seats',
            'seat_labels',
            'status', 'status_display', 'payment_status', 'refund', 'user',
            'amount', 'amount_paid',
            'can_cancel', 'expires_at', 'created_at', 'cancelled_at',
            'checked_in_at',
            'movie', 'movie_slug', 'can_review', 'review',
        ]
        read_only_fields = ['num_seats', 'reference', 'created_at',
                            'cancelled_at', 'checked_in_at']

    def get_fields(self):
        fields = super().get_fields()
        # On update, the seats and the show are settled facts. `perform_create`
        # is the only place that checks availability and decrements
        # `seats_available`, so letting a PATCH rewrite either field would move
        # a booking onto seats nobody verified were free — overbooking through
        # the back door, with the seat counter left describing the old show.
        # Cancelling is the one permitted change, and it goes through
        # `cancel_booking`, not through these fields.
        if self.instance is not None:
            fields['seats'].read_only = True
            fields['showtime'].read_only = True
        return fields

    def get_status(self, obj):
        return obj.effective_status()

    def get_status_display(self, obj):
        return dict(Booking.STATUS_CHOICES).get(obj.effective_status(), obj.status)

    def get_seat_labels(self, obj):
        return obj.showtime.seat_labels(obj.seats or [])

    def get_can_cancel(self, obj):
        allowed, _ = obj.can_cancel()
        return allowed

    def get_can_review(self, obj):
        """A played booking with no review yet earns one — same gate as the
        reviews endpoint, but answered here so the dashboard needn't ask per
        booking. Cancelled/expired bookings never played, so they never qualify.
        """
        if obj.effective_status() != Booking.COMPLETED:
            return False
        return not hasattr(obj, 'review')

    def get_review(self, obj):
        """The review already written off this booking, if any — enough for the
        dashboard to show the rating and switch its button to "Edit"."""
        review = getattr(obj, 'review', None)
        if review is None:
            return None
        return {
            'id': review.id,
            'rating': review.rating,
            'title': review.title,
            'comment': review.comment,
            'contains_spoiler': review.contains_spoiler,
        }

    def get_payment_status(self, obj):
        payment = getattr(obj, 'payment', None)
        return payment.status if payment else None

    def get_amount(self, obj):
        """The order value: what was charged, or the ticket price if unpaid."""
        payment = getattr(obj, 'payment', None)
        if payment:
            return float(payment.amount)
        price = obj.showtime.price or 0
        return float(price * obj.num_seats)

    def get_amount_paid(self, obj):
        """Out of pocket after refunds — 0 unless the charge actually went through."""
        payment = getattr(obj, 'payment', None)
        if not payment or payment.status != 'SUCCESS':
            return 0.0
        return float(payment.net_amount)

    def get_refund(self, obj):
        payment = getattr(obj, 'payment', None)
        if payment and payment.refund_status != payment.REFUND_NONE:
            return {
                'status': payment.refund_status,
                'status_display': payment.get_refund_status_display(),
                'amount': float(payment.refund_amount or 0),
                'refunded_at': payment.refunded_at,
            }
        # Not yet cancelled — show what a cancellation would return.
        preview = refund_preview(obj)
        return {'status': 'NONE', 'status_display': 'No refund',
                'amount': 0.0, 'refunded_at': None, 'preview': preview}
