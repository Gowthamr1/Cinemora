from datetime import timedelta
from decimal import Decimal

from rest_framework import serializers

from bookings.models import Booking
from movies.models import Movie
from movies.serializers import MovieSerializer
from theatres.models import Theatre
from theatres.serializers import TheatreSerializer
from .models import CLEANUP_BUFFER_MINUTES, DEFAULT_RUNTIME_MINUTES, MAX_ROWS, Showtime

# A free ticket is almost certainly a mistake, but a $0 preview screening is a
# real thing — so the floor is zero, not one.
MAX_TICKET_PRICE = Decimal('10000.00')


class ShowtimeSerializer(serializers.ModelSerializer):
    movie = MovieSerializer(read_only=True)
    movie_id = serializers.PrimaryKeyRelatedField(
        queryset=Movie.objects.all(), source='movie', write_only=True
    )
    theatre = TheatreSerializer(read_only=True)
    theatre_id = serializers.PrimaryKeyRelatedField(
        queryset=Theatre.objects.all(), source='theatre',
        write_only=True, required=False, allow_null=True,
    )
    booked_seats = serializers.SerializerMethodField()
    seat_layout = serializers.SerializerMethodField()
    end_time = serializers.DateTimeField(read_only=True)
    # Derived from rows x seats_per_row, but exposed so existing clients that
    # read total_seats keep working.
    total_seats = serializers.IntegerField(read_only=True)
    seats_available = serializers.IntegerField(required=False)

    class Meta:
        model = Showtime
        fields = [
            'id', 'movie', 'movie_id', 'theatre', 'theatre_id', 'screen_number',
            'start_time', 'end_time', 'rows', 'seats_per_row', 'total_seats',
            'seats_available', 'price', 'booked_seats', 'seat_layout',
        ]

    def get_booked_seats(self, obj):
        """Flatten the seat lists of every booking that still holds seats.

        Reads `obj.active_bookings` when the view prefetched it — see
        `ShowtimeViewSet.get_queryset`. Without that, listing N showtimes cost
        N extra queries, one per row. The fallback keeps a bare
        `ShowtimeSerializer(showtime)` working (the realtime broadcast does
        exactly that for a single object).
        """
        prefetched = getattr(obj, 'active_bookings', None)
        if prefetched is not None:
            seat_lists = (b.seats for b in prefetched)
        else:
            seat_lists = (obj.bookings
                          .exclude(status__in=Booking.RELEASED_STATUSES)
                          .values_list('seats', flat=True))

        taken = set()
        for seats in seat_lists:
            taken.update(seats or [])
        return sorted(taken)

    def get_seat_layout(self, obj):
        return {
            'rows': obj.rows,
            'seats_per_row': obj.seats_per_row,
            'row_labels': [chr(65 + i) for i in range(min(obj.rows or 0, MAX_ROWS))],
        }

    def validate_rows(self, value):
        if value > MAX_ROWS:
            raise serializers.ValidationError(f'A screen can have at most {MAX_ROWS} rows.')
        return value

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError('Ticket price cannot be negative.')
        if value > MAX_TICKET_PRICE:
            raise serializers.ValidationError(
                f'Ticket price cannot exceed {MAX_TICKET_PRICE}.')
        return value

    def validate_seats_available(self, value):
        if value < 0:
            raise serializers.ValidationError('Seats available cannot be negative.')
        return value

    def validate(self, attrs):
        """Reject a show that would overlap another on the same screen."""
        instance = self.instance
        theatre = attrs.get('theatre', getattr(instance, 'theatre', None))
        screen = attrs.get('screen_number', getattr(instance, 'screen_number', 1))
        start = attrs.get('start_time', getattr(instance, 'start_time', None))
        movie = attrs.get('movie', getattr(instance, 'movie', None))

        # A screen number the venue doesn't have can never be scheduled around
        # or found by a customer — the overlap check below would also never
        # fire for it, so two shows could sit on the same phantom screen.
        if theatre and screen and screen > theatre.total_screens:
            raise serializers.ValidationError({
                'screen_number': f'{theatre.name} has {theatre.total_screens} '
                                 f'screen(s), so screen {screen} does not exist.'
            })

        # Shrinking the layout below what's already sold would orphan seats.
        rows = attrs.get('rows', getattr(instance, 'rows', None))
        per_row = attrs.get('seats_per_row', getattr(instance, 'seats_per_row', None))
        if instance and rows and per_row:
            new_total = rows * per_row
            highest = max((max(s or [0]) for s in instance.bookings
                           .exclude(status__in=Booking.RELEASED_STATUSES)
                           .values_list('seats', flat=True)), default=0)
            if highest > new_total:
                raise serializers.ValidationError({
                    'rows': f'Seat {highest} is already booked, so the layout '
                            f'cannot shrink to {new_total} seats.'
                })

        # Overlap is only meaningful once we know the venue, screen and time.
        if not (theatre and start and movie):
            return attrs

        runtime = movie.duration_minutes or DEFAULT_RUNTIME_MINUTES
        end = start + timedelta(minutes=runtime + CLEANUP_BUFFER_MINUTES)

        # Two intervals overlap iff each starts before the other ends. end_time
        # is backfilled on save, so fall back to a start-time window when null.
        clash = Showtime.objects.filter(
            theatre=theatre, screen_number=screen,
            start_time__lt=end, end_time__gt=start,
        ).select_related('movie')
        if instance:
            clash = clash.exclude(pk=instance.pk)

        existing = clash.first()
        if existing:
            raise serializers.ValidationError({
                'start_time': (
                    f'Screen {screen} is already showing "{existing.movie.title}" from '
                    f'{existing.start_time:%d %b %I:%M %p} to {existing.end_time:%I:%M %p}. '
                    f'This show would run {start:%I:%M %p}–{end:%I:%M %p}. '
                    f'Pick another time, screen or theatre.'
                )
            })
        return attrs
