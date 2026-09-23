from django.db.models import Avg, Count, Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from movies.models import Movie
from .models import Watchlist
from .serializers import WatchlistSerializer


class WatchlistViewSet(viewsets.ModelViewSet):
    """A user's saved movies, always scoped to the caller.

    `get_queryset` filters to `request.user`, so every action — list, retrieve,
    delete — can only ever touch your own rows. There is no way to name another
    user's entry: a DELETE on someone else's id 404s rather than deleting it.
    """
    serializer_class = WatchlistSerializer
    permission_classes = [IsAuthenticated]
    # No PUT/PATCH: an entry is just (user, movie, when) — there is nothing to
    # edit. You add it or you remove it.
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        # Prefetch each saved movie WITH the same rating annotations the
        # catalogue computes, so the saved-films grid renders identical rating
        # badges — and does it in two queries total, not one per card.
        movies = Movie.objects.annotate(
            review_count=Count('reviews', distinct=True),
            average_rating=Avg('reviews__rating'))
        return (Watchlist.objects
                .filter(user=self.request.user)
                .prefetch_related(Prefetch('movie', queryset=movies)))

    def create(self, request, *args, **kwargs):
        """Save a movie. Idempotent: saving one already on the list returns the
        existing entry with 200, so a double-tap on the heart is harmless rather
        than a 400 from the unique constraint."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movie = serializer.validated_data['movie']
        entry, created = Watchlist.objects.get_or_create(
            user=request.user, movie=movie)
        out = self.get_serializer(entry)
        return Response(
            out.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def ids(self, request):
        """Just the saved movie ids for the caller.

        One call lets the catalogue mark every heart on the grid without a
        request per card — the frontend keeps this as a Set.
        """
        ids = list(Watchlist.objects
                   .filter(user=request.user)
                   .values_list('movie_id', flat=True))
        return Response({'movie_ids': ids})

    @action(detail=False, methods=['post'])
    def toggle(self, request):
        """Flip one movie's saved state and report where it landed.

        The heart button's single endpoint: it doesn't need to know the current
        state to call this, and it updates from the returned `saved` rather than
        guessing — so two quick clicks can't leave the UI disagreeing with the
        server.
        """
        movie = get_object_or_404(
            Movie, pk=request.data.get('movie_id'), is_active=True)
        entry = (Watchlist.objects
                 .filter(user=request.user, movie=movie)
                 .first())
        if entry:
            entry.delete()
            return Response({'saved': False})
        Watchlist.objects.create(user=request.user, movie=movie)
        return Response({'saved': True}, status=status.HTTP_201_CREATED)
