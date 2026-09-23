from rest_framework import serializers

from movies.models import Movie
from movies.serializers import MovieSerializer
from .models import Watchlist


class WatchlistSerializer(serializers.ModelSerializer):
    """A saved entry, with the whole movie nested so the saved-films grid can
    render the same card the catalogue does — poster, rating, the lot.

    Writes take `movie_id`; the queryset is scoped to active films so a retired
    movie can't be freshly saved (an existing save survives a retirement — see
    the view's list, which still shows it).
    """
    movie = MovieSerializer(read_only=True)
    movie_id = serializers.PrimaryKeyRelatedField(
        queryset=Movie.objects.filter(is_active=True),
        source='movie', write_only=True)

    class Meta:
        model = Watchlist
        fields = ['id', 'movie', 'movie_id', 'created_at']
        read_only_fields = ['id', 'created_at']
