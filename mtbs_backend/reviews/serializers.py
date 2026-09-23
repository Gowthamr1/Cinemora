from django.db.models import Avg, Count, Q
from rest_framework import serializers

from bookings.models import Booking
from .models import Review, HelpfulVote


class ReviewSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    movie_title = serializers.CharField(source='movie.title', read_only=True)
    # The frontend builds its vote/edit/delete URLs from this, so the card
    # component doesn't need the slug threaded down to it as a prop.
    movie_slug = serializers.CharField(source='movie.slug', read_only=True)
    is_verified = serializers.SerializerMethodField()
    user_has_voted_helpful = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = (
            'id', 'username', 'movie_title', 'movie_slug', 'movie', 'booking',
            'rating', 'title', 'comment', 'contains_spoiler', 'helpful_count',
            'is_verified', 'user_has_voted_helpful', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'helpful_count', 'created_at', 'updated_at')

    def get_is_verified(self, obj):
        """A review with a booking was written by someone who actually saw it."""
        return obj.booking is not None

    def get_user_has_voted_helpful(self, obj):
        """Whether the current user already voted this review helpful.

        Null when the request is anonymous — the vote button shouldn't render.
        """
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        return HelpfulVote.objects.filter(review=obj, user=request.user).exists()


class ReviewStatsSerializer(serializers.Serializer):
    """Aggregate statistics for a movie's reviews — shown above the list."""
    average_rating = serializers.DecimalField(max_digits=3, decimal_places=2)
    total_reviews = serializers.IntegerField()
    rating_distribution = serializers.DictField(child=serializers.IntegerField())

    @staticmethod
    def for_movie(movie):
        """Compute the stats dict that this serializer expects."""
        reviews = movie.reviews.all()
        total = reviews.count()

        if total == 0:
            return {
                'average_rating': 0,
                'total_reviews': 0,
                'rating_distribution': {str(r): 0 for r in range(1, 6)},
            }

        # Annotate each rating value with its count.
        dist = reviews.values('rating').annotate(count=Count('rating')).order_by('rating')
        distribution = {str(d['rating']): d['count'] for d in dist}
        # Fill in the missing stars so the frontend always gets 1-5.
        for r in range(1, 6):
            distribution.setdefault(str(r), 0)

        avg = reviews.aggregate(avg=Avg('rating'))['avg'] or 0

        return {
            'average_rating': round(avg, 2),
            'total_reviews': total,
            'rating_distribution': distribution,
        }
