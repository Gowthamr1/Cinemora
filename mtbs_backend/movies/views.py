from django.conf import settings
from django.core.cache import cache
from django.db.models import Avg, Count, F, Max, Min
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Movie
from .serializers import MovieSerializer
from rest_framework.permissions import AllowAny
from accounts.permissions import IsAdmin, IsAdminOrReadOnly
from theatres.models import Theatre

from .cache import FILTER_OPTIONS_CACHE_KEY


def _split_values(raw_values):
    """Flatten comma-separated DB values into a sorted set of unique labels."""
    out = set()
    for raw in raw_values:
        for part in (raw or '').split(','):
            part = part.strip()
            if part:
                out.add(part)
    return sorted(out, key=str.lower)


class MovieViewSet(viewsets.ModelViewSet):
    serializer_class = MovieSerializer
    # Anyone can browse; only admins can create/update/delete.
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter]
    search_fields = ['title', 'genre', 'director', 'cast']
    # Slug URLs: /api/movies/interstellar/ instead of /api/movies/3/. The
    # pattern still accepts digits so links and clients holding an id keep
    # working — see get_object below.
    lookup_field = 'slug'
    lookup_value_regex = '[^/]+'

    def get_object(self):
        """Look up by slug, falling back to the pk for an all-digit lookup.

        Bookmarks, the admin panel's own edit/delete calls and anything built
        before slugs existed all address movies by id. Keeping both means this
        change doesn't have to be atomic across every caller.
        """
        value = self.kwargs.get(self.lookup_field)
        if value is not None and value.isdigit():
            obj = get_object_or_404(self.filter_queryset(self.get_queryset()), pk=value)
            self.check_object_permissions(self.request, obj)
            return obj
        return super().get_object()

    def get_queryset(self):
        # The showtime filters below can LEFT JOIN a movie's showtimes and fan
        # its review rows out into duplicates. Within one movie that fan-out is
        # uniform (every review joins every matching showtime), so a plain Avg
        # is unchanged — distinct there would wrongly collapse two equal ratings
        # into one. Count, though, would multiply, so it counts distinct ids.
        qs = (Movie.objects
              .annotate(review_count=Count('reviews', distinct=True),
                        average_rating=Avg('reviews__rating'))
              .order_by('title'))
        params = self.request.query_params

        # Retired films stay in the database for their booking history, but
        # they are not part of the catalogue. Admins can still see them —
        # otherwise the panel couldn't restore one it just retired.
        if not getattr(self.request.user, 'is_admin', False):
            qs = qs.filter(is_active=True)
        elif params.get('is_active') in ('true', 'false'):
            qs = qs.filter(is_active=params['is_active'] == 'true')

        # --- Movie-level filters ---
        language = params.get('language')
        if language:
            qs = qs.filter(language__icontains=language)

        genre = params.get('genre')
        if genre:
            qs = qs.filter(genre__icontains=genre)

        # --- Showtime-level filters: keep movies that have a matching showtime ---
        theatre = params.get('theatre')      # theatre id
        city = params.get('city')            # theatre city
        date = params.get('date')            # YYYY-MM-DD
        min_price = params.get('min_price')
        max_price = params.get('max_price')

        if theatre:
            qs = qs.filter(showtimes__theatre_id=theatre)
        if city:
            qs = qs.filter(showtimes__theatre__city__iexact=city)
        if date:
            qs = qs.filter(showtimes__start_time__date=date)
        if min_price:
            try:
                qs = qs.filter(showtimes__price__gte=float(min_price))
            except ValueError:
                pass
        if max_price:
            try:
                qs = qs.filter(showtimes__price__lte=float(max_price))
            except ValueError:
                pass

        # Joining across showtimes can duplicate movie rows.
        qs = qs.distinct()

        # Sort: newest releases, highest rated, most reviewed, or alphabetical
        # (default). The explicit nulls_last matters: with plain `-average_rating`
        # a NULL (unreviewed) sorts last on SQLite but first on Postgres, which
        # would float every unreviewed film to the top of "Top Rated". Spelling
        # it out keeps the order identical whichever backend runs.
        ordering = params.get('ordering', 'title')
        if ordering == 'release_date':
            qs = qs.order_by(F('release_date').desc(nulls_last=True), 'title')
        elif ordering == 'rating':
            qs = qs.order_by(F('average_rating').desc(nulls_last=True), 'title')
        elif ordering == 'popularity':
            qs = qs.order_by(F('review_count').desc(nulls_last=True), 'title')
        else:  # title
            qs = qs.order_by('title')

        return qs

    def destroy(self, request, *args, **kwargs):
        """Retire the film instead of deleting the row.

        A real DELETE cascades: Showtime has on_delete=CASCADE on movie, and
        Booking cascades from Showtime — so removing one film silently erases
        every ticket ever sold for it, along with the revenue those bookings
        represent in analytics. Flipping the flag hides it from the catalogue
        and leaves the history intact.
        """
        movie = self.get_object()
        if not movie.is_active:
            return Response({'detail': 'This film is already retired.'},
                            status=status.HTTP_400_BAD_REQUEST)
        movie.is_active = False
        movie.save(update_fields=['is_active'])
        # 200 with the object, not 204: the client needs the new state to
        # re-render the row it just retired rather than dropping it.
        return Response(self.get_serializer(movie).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def restore(self, request, slug=None):
        """Put a retired film back in the catalogue.

        The counterpart to destroy — without it a mis-click is only undoable
        through the Django admin.
        """
        movie = self.get_object()
        if movie.is_active:
            return Response({'detail': 'This film is already active.'},
                            status=status.HTTP_400_BAD_REQUEST)
        movie.is_active = True
        movie.save(update_fields=['is_active'])
        return Response(self.get_serializer(movie).data)

    @action(detail=False, methods=['get'], url_path='filter-options',
            permission_classes=[AllowAny])
    def filter_options(self, request):
        """Distinct values for the filter dropdowns, so the UI never
        shows an option that matches nothing.

        Cached because it is unauthenticated, hit on every page load of the
        movie list, and costs five aggregate scans — while the answer only
        changes when an admin edits the catalogue. Those edits invalidate it
        immediately (see `movies.signals`), so the timeout is just a backstop
        for anything that writes outside the ORM.
        """
        cached = cache.get(FILTER_OPTIONS_CACHE_KEY)
        if cached is not None:
            return Response(cached)

        payload = self._build_filter_options()
        cache.set(FILTER_OPTIONS_CACHE_KEY, payload,
                  settings.FILTER_OPTIONS_CACHE_SECONDS)
        return Response(payload)

    @staticmethod
    def _build_filter_options():
        from showtimes.models import Showtime

        # Scoped to the live catalogue: a dropdown offering the only genre a
        # retired film had would return an empty grid every time.
        active = Movie.objects.filter(is_active=True)
        price_range = Showtime.objects.filter(movie__is_active=True).aggregate(
            min=Min('price'), max=Max('price'))
        return {
            'languages': _split_values(active.values_list('language', flat=True)),
            'genres': _split_values(active.values_list('genre', flat=True)),
            'cities': sorted(
                {c for c in Theatre.objects.values_list('city', flat=True) if c},
                key=str.lower,
            ),
            'theatres': [
                {'id': t.id, 'name': t.name, 'city': t.city}
                for t in Theatre.objects.all().order_by('name')
            ],
            # Decimals don't survive a cache round-trip as the same type the
            # JSON renderer produced, so normalise here instead of letting a
            # cached response differ from a fresh one.
            'price_min': float(price_range['min'] or 0),
            'price_max': float(price_range['max'] or 0),
        }