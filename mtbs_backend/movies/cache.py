"""Cache keys shared between the movie views and their invalidation signals.

Lives in its own module so `apps.ready()` can import the signal receivers
without pulling in the whole view layer.
"""

FILTER_OPTIONS_CACHE_KEY = 'movies:filter-options'
