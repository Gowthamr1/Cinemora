"""Payments: the mock charge, and the fact that nothing else may write one."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import PAYMENT_WINDOW_MINUTES, Booking
from movies.models import Movie
from showtimes.models import Showtime
from .models import Payment


class PaymentTestBase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='user2', password='pass123', role='USER')
        self.movie = Movie.objects.create(
            title="Avatar", genre="Action", director="James Cameron",
            cast="Sam Worthington", description="Epic sci-fi", poster_url="",
        )
        self.showtime = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() + timedelta(days=1),
            rows=10, seats_per_row=10, total_seats=100, seats_available=100,
            price=Decimal('10.00'),
        )
        self.booking = Booking.objects.create(
            user=self.user, showtime=self.showtime, num_seats=3, seats=[1, 2, 3],
            status=Booking.PENDING)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def pay(self, booking=None):
        return self.client.post(
            '/api/payments/mock/',
            {'booking_id': (booking or self.booking).id}, format='json')


class PaymentModelTest(PaymentTestBase):
    def test_mock_payment(self):
        payment = Payment.objects.create(
            booking=self.booking, amount=Decimal('30.00'), status='SUCCESS')
        self.assertEqual(payment.amount, Decimal('30.00'))
        self.assertEqual(payment.status, 'SUCCESS')


class MockPaymentTest(PaymentTestBase):
    def test_paying_prices_the_booking_and_confirms_it(self):
        response = self.pay()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Decimal(response.data['amount']), Decimal('30.00'))
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.CONFIRMED)

    def test_the_client_cannot_name_its_own_price(self):
        response = self.client.post(
            '/api/payments/mock/',
            {'booking_id': self.booking.id, 'amount': '0.01'}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Payment.objects.get(booking=self.booking).amount,
                         Decimal('30.00'))

    def test_paying_twice_is_refused(self):
        self.assertEqual(self.pay().status_code, 201)

        response = self.pay()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Payment.objects.filter(booking=self.booking).count(), 1)

    def test_an_expired_booking_cannot_be_paid_for(self):
        """Its seats are back on sale, so a charge would sell them twice."""
        Booking.objects.filter(pk=self.booking.pk).update(
            created_at=timezone.now() - timedelta(minutes=PAYMENT_WINDOW_MINUTES + 1))

        response = self.pay()

        self.assertEqual(response.status_code, 400)
        self.assertIn('expired', response.data['error'])
        self.assertFalse(Payment.objects.filter(booking=self.booking).exists())

    def test_a_cancelled_booking_cannot_be_paid_for(self):
        self.booking.status = Booking.CANCELLED
        self.booking.save(update_fields=['status'])

        response = self.pay()
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Payment.objects.filter(booking=self.booking).exists())

    def test_a_played_show_cannot_be_paid_for(self):
        past = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() - timedelta(hours=2),
            rows=5, seats_per_row=10, total_seats=50, seats_available=50)
        stale = Booking.objects.create(
            user=self.user, showtime=past, num_seats=1, seats=[1],
            status=Booking.PENDING)

        response = self.pay(stale)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Payment.objects.filter(booking=stale).exists())

    def test_someone_elses_booking_cannot_be_paid_for(self):
        mallory = get_user_model().objects.create_user(
            username='mallory', password='pass123', role='USER')
        self.client.force_authenticate(mallory)

        response = self.pay()

        self.assertEqual(response.status_code, 404)
        self.assertFalse(Payment.objects.filter(booking=self.booking).exists())

    def test_a_missing_booking_id_is_a_400_not_a_crash(self):
        self.assertEqual(
            self.client.post('/api/payments/mock/', {}, format='json').status_code, 400)

    def test_a_nonsense_booking_id_is_a_404_not_a_crash(self):
        response = self.client.post(
            '/api/payments/mock/', {'booking_id': 'not-a-number'}, format='json')
        self.assertEqual(response.status_code, 404)


class PaymentReadOnlyTest(PaymentTestBase):
    """Revenue is summed from `amount`, so nothing may edit a payment."""

    def setUp(self):
        super().setUp()
        self.payment = Payment.objects.create(
            booking=self.booking, amount=Decimal('30.00'), status='SUCCESS')

    def test_a_payment_cannot_be_patched(self):
        response = self.client.patch(f'/api/payments/{self.payment.id}/',
                                     {'amount': '0.01'}, format='json')

        self.assertEqual(response.status_code, 405)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.amount, Decimal('30.00'))

    def test_a_refund_cannot_be_awarded_by_hand(self):
        response = self.client.patch(
            f'/api/payments/{self.payment.id}/',
            {'refund_status': 'REFUNDED', 'refund_amount': '30.00'}, format='json')

        self.assertEqual(response.status_code, 405)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.refund_status, Payment.REFUND_NONE)
        self.assertEqual(self.payment.refund_amount, Decimal('0'))

    def test_a_payment_cannot_be_posted_directly(self):
        pending = Booking.objects.create(
            user=self.user, showtime=self.showtime, num_seats=1, seats=[9],
            status=Booking.PENDING)
        response = self.client.post(
            '/api/payments/',
            {'booking': pending.id, 'amount': '0.00', 'status': 'SUCCESS'},
            format='json')

        self.assertEqual(response.status_code, 405)
        self.assertFalse(Payment.objects.filter(booking=pending).exists())

    def test_a_payment_cannot_be_deleted(self):
        response = self.client.delete(f'/api/payments/{self.payment.id}/')
        self.assertEqual(response.status_code, 405)
        self.assertTrue(Payment.objects.filter(pk=self.payment.pk).exists())

    def test_users_only_see_their_own_payments(self):
        mallory = get_user_model().objects.create_user(
            username='mallory', password='pass123', role='USER')
        self.client.force_authenticate(mallory)

        listing = self.client.get('/api/payments/').data
        rows = listing if isinstance(listing, list) else listing['results']
        self.assertEqual(rows, [])
        self.assertEqual(
            self.client.get(f'/api/payments/{self.payment.id}/').status_code, 404)
