# showtimes/views.py

from django.db.models import Prefetch
from rest_framework import viewsets

from accounts.permissions import IsAdminOrReadOnly
from bookings.models import Booking
from .models import Showtime
from .serializers import ShowtimeSerializer


class ShowtimeViewSet(viewsets.ModelViewSet):
    serializer_class = ShowtimeSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        queryset = (
            Showtime.objects
            .select_related('movie', 'theatre')
            # The seat map needs the seats each live booking holds. Prefetching
            # them as `active_bookings` turns one query per showtime into one
            # query for the whole page — `only()` because the serializer reads
            # nothing else off these rows.
            .prefetch_related(Prefetch(
                'bookings',
                queryset=(Booking.objects
                          .exclude(status__in=Booking.RELEASED_STATUSES)
                          .only('id', 'showtime_id', 'seats')),
                to_attr='active_bookings',
            ))
        )
        params = self.request.query_params

        # A retired film's showtimes must not be bookable. Admins still see
        # them so the schedule stays auditable after a film is pulled.
        if not getattr(self.request.user, 'is_admin', False):
            queryset = queryset.filter(movie__is_active=True)

        movie_id = params.get('movie')
        if movie_id:
            # Accepts a slug as well as an id, so the movie detail page can
            # fetch the film and its showtimes in parallel instead of waiting
            # to learn the id from the first response.
            queryset = (queryset.filter(movie__id=movie_id) if movie_id.isdigit()
                        else queryset.filter(movie__slug=movie_id))

        theatre = params.get('theatre')
        if theatre:
            queryset = queryset.filter(theatre_id=theatre)

        city = params.get('city')
        if city:
            queryset = queryset.filter(theatre__city__iexact=city)

        date = params.get('date')
        if date:
            queryset = queryset.filter(start_time__date=date)

        for param, lookup in (('min_price', 'price__gte'), ('max_price', 'price__lte')):
            value = params.get(param)
            if value:
                try:
                    queryset = queryset.filter(**{lookup: float(value)})
                except ValueError:
                    pass

        return queryset.order_by('start_time')
