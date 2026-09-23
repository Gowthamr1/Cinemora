from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import CanBook
from bookings.models import Booking
from wallet.models import WalletTransaction
from wallet.services import apply_delta
from .models import Payment
from .serializers import PaymentSerializer


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """Payments are records, not documents.

    Read-only on purpose: a writable payment would let a user PATCH
    `status='SUCCESS'` onto their own unpaid booking, or edit `amount` and
    `refund_amount` — which are what the analytics revenue figures are summed
    from. The only way to create one is the mock charge below, which prices
    the booking itself rather than trusting a client-supplied amount.
    """
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        # Door staff can never own a booking, so the ownership scoping below
        # already blocks them — but saying so explicitly means this keeps
        # holding if a booking is ever created on someone else's behalf.
        if self.action in ('mock_payment', 'wallet_payment'):
            return [CanBook()]
        return super().get_permissions()

    def get_queryset(self):
        qs = Payment.objects.select_related('booking__user', 'booking__showtime')
        user = self.request.user
        if getattr(user, 'is_admin', False):
            return qs.order_by('-timestamp')
        return qs.filter(booking__user=user).order_by('-timestamp')

    def _resolve_payable_booking(self, request):
        """Shared pre-charge validation for both payment methods.

        Returns `(booking, error_response)`. Exactly one is truthy: on success
        the booking is a fresh, unpaid, still-payable row owned by the caller;
        on failure the Response carries the reason and status code.
        """
        booking_id = request.data.get('booking_id')
        if not booking_id:
            return None, Response({'error': 'booking_id is required.'},
                                  status=status.HTTP_400_BAD_REQUEST)

        # Scoped to the caller: without `user=`, anyone could pay — and thereby
        # confirm — a stranger's booking.
        try:
            booking = (Booking.objects
                       .select_related('showtime')
                       .get(id=booking_id, user=request.user))
        except (Booking.DoesNotExist, ValueError, TypeError):
            return None, Response({'error': 'Booking not found or not authorized.'},
                                  status=status.HTTP_404_NOT_FOUND)

        # `effective_status` is time-aware, so a booking that sat past its
        # payment window reads as EXPIRED even before the sweep runs. Its seats
        # are back on sale — charging for it would sell a seat someone else can
        # now buy.
        effective = booking.effective_status()
        if effective != Booking.PENDING:
            reason = {
                Booking.EXPIRED: 'This booking expired before it was paid for. '
                                 'The seats were released — please book again.',
                Booking.CANCELLED: 'This booking was cancelled.',
                Booking.CONFIRMED: 'This booking has already been paid for.',
                Booking.COMPLETED: 'This show has already played.',
            }.get(effective, 'This booking is no longer awaiting payment.')
            return None, Response({'error': reason}, status=status.HTTP_400_BAD_REQUEST)

        # A booking made minutes before the show still reads as PENDING once the
        # show starts — `effective_status` only promotes CONFIRMED bookings to
        # COMPLETED. Selling a seat for a film already running isn't a sale.
        if booking.is_past_show:
            return None, Response({'error': 'This show has already started.'},
                                  status=status.HTTP_400_BAD_REQUEST)

        return booking, None

    @action(detail=False, methods=['post'], url_path='mock')
    def mock_payment(self, request):
        booking, error = self._resolve_payable_booking(request)
        if error:
            return error

        # Price is computed here, never taken from the request body.
        amount = booking.num_seats * booking.showtime.price

        with transaction.atomic():
            # Lock the booking row so two clicks on "Pay" can't both pass the
            # checks above and race to create the payment.
            locked = Booking.objects.select_for_update().get(pk=booking.pk)
            if hasattr(locked, 'payment'):
                return Response({'error': 'Payment already exists for this booking.'},
                                status=status.HTTP_400_BAD_REQUEST)

            payment = Payment.objects.create(
                booking=locked, amount=amount, status='SUCCESS',
                method=Payment.METHOD_CARD)

            locked.status = Booking.CONFIRMED
            locked.save(update_fields=['status'])

        return Response(PaymentSerializer(payment).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='wallet')
    def wallet_payment(self, request):
        """POST /api/payments/wallet/ — pay for a booking from wallet balance.

        Same server-side pricing and booking checks as the card path, plus an
        atomic debit of the wallet: `apply_delta` locks the wallet row, refuses
        to go negative, and writes the ledger line in the same transaction that
        creates the payment and confirms the booking. Nothing is half-done — an
        insufficient balance rolls the whole thing back with the booking still
        PENDING.
        """
        booking, error = self._resolve_payable_booking(request)
        if error:
            return error

        # Price is computed here, never taken from the request body.
        amount = booking.num_seats * booking.showtime.price

        try:
            with transaction.atomic():
                locked = Booking.objects.select_for_update().get(pk=booking.pk)
                if hasattr(locked, 'payment'):
                    return Response({'error': 'Payment already exists for this booking.'},
                                    status=status.HTTP_400_BAD_REQUEST)

                # Debit first: apply_delta raises if the balance can't cover it,
                # which aborts the transaction before any payment row is made.
                apply_delta(
                    user=request.user,
                    amount=-amount,
                    kind=WalletTransaction.BOOKING_SPEND,
                    description=f'Booking {locked.reference}',
                )

                payment = Payment.objects.create(
                    booking=locked, amount=amount, status='SUCCESS',
                    method=Payment.METHOD_WALLET)

                locked.status = Booking.CONFIRMED
                locked.save(update_fields=['status'])
        except ValueError:
            # Raised by apply_delta on insufficient funds. The transaction is
            # already rolled back; the booking is untouched and still payable.
            return Response(
                {'error': 'Insufficient wallet balance for this booking.'},
                status=status.HTTP_400_BAD_REQUEST)

        return Response(PaymentSerializer(payment).data,
                        status=status.HTTP_201_CREATED)
