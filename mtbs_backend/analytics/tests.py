"""Enhanced analytics: heatmaps, trends, and occupancy forecasting."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from movies.models import Movie
from payments.models import Payment
from reviews.models import Review
from showtimes.models import Showtime
from theatres.models import Theatre


class EnhancedAnalyticsTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = get_user_model().objects.create_user(
            username='boss', password='pass123', role='ADMIN')
        self.user = get_user_model().objects.create_user(
            username='punter', password='pass123', role='USER')
        self.movie = Movie.objects.create(
            title='Dune', genre='Sci-Fi', director='Villeneuve',
            cast='Chalamet', description='Sand.', duration_minutes=155)
        self.theatre = Theatre.objects.create(
            name='PVR Central', city='Mumbai', total_screens=3)

    def _showtime(self, when, **kwargs):
        return Showtime.objects.create(
            movie=self.movie, theatre=self.theatre, start_time=when,
            rows=kwargs.get('rows', 5), seats_per_row=kwargs.get('seats_per_row', 10),
            total_seats=kwargs.get('rows', 5) * kwargs.get('seats_per_row', 10),
            seats_available=kwargs.get('rows', 5) * kwargs.get('seats_per_row', 10),
            price=kwargs.get('price', Decimal('10')))

    def _booking(self, showtime, seats=2, status=Booking.CONFIRMED, paid=None):
        booking = Booking.objects.create(
            user=self.user, showtime=showtime, num_seats=seats,
            seats=list(range(1, seats + 1)), status=status)
        showtime.seats_available -= seats
        showtime.save(update_fields=['seats_available'])
        if paid is not None:
            Payment.objects.create(
                booking=booking, amount=Decimal(paid), status='SUCCESS')
        return booking

    def _review(self, booking, rating):
        return Review.objects.create(
            user=self.user, movie=self.movie, booking=booking,
            rating=rating, title='Title', comment='Comment.')

    def _get(self, **params):
        self.client.force_authenticate(self.admin)
        return self.client.get('/api/analytics/enhanced/', params)


class RevenueHeatmapTests(EnhancedAnalyticsTestBase):
    """Revenue by day-of-week × hour — which slots earn the most."""

    def test_heatmap_groups_by_showtime_slot_not_payment_timestamp(self):
        """The cell is when the film plays, not when the ticket sold."""
        # A show three days out; derive its true UTC weekday/hour rather than
        # assuming a calendar day, so the test holds whatever day it runs.
        slot = (timezone.now() + timedelta(days=3)).replace(
            hour=20, minute=0, second=0, microsecond=0)
        show = self._showtime(slot)
        booking = self._booking(show, seats=2, paid='20')
        expected_weekday = slot.isoweekday()  # 1=Mon .. 7=Sun

        # Age the payment three days earlier — a different weekday and hour.
        Payment.objects.filter(booking=booking).update(
            timestamp=slot - timedelta(days=3, hours=10))

        res = self._get()
        cells = res.data['revenue_heatmap']
        slot_cell = next(
            (c for c in cells if c['weekday'] == expected_weekday and c['hour'] == 20),
            None)
        self.assertIsNotNone(slot_cell, 'The 8pm show slot cell must exist')
        self.assertEqual(slot_cell['revenue'], 20.0)
        self.assertEqual(slot_cell['seats'], 2)
        # The payment weekday differs from the slot weekday (unless the offset
        # wraps to the same day, which 3 days never does) — no stray cell there.
        pay_weekday = (slot - timedelta(days=3, hours=10)).isoweekday()
        self.assertNotEqual(pay_weekday, expected_weekday)
        self.assertEqual(len(cells), 1, 'Only the show-slot cell should appear')

    def test_heatmap_nets_refunds_out_of_revenue(self):
        show = self._showtime(timezone.now() + timedelta(days=2, hours=14))
        booking = self._booking(show, seats=3, paid='30')
        Payment.objects.filter(booking=booking).update(
            refund_amount=Decimal('10'), refund_status='REFUNDED')

        res = self._get()
        cells = res.data['revenue_heatmap']
        self.assertEqual(sum(c['revenue'] for c in cells), 20.0)

    def test_only_success_payments_count(self):
        show = self._showtime(timezone.now() + timedelta(days=2))
        self._booking(show, seats=2, paid='20')
        pending = self._booking(show, seats=1)
        Payment.objects.create(
            booking=pending, amount=Decimal('10'), status='PENDING')

        res = self._get()
        cells = res.data['revenue_heatmap']
        self.assertEqual(sum(c['revenue'] for c in cells), 20.0)

    def test_heatmap_omits_empty_cells(self):
        """Only emit weekday × hour cells that have actual bookings."""
        slot = (timezone.now() + timedelta(days=2)).replace(
            hour=15, minute=0, second=0, microsecond=0)
        show = self._showtime(slot)
        self._booking(show, paid='10')

        res = self._get()
        cells = res.data['revenue_heatmap']
        self.assertEqual(len(cells), 1)
        self.assertEqual(cells[0]['hour'], slot.hour)
        self.assertEqual(cells[0]['weekday'], slot.isoweekday())


class CancellationTrendTests(EnhancedAnalyticsTestBase):
    """Weekly cancellation rate: cancelled / total created that week."""

    def test_trend_counts_cancellations_in_the_week_the_booking_was_created(self):
        two_weeks_ago = timezone.now() - timedelta(weeks=2)
        show = self._showtime(two_weeks_ago + timedelta(days=5))
        booking = self._booking(show, status=Booking.CANCELLED)

        # created_at is auto_now_add, so backdate it directly to land the
        # booking in the two-weeks-ago bucket rather than the current week.
        Booking.objects.filter(pk=booking.pk).update(created_at=two_weeks_ago)

        res = self._get(weeks=3)
        series = res.data['cancellation_trend']
        two_weeks_back = series[-3]
        self.assertEqual(two_weeks_back['total'], 1)
        self.assertEqual(two_weeks_back['cancelled'], 1)
        self.assertEqual(two_weeks_back['cancellation_rate_pct'], 100.0)

    def test_trend_zero_fills_quiet_weeks(self):
        res = self._get(weeks=4)
        series = res.data['cancellation_trend']
        self.assertEqual(len(series), 4)
        self.assertTrue(all(w['total'] == 0 for w in series))

    def test_released_rate_includes_expired_bookings(self):
        show = self._showtime(timezone.now() + timedelta(days=3))
        self._booking(show, status=Booking.CANCELLED)
        self._booking(show, status=Booking.EXPIRED)
        self._booking(show, status=Booking.CONFIRMED)

        res = self._get(weeks=1)
        week = res.data['cancellation_trend'][0]
        self.assertEqual(week['total'], 3)
        self.assertEqual(week['cancelled'], 1)
        self.assertEqual(week['expired'], 1)
        self.assertEqual(week['released_rate_pct'], round(2 / 3 * 100, 1))

    def test_trend_starts_on_a_monday(self):
        """TruncWeek anchors buckets to ISO week start (Monday)."""
        res = self._get(weeks=2)
        series = res.data['cancellation_trend']
        for entry in series:
            week_date = timezone.datetime.fromisoformat(entry['week']).date()
            self.assertEqual(week_date.weekday(), 0, 'Week must start on Monday')


class ReviewSentimentTests(EnhancedAnalyticsTestBase):
    """Average star rating per week — sentiment drift over time."""

    def test_sentiment_averages_ratings_per_week(self):
        now = timezone.now()
        show = self._showtime(now - timedelta(days=5))
        b1 = self._booking(show, status=Booking.COMPLETED)
        b2 = self._booking(show, status=Booking.COMPLETED)
        self._review(b1, 5)
        self._review(b2, 3)

        res = self._get(weeks=1)
        week = res.data['review_sentiment'][0]
        self.assertEqual(week['average_rating'], 4.0)
        self.assertEqual(week['count'], 2)

    def test_weeks_with_no_reviews_report_null_average(self):
        """Null breaks the line; zero would plunge misleadingly."""
        res = self._get(weeks=2)
        series = res.data['review_sentiment']
        self.assertEqual(len(series), 2)
        self.assertIsNone(series[0]['average_rating'])
        self.assertEqual(series[0]['count'], 0)

    def test_sentiment_rounds_to_two_decimals(self):
        now = timezone.now()
        show = self._showtime(now - timedelta(days=3))
        bookings = [self._booking(show, status=Booking.COMPLETED) for _ in range(3)]
        self._review(bookings[0], 5)
        self._review(bookings[1], 4)
        self._review(bookings[2], 3)

        res = self._get(weeks=1)
        week = res.data['review_sentiment'][0]
        self.assertEqual(week['average_rating'], 4.0)


class OccupancyForecastTests(EnhancedAnalyticsTestBase):
    """Naive 4-week trailing average projected forward."""

    def test_forecast_averages_past_shows_only(self):
        """Future shows don't count in the history."""
        now = timezone.now()
        # Two past shows: one half-full, one full.
        past1 = self._showtime(now - timedelta(weeks=2), rows=10, seats_per_row=10)
        past1.seats_available = 50  # 50% occupied
        past1.save()
        past2 = self._showtime(now - timedelta(weeks=1), rows=10, seats_per_row=10)
        past2.seats_available = 0  # 100% occupied
        past2.save()

        # One future show — excluded from history.
        self._showtime(now + timedelta(days=3), rows=10, seats_per_row=10)

        res = self._get()
        forecast = res.data['occupancy_forecast']
        # History capacity: 200, filled: 150 → 75%
        self.assertEqual(forecast['forecast_occupancy_pct'], 75.0)
        self.assertEqual(len(forecast['history']), 4)

    def test_forecast_projects_against_upcoming_capacity(self):
        now = timezone.now()
        past = self._showtime(now - timedelta(weeks=1), rows=10, seats_per_row=10)
        past.seats_available = 0  # 100% full
        past.save()

        # 200 seats scheduled next week.
        self._showtime(now + timedelta(days=3), rows=10, seats_per_row=10)
        self._showtime(now + timedelta(days=4), rows=10, seats_per_row=10)

        res = self._get()
        forecast = res.data['occupancy_forecast']
        self.assertEqual(forecast['upcoming_capacity'], 200)
        self.assertEqual(forecast['projected_seats_filled'], 200)

    def test_empty_history_yields_zero_forecast(self):
        res = self._get()
        forecast = res.data['occupancy_forecast']
        self.assertEqual(forecast['forecast_occupancy_pct'], 0.0)
        self.assertEqual(forecast['projected_seats_filled'], 0)

    def test_history_spans_four_weeks(self):
        res = self._get()
        forecast = res.data['occupancy_forecast']
        self.assertEqual(forecast['weeks_observed'], 4)
        self.assertEqual(len(forecast['history']), 4)


class EnhancedAnalyticsPermissionTests(EnhancedAnalyticsTestBase):
    def test_non_admin_is_rejected(self):
        self.client.force_authenticate(self.user)
        res = self.client.get('/api/analytics/enhanced/')
        self.assertEqual(res.status_code, 403)

    def test_unauthenticated_is_rejected(self):
        res = self.client.get('/api/analytics/enhanced/')
        self.assertEqual(res.status_code, 401)

    def test_weeks_param_is_clamped(self):
        res = self._get(weeks=100)
        self.assertEqual(res.data['range_weeks'], 52)

        res = self._get(weeks=-5)
        self.assertEqual(res.data['range_weeks'], 1)
