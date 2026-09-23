from rest_framework import serializers

from .models import Movie

# A film shorter than a minute isn't one, and the longest features run to a few
# hours — a runtime outside this range is a typo, and it silently corrupts
# scheduling because `end_time` is derived from it.
MIN_RUNTIME_MINUTES = 1
MAX_RUNTIME_MINUTES = 600


class MovieSerializer(serializers.ModelSerializer):
    # Populated by MovieViewSet.get_queryset's annotate(); default keeps the
    # serializer usable on a bare Movie instance (e.g. after create/update,
    # where DRF re-serializes the saved object without the annotation).
    review_count = serializers.IntegerField(read_only=True, default=0)
    # DecimalField so it round-trips as a fixed "4.30" rather than a float the
    # frontend has to re-round; null until the film has its first review.
    average_rating = serializers.DecimalField(
        max_digits=3, decimal_places=2, read_only=True, allow_null=True)

    class Meta:
        model = Movie
        fields = '__all__'
        # Derived from the title on first save, then frozen — it's a published
        # URL, so letting a client PUT a new one would break existing links.
        read_only_fields = ['slug']

    def validate_title(self, value):
        title = value.strip()
        if not title:
            raise serializers.ValidationError('Title cannot be blank.')
        return title

    def validate_duration_minutes(self, value):
        if value is None:
            return value
        if not MIN_RUNTIME_MINUTES <= value <= MAX_RUNTIME_MINUTES:
            raise serializers.ValidationError(
                f'Runtime must be between {MIN_RUNTIME_MINUTES} and '
                f'{MAX_RUNTIME_MINUTES} minutes.')
        return value
