from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from accounts.permissions import CanBook
from .models import GiftCard, GiftCardPayment, Wallet, WalletTransaction
from .serializers import (
    GiftCardPaymentSerializer,
    GiftCardSerializer,
    PayGiftCardSerializer,
    PurchaseGiftCardSerializer,
    RedeemCodeSerializer,
    WalletSerializer,
    WalletTransactionSerializer,
)
from .services import apply_delta


class WalletViewSet(viewsets.GenericViewSet):
    """Wallet balance and ledger, scoped to the authenticated user.

    The balance itself is never writable from a request — it is mutated only
    through `wallet.services.apply_delta`, which locks the row and writes a
    ledger line in the same transaction.
    """
    permission_classes = [IsAuthenticated, CanBook]
    # Only the redeem action consumes this (via its ScopedRateThrottle). The
    # other actions use the project's default anon/user throttles, which ignore
    # throttle_scope. Defined here because ScopedRateThrottle reads it off the
    # view and the attribute has to exist on the class to be set per-action.
    throttle_scope = 'verify'

    def get_queryset(self):
        # Every endpoint here is scoped to request.user; a staff member has no
        # wallet and CanBook forbids them.
        return Wallet.objects.filter(user=self.request.user)

    def list(self, request):
        """GET /api/wallet/ — balance + recent ledger."""
        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        recent = WalletTransaction.objects.filter(wallet=wallet)[:5]
        return Response({
            'wallet': WalletSerializer(wallet).data,
            'recent_transactions': WalletTransactionSerializer(recent, many=True).data,
        })

    @action(detail=False, methods=['get'], url_path='transactions')
    def transactions(self, request):
        """GET /api/wallet/transactions/ — paginated ledger."""
        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        txns = WalletTransaction.objects.filter(wallet=wallet)
        page = self.paginate_queryset(txns)
        if page is not None:
            serializer = WalletTransactionSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = WalletTransactionSerializer(txns, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='gift-cards')
    def gift_cards(self, request):
        """GET /api/wallet/gift-cards/ — my purchased cards, codes visible."""
        cards = GiftCard.objects.filter(purchased_by=request.user)
        page = self.paginate_queryset(cards)
        if page is not None:
            serializer = GiftCardSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = GiftCardSerializer(cards, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='gift-cards/purchase')
    def purchase_gift_card(self, request):
        """POST /api/wallet/gift-cards/purchase/ — start a gift-card purchase.

        Creates the card in PENDING and hands back its id. Nothing is spendable
        yet: the code is withheld and redeem refuses the card until the checkout
        below is paid. This is the same two-step shape as a ticket — a booking
        is created PENDING, then `/payments/mock/` confirms it — so an abandoned
        checkout leaves an unpaid record rather than free credit.

        The denomination is validated server-side against the fixed set, so a
        client cannot start a purchase for an arbitrary amount.
        """
        serializer = PurchaseGiftCardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data['amount']

        card = GiftCard.objects.create(
            amount=amount,
            purchased_by=request.user,
            status=GiftCard.PENDING,
        )
        return Response(GiftCardSerializer(card).data, status=status.HTTP_201_CREATED)

    # `\d+`, not `[^/.]+`: DRF registers extra actions in alphabetical order by
    # method name, so a looser pattern here would sit in front of
    # `gift-cards/purchase` and swallow it (a GET-only route answering a POST —
    # a 405). Primary keys are integers, so the constraint costs nothing.
    @action(detail=False, methods=['get'],
            url_path=r'gift-cards/(?P<card_id>\d+)')
    def gift_card_detail(self, request, card_id=None):
        """GET /api/wallet/gift-cards/{id}/ — one of my cards.

        The checkout page reads this to show what it is about to charge for.
        Scoped to the buyer: another user's card is a 404, not a 403, so the
        endpoint doesn't confirm that an id exists.
        """
        card = self._own_card(request, card_id)
        if card is None:
            return Response({'error': 'Gift card not found or not authorized.'},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(GiftCardSerializer(card).data)

    @action(detail=False, methods=['post'],
            url_path=r'gift-cards/(?P<card_id>\d+)/pay')
    def pay_gift_card(self, request, card_id=None):
        """POST /api/wallet/gift-cards/{id}/pay/ — pay for a pending card.

        The mock charge, mirroring `/api/payments/mock/`: no money moves, the
        amount is copied off the card rather than read from the body, and the
        card row is locked so two clicks on "Pay" cannot both succeed. Only on
        success does the card become ACTIVE — which is also the moment its code
        becomes readable.
        """
        serializer = PayGiftCardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data['method']

        with transaction.atomic():
            try:
                card = GiftCard.objects.select_for_update().get(
                    pk=card_id, purchased_by=request.user)
            except (GiftCard.DoesNotExist, ValueError, TypeError):
                return Response({'error': 'Gift card not found or not authorized.'},
                                status=status.HTTP_404_NOT_FOUND)

            if card.status != GiftCard.PENDING:
                # Already paid (ACTIVE), or already spent (REDEEMED). Either way
                # there is nothing left to charge for.
                return Response(
                    {'error': 'This gift card has already been paid for.'},
                    status=status.HTTP_400_BAD_REQUEST)

            card.status = GiftCard.ACTIVE
            card.paid_at = timezone.now()
            card.save(update_fields=['status', 'paid_at'])

            payment = GiftCardPayment.objects.create(
                gift_card=card, amount=card.amount, status='SUCCESS',
                method=method)

        return Response({
            'payment': GiftCardPaymentSerializer(payment).data,
            'gift_card': GiftCardSerializer(card).data,
        }, status=status.HTTP_201_CREATED)

    def _own_card(self, request, card_id):
        """A gift card the caller bought, or None. Never another user's."""
        try:
            return GiftCard.objects.get(pk=card_id, purchased_by=request.user)
        except (GiftCard.DoesNotExist, ValueError, TypeError):
            return None

    @action(detail=False, methods=['post'], url_path='redeem',
            throttle_classes=[ScopedRateThrottle], throttle_scope='verify')
    def redeem(self, request):
        """POST /api/wallet/redeem/ — redeem a gift card code (one-time use).

        Throttled with the 'verify' scope (60/min) to make brute-force guessing
        a code impractical. The status flip happens under a row lock so a code
        can only ever credit a wallet once.

        A PENDING card — one that was started but never paid for — is refused.
        The code is bearer money: we can't reveal it before the checkout is
        paid, and we can't credit it without a charge. An abandoned checkout
        leaves an unpaid card, which may as well not exist.
        """
        serializer = RedeemCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data['code'].strip().upper()

        with transaction.atomic():
            try:
                card = GiftCard.objects.select_for_update().get(code=code)
            except GiftCard.DoesNotExist:
                return Response({'detail': 'Invalid or unknown code.'},
                                status=status.HTTP_404_NOT_FOUND)

            if card.status == GiftCard.PENDING:
                # The card exists but was never paid for. From the redeemer's
                # perspective it is worthless — and telling them it exists would
                # confirm that the code is real, leaking the one fact they need
                # to pay for it themselves.
                return Response({'detail': 'Invalid or unknown code.'},
                                status=status.HTTP_404_NOT_FOUND)

            if card.status == GiftCard.REDEEMED:
                return Response({'detail': 'This code has already been redeemed.'},
                                status=status.HTTP_400_BAD_REQUEST)

            card.status = GiftCard.REDEEMED
            card.redeemed_by = request.user
            card.redeemed_at = timezone.now()
            card.save(update_fields=['status', 'redeemed_by', 'redeemed_at'])

            txn = apply_delta(
                user=request.user,
                amount=card.amount,
                kind=WalletTransaction.REDEEM,
                description=f'Gift card {card.code}',
            )

        return Response({
            'message': f'Successfully redeemed ${card.amount}.',
            'new_balance': txn.balance_after,
        })
