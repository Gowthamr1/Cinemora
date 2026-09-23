from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from bookings.models import Booking
from movies.models import Movie


class Review(models.Model):
    """A user's review of a movie they actually saw.

    Gated: you must own a CONFIRMED or COMPLETED booking for this movie to
    write one. One review per booking, so someone who sees a film twice can
    leave two reviews — once per showing — but forwarding a friend's ticket
    doesn't let you post a third.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews')
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name='reviews')
    booking = models.OneToOneField(
        Booking, on_delete=models.CASCADE, null=True, blank=True,
        help_text='The booking that grants this review. Null only for legacy '
                  'reviews written before the gate was added.')

    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)])
    title = models.CharField(max_length=200)
    comment = models.TextField()
    contains_spoiler = models.BooleanField(default=False)

    # Helpful votes are a write on the Review row, so a popular review with
    # thousands of votes doesn't spawn thousands of HelpfulVote rows.
    helpful_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['movie', '-created_at']),
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        stars = '⭐' * self.rating
        return f'{self.user.username} → {self.movie.title}: {stars}'


class HelpfulVote(models.Model):
    """One user's vote that a review was helpful.

    Separate table rather than incrementing `helpful_count` blindly, so the
    same user can't vote a review helpful a hundred times by refreshing.
    """
    review = models.ForeignKey(
        Review, on_delete=models.CASCADE, related_name='helpful_votes')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='helpful_votes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['review', 'user'], name='one_helpful_vote_per_user_per_review')
        ]

    def __str__(self):
        return f'{self.user.username} found {self.review.id} helpful'
