from rest_framework import serializers

from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    booking_id = serializers.IntegerField(source='booking.id', read_only=True)
    user = serializers.CharField(source='booking.user.username', read_only=True)
    refund_status_display = serializers.CharField(source='get_refund_status_display', read_only=True)
    net_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Payment
        fields = ['id', 'booking_id', 'user', 'amount', 'status', 'method',
                  'refund_status', 'refund_status_display', 'refund_amount',
                  'net_amount', 'refunded_at', 'timestamp']
        # The viewset is read-only, but say it here too: `amount` and
        # `refund_amount` are what the revenue figures are summed from, and
        # `status` is what confirms a booking. None of it should ever be
        # settable from a request body, whatever a future view does.
        read_only_fields = ['amount', 'status', 'method', 'refund_status',
                            'refund_amount', 'refunded_at', 'timestamp']
