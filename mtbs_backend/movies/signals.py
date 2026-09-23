"""Cache invalidation for the movie filter dropdowns.

The `/api/movies/filter-options/` response is derived from three tables, so it
has to be dropped when any of them changes — not just Movie. Listening on the
models rather than on the admin views means an edit made through the Django
admin, a management command or a shell invalidates it too.
"""
from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from showtimes.models import Showtime
from theatres.models import Theatre

from .cache import FILTER_OPTIONS_CACHE_KEY
from .models import Movie

# Showtime is watched for the price range only, and it is the most frequently
# written of the three — but writes are admin-scheduling actions, not per
# booking, so the churn is low. (Booking never touches this cache: it changes
# `seats_available`, which the dropdowns don't read.)


@receiver(post_save, sender=Movie)
@receiver(post_save, sender=Theatre)
@receiver(post_save, sender=Showtime)
@receiver(post_delete, sender=Movie)
@receiver(post_delete, sender=Theatre)
@receiver(post_delete, sender=Showtime)
def invalidate_filter_options(sender, **kwargs):
    cache.delete(FILTER_OPTIONS_CACHE_KEY)
