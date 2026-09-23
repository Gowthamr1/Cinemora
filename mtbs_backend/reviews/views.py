from django.db import transaction
from django.db.models import F
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from bookings.models import Booking
from movies.models import Movie
from .models import Review, HelpfulVote
from .serializers import ReviewSerializer, ReviewStatsSerializer


class ReviewViewSet(viewsets.ModelViewSet):
    """Reviews are gated: you must have seen the film to write one.

    One review per booking, so forwarding a friend's ticket doesn't let you
    post a second review — but someone who sees a film twice can leave two.
    """
    serializer_class = ReviewSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        """Scoped by movie when nested under `/api/movies/{slug}/reviews/`.

        The router passes `movie_slug` as a kwarg from the URL pattern; see
        the main urls.py include that captures `<slug:slug>`.
        """
        qs = Review.objects.select_related('user', 'movie', 'booking__showtime')
        movie_slug = self.kwargs.get('slug')
        if movie_slug:
            qs = qs.filter(movie__slug=movie_slug)

        # Sort by query param, defaulting to newest first.
        sort = self.request.query_params.get('sort', 'newest')
        if sort == 'highest':
            qs = qs.order_by('-rating', '-created_at')
        elif sort == 'lowest':
            qs = qs.order_by('rating', '-created_at')
        elif sort == 'helpful':
            qs = qs.order_by('-helpful_count', '-created_at')
        else:  # newest
            qs = qs.order_by('-created_at')

        return qs

    def perform_create(self, serializer):
        """Verify the user has a completed booking before allowing a review."""
        movie = serializer.validated_data['movie']
        booking = serializer.validated_data.get('booking')

        # Anonymous users are blocked by IsAuthenticated in the permission
        # classes, but make the check explicit for clarity.
        if not self.request.user.is_authenticated:
            raise ValidationError(
                {'detail': 'You must be logged in to write a review.'})

        # Must have actually seen the film to review it.
        if not booking:
            raise ValidationError(
                {'detail': 'You must have a booking for this movie to review it. '
                           'Only verified ticket holders can leave reviews.'})

        # The booking must be for the movie being reviewed.
        if booking.showtime.movie != movie:
            raise ValidationError(
                {'detail': 'The booking provided is for a different movie.'})

        # And it must belong to the current user.
        if booking.user != self.request.user:
            raise ValidationError(
                {'detail': 'You can only review movies you have booked yourself.'})

        # The show must have finished — no reviewing a film you walked out of
        # halfway through, or one that hasn't started yet.
        if booking.effective_status() != Booking.COMPLETED:
            raise ValidationError(
                {'detail': 'You can only review a movie after the show has ended.'})

        # One review per booking. Someone who sees a film twice can leave two
        # reviews, but they can't write three by forwarding a friend's ticket.
        if Review.objects.filter(booking=booking).exists():
            raise ValidationError(
                {'detail': 'You have already reviewed this booking. '
                           'Book another showing to leave a second review.'})

        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        """You can only edit your own review."""
        if serializer.instance.user != self.request.user:
            raise ValidationError({'detail': 'You can only edit your own reviews.'})
        serializer.save()

    def perform_destroy(self, instance):
        """You can only delete your own review."""
        if instance.user != self.request.user:
            raise ValidationError({'detail': 'You can only delete your own reviews.'})
        instance.delete()

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def reviewable(self, request, slug=None):
        """Which of my bookings for this movie can still be reviewed?

        The frontend needs this to decide whether to offer "Write Review" at
        all — and, when someone has seen the film twice, which showing the new
        review attaches to. Returning the list rather than a bare boolean is
        what makes one-review-per-booking expressible in the UI.
        """
        already_reviewed = Review.objects.filter(
            user=request.user).values_list('booking_id', flat=True)

        # Both statuses, because a booking reaches COMPLETED two ways: stored
        # outright once the gate or a sweep has promoted it, or still stored
        # CONFIRMED with a show that has since started. Filtering on CONFIRMED
        # alone drops every already-promoted booking before the check below
        # ever runs, which leaves everyone with nothing to review.
        candidates = (Booking.objects
                      .select_related('showtime')
                      .filter(user=request.user,
                              showtime__movie__slug=slug,
                              status__in=(Booking.CONFIRMED, Booking.COMPLETED))
                      .exclude(pk__in=already_reviewed)
                      .order_by('-showtime__start_time'))

        # `effective_status` is time-aware and can't be filtered in SQL: a
        # CONFIRMED booking only reads as COMPLETED once its show has started.
        reviewable = [b for b in candidates
                      if b.effective_status() == Booking.COMPLETED]

        return Response({
            'can_review': bool(reviewable),
            'bookings': [{
                'id': b.id,
                'reference': b.reference,
                'showtime': b.showtime.start_time,
                'seats': b.seats,
            } for b in reviewable],
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def helpful(self, request, pk=None, slug=None):
        """Vote a review helpful. Idempotent: voting twice changes nothing."""
        review = self.get_object()

        # You can't vote your own review helpful.
        if review.user == request.user:
            return Response(
                {'detail': 'You cannot vote your own review helpful.'},
                status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Lock the review row so two clicks can't both increment the counter.
            review = Review.objects.select_for_update().get(pk=review.pk)

            _, created = HelpfulVote.objects.get_or_create(
                review=review, user=request.user)

            if created:
                review.helpful_count = F('helpful_count') + 1
                review.save(update_fields=['helpful_count'])
                review.refresh_from_db()

        return Response(ReviewSerializer(review, context={'request': request}).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def unhelpful(self, request, pk=None, slug=None):
        """Remove your helpful vote. Idempotent: unvoting twice changes nothing."""
        review = self.get_object()

        with transaction.atomic():
            review = Review.objects.select_for_update().get(pk=review.pk)
            deleted_count, _ = HelpfulVote.objects.filter(
                review=review, user=request.user).delete()

            if deleted_count > 0:
                review.helpful_count = F('helpful_count') - 1
                review.save(update_fields=['helpful_count'])
                review.refresh_from_db()

        return Response(ReviewSerializer(review, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def movie_reviews_stats(request, slug):
    """Aggregate statistics for a movie's reviews.

    Shown above the review list on the Reviews tab. Plain function view rather
    than a viewset action because it doesn't operate on a single review.
    """
    try:
        movie = Movie.objects.get(slug=slug)
    except Movie.DoesNotExist:
        return Response({'detail': 'Movie not found.'},
                        status=status.HTTP_404_NOT_FOUND)

    stats = ReviewStatsSerializer.for_movie(movie)
    return Response(ReviewStatsSerializer(stats).data)
