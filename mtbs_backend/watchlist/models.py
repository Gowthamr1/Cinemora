from django.conf import settings
from django.db import models

from movies.models import Movie


class Watchlist(models.Model):
    """A movie a user has saved to watch later.

    One row per (user, movie): a UniqueConstraint makes saving the same film
    twice a no-op at the database level, so a double-tap on the heart can never
    create a duplicate even if two requests race. Deleting either the user or
    the movie takes the saved entry with it — a watchlist pointing at a film
    that no longer exists would only ever render a dead card.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='watchlist')
    movie = models.ForeignKey(
        Movie, on_delete=models.CASCADE, related_name='watchlisted_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Newest saves first — the list reads like a stack of "things I just
        # found and want to get back to".
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'movie'], name='unique_watchlist_entry'),
        ]
        # The only query this table serves: one user's saved films, newest
        # first. The composite index covers both the filter and the sort.
        indexes = [models.Index(fields=['user', '-created_at'])]

    def __str__(self):
        return f'{self.user.username} ♥ {self.movie.title}'
