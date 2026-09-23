from decimal import Decimal

from rest_framework import serializers

from .models import GiftCard, GiftCardPayment, Wallet, WalletTransaction, GIFT_CARD_DENOMINATIONS


class WalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Wallet
        fields = ('balance', 'created_at', 'updated_at')
        read_only_fields = ('balance', 'created_at', 'updated_at')


class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = ('id', 'amount', 'kind', 'balance_after', 'description', 'created_at')
        read_only_fields = fields


class GiftCardSerializer(serializers.ModelSerializer):
    """A gift card as its buyer sees it.

    The code is visible once the card is paid for — the buyer needs it to hand
    the card on. Before then it is withheld: an unpaid card's code is worthless
    to us but would be perfectly usable to whoever read it, so revealing it
    would hand out free credit to anyone who starts a checkout and abandons it.
    """
    code = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    is_paid = serializers.BooleanField(read_only=True)

    class Meta:
        model = GiftCard
        fields = ('id', 'code', 'amount', 'status', 'status_display', 'is_paid',
                  'paid_at', 'created_at')
        read_only_fields = fields

    def get_code(self, obj):
        return obj.code if obj.is_paid else None


class PurchaseGiftCardSerializer(serializers.Serializer):
    """Request shape for starting a gift-card purchase."""
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)

    def validate_amount(self, value):
        # Server-side denomination check: a client can only buy a card in one of
        # the amounts we actually sell, not an arbitrary or malicious value.
        if value not in GIFT_CARD_DENOMINATIONS:
            allowed = ', '.join(f'${d}' for d in GIFT_CARD_DENOMINATIONS)
            raise serializers.ValidationError(
                f'Amount must be one of: {allowed}')
        return value


class RedeemCodeSerializer(serializers.Serializer):
    """Request shape for redeeming a gift card into wallet balance."""
    code = serializers.CharField(max_length=20)


class GiftCardPaymentSerializer(serializers.ModelSerializer):
    """The mock charge record for a gift-card purchase."""
    code = serializers.CharField(source='gift_card.code', read_only=True)
    gift_card_id = serializers.IntegerField(source='gift_card.id', read_only=True)

    class Meta:
        model = GiftCardPayment
        fields = ('id', 'gift_card_id', 'code', 'amount', 'status', 'method',
                  'timestamp')
        # Nothing here is settable from a request: `amount` is copied off the
        # card and `status` is what makes the card spendable.
        read_only_fields = fields


class PayGiftCardSerializer(serializers.Serializer):
    """Request shape for paying for a pending gift card.

    Only the method is accepted — the amount comes from the card itself, so a
    client cannot pay $1 for a $100 card.
    """
    method = serializers.ChoiceField(
        choices=[GiftCardPayment.METHOD_CARD, GiftCardPayment.METHOD_UPI],
        default=GiftCardPayment.METHOD_CARD)
