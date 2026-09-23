"""Wallet: gift-card purchase/redeem, the ledger, and the guarantee that the
balance can only ever move through the one locked service path.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from bookings.services import cancel_booking
from movies.models import Movie
from payments.models import Payment
from showtimes.models import Showtime
from .models import GiftCard, GiftCardPayment, Wallet, WalletTransaction
from .services import apply_delta


class WalletTestBase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='alice', password='pass123', role='USER')
        self.client = APIClient()
        self.client.force_authenticate(self.user)


# --------------------------------------------------------------------------- #
# Gift-card purchase — a two-step checkout, like a ticket
# --------------------------------------------------------------------------- #
class GiftCardPurchaseTest(WalletTestBase):
    def purchase(self, amount='25.00'):
        return self.client.post(
            '/api/wallet/gift-cards/purchase/', {'amount': amount}, format='json')

    def pay(self, card_id, method='CARD'):
        return self.client.post(
            f'/api/wallet/gift-cards/{card_id}/pay/', {'method': method},
            format='json')

    def buy(self, amount='25.00'):
        """The whole flow: start the purchase, then pay for it."""
        card_id = self.purchase(amount).data['id']
        return self.pay(card_id)

    def test_purchase_creates_an_unpaid_card_with_no_code(self):
        response = self.purchase('25.00')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['status'], GiftCard.PENDING)
        self.assertFalse(response.data['is_paid'])
        # The code is bearer money — it must not leak before the card is paid for.
        self.assertIsNone(response.data['code'])
        self.assertEqual(Decimal(response.data['amount']), Decimal('25.00'))

    def test_paying_activates_the_card_and_reveals_the_code(self):
        card_id = self.purchase('25.00').data['id']

        response = self.pay(card_id)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['payment']['status'], 'SUCCESS')
        self.assertEqual(Decimal(response.data['payment']['amount']), Decimal('25.00'))

        card = response.data['gift_card']
        self.assertEqual(card['status'], GiftCard.ACTIVE)
        self.assertTrue(card['is_paid'])
        self.assertTrue(card['code'].startswith('GC-'))

    def test_the_charge_is_priced_from_the_card_not_the_request(self):
        """A client cannot pay $1 for a $100 card — the body carries no amount."""
        card_id = self.purchase('100.00').data['id']

        response = self.client.post(
            f'/api/wallet/gift-cards/{card_id}/pay/',
            {'method': 'CARD', 'amount': '1.00'}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            GiftCardPayment.objects.get(gift_card_id=card_id).amount,
            Decimal('100.00'))

    def test_a_card_cannot_be_paid_for_twice(self):
        card_id = self.purchase().data['id']
        self.assertEqual(self.pay(card_id).status_code, 201)

        second = self.pay(card_id)

        self.assertEqual(second.status_code, 400)
        self.assertEqual(GiftCardPayment.objects.filter(gift_card_id=card_id).count(), 1)

    def test_someone_elses_card_cannot_be_paid_for(self):
        card_id = self.purchase().data['id']
        mallory = get_user_model().objects.create_user(
            username='mallory', password='pass123', role='USER')
        self.client.force_authenticate(mallory)

        response = self.pay(card_id)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(GiftCard.objects.get(pk=card_id).status, GiftCard.PENDING)

    def test_someone_elses_card_cannot_be_read(self):
        card_id = self.purchase().data['id']
        mallory = get_user_model().objects.create_user(
            username='mallory', password='pass123', role='USER')
        self.client.force_authenticate(mallory)

        self.assertEqual(
            self.client.get(f'/api/wallet/gift-cards/{card_id}/').status_code, 404)

    def test_every_purchase_gets_a_unique_code(self):
        codes = {self.buy().data['gift_card']['code'] for _ in range(10)}
        self.assertEqual(len(codes), 10)

    def test_an_off_menu_denomination_is_refused(self):
        response = self.purchase('13.37')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(GiftCard.objects.count(), 0)

    def test_a_negative_amount_is_refused(self):
        response = self.purchase('-50.00')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(GiftCard.objects.count(), 0)

    def test_my_cards_lists_only_mine_with_codes(self):
        mine = self.buy().data['gift_card']['code']
        mallory = get_user_model().objects.create_user(
            username='mallory', password='pass123', role='USER')
        other_client = APIClient()
        other_client.force_authenticate(mallory)
        other_id = other_client.post('/api/wallet/gift-cards/purchase/',
                                     {'amount': '10.00'}, format='json').data['id']
        other_client.post(f'/api/wallet/gift-cards/{other_id}/pay/',
                          {'method': 'CARD'}, format='json')

        listing = self.client.get('/api/wallet/gift-cards/').data
        rows = listing if isinstance(listing, list) else listing['results']
        self.assertEqual([r['code'] for r in rows], [mine])

    def test_my_cards_shows_pending_ones_without_their_code(self):
        """An abandoned checkout stays visible so it can be finished — but it
        still isn't worth anything, so the code stays hidden."""
        self.purchase('50.00')

        listing = self.client.get('/api/wallet/gift-cards/').data
        rows = listing if isinstance(listing, list) else listing['results']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['status'], GiftCard.PENDING)
        self.assertIsNone(rows[0]['code'])

    def test_a_gift_card_sale_is_not_ticket_revenue(self):
        """Gift-card charges live in their own table. Counting them alongside
        ticket payments would book the same money twice — once when the card is
        bought, again when the balance it creates pays for a booking."""
        self.buy('100.00')

        self.assertEqual(Payment.objects.count(), 0)
        self.assertEqual(GiftCardPayment.objects.count(), 1)


# --------------------------------------------------------------------------- #
# Redeem
# --------------------------------------------------------------------------- #
class RedeemTest(WalletTestBase):
    def setUp(self):
        super().setUp()
        self.card = GiftCard.objects.create(
            amount=Decimal('25.00'), status=GiftCard.ACTIVE)

    def redeem(self, code=None):
        return self.client.post(
            '/api/wallet/redeem/', {'code': code or self.card.code}, format='json')

    def test_redeem_credits_the_wallet_and_writes_a_ledger_row(self):
        response = self.redeem()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['new_balance']), Decimal('25.00'))

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.balance, Decimal('25.00'))

        txn = WalletTransaction.objects.get(wallet=wallet)
        self.assertEqual(txn.kind, WalletTransaction.REDEEM)
        self.assertEqual(txn.amount, Decimal('25.00'))
        # The snapshot is the whole point of the ledger — it must equal the
        # running balance at the moment the row was written.
        self.assertEqual(txn.balance_after, Decimal('25.00'))

    def test_an_unpaid_card_cannot_be_redeemed(self):
        """The critical one: starting a checkout and abandoning it must not
        create spendable credit. Even knowing the code, it is worth nothing."""
        unpaid = GiftCard.objects.create(
            amount=Decimal('100.00'), purchased_by=self.user,
            status=GiftCard.PENDING)

        response = self.redeem(unpaid.code)

        self.assertEqual(response.status_code, 404)
        self.assertFalse(Wallet.objects.filter(user=self.user).exists())
        unpaid.refresh_from_db()
        self.assertEqual(unpaid.status, GiftCard.PENDING)

    def test_a_card_becomes_redeemable_once_it_is_paid_for(self):
        card_id = self.client.post('/api/wallet/gift-cards/purchase/',
                                   {'amount': '50.00'}, format='json').data['id']
        self.assertEqual(self.redeem(GiftCard.objects.get(pk=card_id).code)
                         .status_code, 404)

        paid = self.client.post(f'/api/wallet/gift-cards/{card_id}/pay/',
                                {'method': 'CARD'}, format='json')

        response = self.redeem(paid.data['gift_card']['code'])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['new_balance']), Decimal('50.00'))

    def test_redeem_flips_the_card_to_redeemed(self):
        self.redeem()
        self.card.refresh_from_db()
        self.assertEqual(self.card.status, GiftCard.REDEEMED)
        self.assertEqual(self.card.redeemed_by, self.user)
        self.assertIsNotNone(self.card.redeemed_at)

    def test_a_redeemed_card_cannot_be_paid_for_again(self):
        """Redeem empties the card; the checkout must not re-charge for it."""
        self.card.purchased_by = self.user
        self.card.save(update_fields=['purchased_by'])
        self.redeem()

        response = self.client.post(f'/api/wallet/gift-cards/{self.card.id}/pay/',
                                    {'method': 'CARD'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(GiftCardPayment.objects.count(), 0)

    def test_a_code_can_only_be_redeemed_once(self):
        self.assertEqual(self.redeem().status_code, 200)

        second = self.redeem()
        self.assertEqual(second.status_code, 400)

        # The balance reflects exactly one credit, and there is exactly one
        # ledger row — the second attempt moved nothing.
        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.balance, Decimal('25.00'))
        self.assertEqual(WalletTransaction.objects.filter(wallet=wallet).count(), 1)

    def test_an_unknown_code_is_a_404(self):
        response = self.redeem('GC-ZZZZ-ZZZZ-ZZZZ')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(Wallet.objects.filter(user=self.user).exists())

    def test_redeem_is_case_and_space_insensitive(self):
        response = self.redeem(f'  {self.card.code.lower()}  ')
        self.assertEqual(response.status_code, 200)


# --------------------------------------------------------------------------- #
# The balance is not writable from the API
# --------------------------------------------------------------------------- #
class WalletReadOnlyTest(WalletTestBase):
    def setUp(self):
        super().setUp()
        apply_delta(self.user, Decimal('50.00'), WalletTransaction.REDEEM, 'seed')

    def test_the_wallet_collection_rejects_a_post(self):
        """There is no create route: you cannot POST yourself a balance."""
        response = self.client.post(
            '/api/wallet/', {'balance': '9999.00'}, format='json')

        self.assertEqual(response.status_code, 405)
        self.assertEqual(Wallet.objects.get(user=self.user).balance, Decimal('50.00'))

    def test_the_wallet_collection_rejects_a_patch(self):
        response = self.client.patch(
            '/api/wallet/', {'balance': '9999.00'}, format='json')

        self.assertEqual(response.status_code, 405)
        self.assertEqual(Wallet.objects.get(user=self.user).balance, Decimal('50.00'))

    def test_the_ledger_endpoint_rejects_a_post(self):
        response = self.client.post(
            '/api/wallet/transactions/',
            {'amount': '9999.00', 'kind': 'REDEEM', 'balance_after': '9999.00'},
            format='json')

        self.assertEqual(response.status_code, 405)
        self.assertEqual(WalletTransaction.objects.filter(
            wallet__user=self.user).count(), 1)

    def test_list_shows_balance_and_recent_ledger(self):
        data = self.client.get('/api/wallet/').data
        self.assertEqual(Decimal(data['wallet']['balance']), Decimal('50.00'))
        self.assertEqual(len(data['recent_transactions']), 1)


class ApplyDeltaTest(WalletTestBase):
    """The service is the only writer; it must refuse to go negative."""

    def test_a_debit_beyond_the_balance_raises_and_writes_nothing(self):
        apply_delta(self.user, Decimal('10.00'), WalletTransaction.REDEEM, 'seed')

        with self.assertRaises(ValueError):
            apply_delta(self.user, Decimal('-25.00'),
                        WalletTransaction.BOOKING_SPEND, 'overspend')

        # Balance untouched, and the failed debit left no ledger row.
        self.assertEqual(Wallet.objects.get(user=self.user).balance, Decimal('10.00'))
        self.assertEqual(WalletTransaction.objects.filter(
            wallet__user=self.user).count(), 1)

    def test_wallets_are_isolated_between_users(self):
        bob = get_user_model().objects.create_user(
            username='bob', password='pass123', role='USER')
        apply_delta(self.user, Decimal('30.00'), WalletTransaction.REDEEM, 'seed')

        self.assertEqual(Wallet.objects.get(user=self.user).balance, Decimal('30.00'))
        self.assertFalse(Wallet.objects.filter(user=bob).exists())


# --------------------------------------------------------------------------- #
# Spending wallet balance on a booking, and refunds back to it
# --------------------------------------------------------------------------- #
class WalletSpendTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='alice', password='pass123', role='USER')
        self.movie = Movie.objects.create(
            title="Dune", genre="Sci-Fi", director="Denis Villeneuve",
            cast="Timothee Chalamet", description="Spice", poster_url="")
        self.showtime = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() + timedelta(days=2),
            rows=10, seats_per_row=10, total_seats=100, seats_available=100,
            price=Decimal('10.00'))
        self.booking = Booking.objects.create(
            user=self.user, showtime=self.showtime, num_seats=3, seats=[1, 2, 3],
            status=Booking.PENDING)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def pay_wallet(self, booking=None):
        return self.client.post(
            '/api/payments/wallet/',
            {'booking_id': (booking or self.booking).id}, format='json')

    def test_a_funded_wallet_pays_confirms_and_debits(self):
        apply_delta(self.user, Decimal('50.00'), WalletTransaction.REDEEM, 'seed')

        response = self.pay_wallet()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['method'], Payment.METHOD_WALLET)

        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.CONFIRMED)

        # 50 - (3 seats * 10) = 20, and a matching spend row on the ledger.
        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.balance, Decimal('20.00'))
        spend = WalletTransaction.objects.get(
            wallet=wallet, kind=WalletTransaction.BOOKING_SPEND)
        self.assertEqual(spend.amount, Decimal('-30.00'))
        self.assertEqual(spend.balance_after, Decimal('20.00'))

    def test_an_underfunded_wallet_is_refused_and_nothing_moves(self):
        apply_delta(self.user, Decimal('5.00'), WalletTransaction.REDEEM, 'seed')

        response = self.pay_wallet()

        self.assertEqual(response.status_code, 400)
        # Booking still awaiting payment, balance intact, no payment row, and
        # the failed debit left no BOOKING_SPEND ledger line.
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.PENDING)
        self.assertEqual(Wallet.objects.get(user=self.user).balance, Decimal('5.00'))
        self.assertFalse(Payment.objects.filter(booking=self.booking).exists())
        self.assertFalse(WalletTransaction.objects.filter(
            kind=WalletTransaction.BOOKING_SPEND).exists())

    def test_a_wallet_paid_booking_refunds_back_to_the_wallet(self):
        apply_delta(self.user, Decimal('50.00'), WalletTransaction.REDEEM, 'seed')
        self.pay_wallet()  # balance now 20, booking confirmed

        # Show is >24h away, so this is a full refund of 30.
        refund = cancel_booking(self.booking)

        self.assertTrue(refund['eligible'])
        self.assertEqual(refund['amount'], 30.0)

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.balance, Decimal('50.00'))  # 20 + 30 back
        credit = WalletTransaction.objects.get(
            wallet=wallet, kind=WalletTransaction.BOOKING_REFUND)
        self.assertEqual(credit.amount, Decimal('30.00'))
        self.assertEqual(credit.balance_after, Decimal('50.00'))

    def test_a_card_paid_booking_does_not_touch_the_wallet_on_refund(self):
        # Pay by card (the mock endpoint), then cancel. No wallet exists, and
        # none should be conjured by the refund path.
        self.client.post('/api/payments/mock/',
                         {'booking_id': self.booking.id}, format='json')

        cancel_booking(self.booking)

        self.assertFalse(Wallet.objects.filter(user=self.user).exists())
        self.assertFalse(WalletTransaction.objects.filter(
            kind=WalletTransaction.BOOKING_REFUND).exists())

    def test_someone_elses_booking_cannot_be_paid_from_my_wallet(self):
        apply_delta(self.user, Decimal('50.00'), WalletTransaction.REDEEM, 'seed')
        mallory = get_user_model().objects.create_user(
            username='mallory', password='pass123', role='USER')
        self.client.force_authenticate(mallory)

        response = self.pay_wallet()

        self.assertEqual(response.status_code, 404)
        # Alice's balance is untouched — no cross-user debit occurred.
        self.assertEqual(Wallet.objects.get(user=self.user).balance, Decimal('50.00'))
