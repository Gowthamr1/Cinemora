from rest_framework import serializers

from .models import Theatre


class TheatreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Theatre
        fields = ['id', 'name', 'city', 'address', 'total_screens']

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError('Theatre name cannot be blank.')
        return name

    def validate_city(self, value):
        city = value.strip()
        if not city:
            raise serializers.ValidationError('City cannot be blank.')
        return city

    def validate_total_screens(self, value):
        # `screen_number` on a showtime is validated against this, so a zero
        # here would make the theatre unschedulable.
        if value < 1:
            raise serializers.ValidationError('A theatre needs at least one screen.')
        return value

    def validate(self, attrs):
        """Don't strand shows on a screen that no longer exists."""
        instance = self.instance
        total = attrs.get('total_screens', getattr(instance, 'total_screens', None))
        if instance and total:
            highest = (instance.showtimes
                       .order_by('-screen_number')
                       .values_list('screen_number', flat=True)
                       .first())
            if highest and highest > total:
                raise serializers.ValidationError({
                    'total_screens': f'Screen {highest} already has shows scheduled, '
                                     f'so this theatre cannot shrink to {total} screens.'
                })
        return attrs
