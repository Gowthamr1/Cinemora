"""Booking lifecycle: statuses, cancellation, refunds and seat release."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from movies.models import Movie
from payments.models import Payment
from reviews.models import Review
from showtimes.models import Showtime
from .models import PAYMENT_WINDOW_MINUTES, Booking
from .services import (FULL_REFUND_HOURS, cancel_booking, refund_preview,
                       sweep_stale_bookings)


class BookingTestBase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='user1', password='pass123', role='USER')
        self.movie = Movie.objects.create(
            title="Matrix", genre="Sci-Fi", director="Wachowskis",
            cast="Keanu Reeves", description="Simulation thriller",
            poster_url="", duration_minutes=136,
        )
        self.showtime = Showtime.objects.create(
            movie=self.movie,
            start_time=timezone.now() + timedelta(days=3),
            rows=10, seats_per_row=10, total_seats=100, seats_available=100,
        )

    def book(self, seats=(1, 2), status=Booking.CONFIRMED, paid=None, showtime=None):
        showtime = showtime or self.showtime
        booking = Booking.objects.create(
            user=self.user, showtime=showtime, num_seats=len(seats),
            seats=list(seats), status=status,
        )
        showtime.seats_available -= len(seats)
        showtime.save(update_fields=['seats_available'])
        if paid is not None:
            Payment.objects.create(booking=booking, amount=Decimal(paid), status='SUCCESS')
        return booking


class BookingModelTest(BookingTestBase):
    def test_booking_creation(self):
        booking = Booking.objects.create(
            user=self.user, showtime=self.showtime, num_seats=2, status='PENDING')
        self.assertEqual(booking.num_seats, 2)
        self.assertEqual(booking.status, 'PENDING')

    def test_pending_booking_reads_as_expired_past_its_window(self):
        booking = self.book(status=Booking.PENDING)
        self.assertEqual(booking.effective_status(), Booking.PENDING)

        # Age it past the payment window without running any job.
        Booking.objects.filter(pk=booking.pk).update(
            created_at=timezone.now() - timedelta(minutes=PAYMENT_WINDOW_MINUTES + 1))
        booking.refresh_from_db()
        self.assertEqual(booking.effective_status(), Booking.EXPIRED)

    def test_confirmed_booking_reads_as_completed_after_the_show(self):
        past = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() - timedelta(hours=4),
            rows=5, seats_per_row=10, total_seats=50, seats_available=50)
        booking = self.book(showtime=past)
        self.assertEqual(booking.effective_status(), Booking.COMPLETED)

    def test_can_cancel_rules(self):
        self.assertTrue(self.book(seats=(1,)).can_cancel()[0])

        cancelled = self.book(seats=(2,), status=Booking.CANCELLED)
        self.assertFalse(cancelled.can_cancel()[0])

        past = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() - timedelta(hours=1),
            rows=5, seats_per_row=10, total_seats=50, seats_available=50)
        allowed, reason = self.book(seats=(3,), showtime=past).can_cancel()
        self.assertFalse(allowed)
        self.assertIn('already started', reason)


class CancellationTest(BookingTestBase):
    def test_cancelling_releases_the_seats(self):
        booking = self.book(seats=(5, 6, 7))
        self.showtime.refresh_from_db()
        self.assertEqual(self.showtime.seats_available, 97)

        cancel_booking(booking)

        self.showtime.refresh_from_db()
        booking.refresh_from_db()
        self.assertEqual(self.showtime.seats_available, 100)
        self.assertEqual(booking.status, Booking.CANCELLED)
        self.assertIsNotNone(booking.cancelled_at)

    def test_released_seats_can_be_booked_again(self):
        booking = self.book(seats=(5,))
        cancel_booking(booking)

        client = APIClient()
        client.force_authenticate(self.user)
        response = client.post('/api/bookings/',
                               {'showtime': self.showtime.id, 'seats': [5]}, format='json')
        self.assertEqual(response.status_code, 201)

    def test_full_refund_well_before_the_show(self):
        booking = self.book(paid='50.00')
        refund = cancel_booking(booking)
        self.assertEqual(refund['rate'], 1.0)
        self.assertEqual(refund['amount'], 50.0)

        payment = Payment.objects.get(booking=booking)
        self.assertEqual(payment.refund_status, Payment.REFUND_COMPLETE)
        self.assertEqual(payment.refund_amount, Decimal('50.00'))
        self.assertEqual(payment.net_amount, Decimal('0.00'))
        self.assertIsNotNone(payment.refunded_at)

    def test_partial_refund_close_to_the_show(self):
        soon = Showtime.objects.create(
            movie=self.movie,
            start_time=timezone.now() + timedelta(hours=FULL_REFUND_HOURS - 2),
            rows=5, seats_per_row=10, total_seats=50, seats_available=50)
        booking = self.book(paid='50.00', showtime=soon)

        refund = cancel_booking(booking)
        self.assertEqual(refund['rate'], 0.5)
        self.assertEqual(refund['amount'], 25.0)

    def test_unpaid_cancellation_refunds_nothing(self):
        refund = cancel_booking(self.book())
        self.assertFalse(refund['eligible'])
        self.assertEqual(refund['amount'], 0.0)

    def test_double_cancel_is_rejected_and_seats_are_not_double_released(self):
        booking = self.book(seats=(5, 6))
        cancel_booking(booking)
        with self.assertRaises(ValueError):
            cancel_booking(booking)

        self.showtime.refresh_from_db()
        self.assertEqual(self.showtime.seats_available, 100)

    def test_refund_preview_does_not_change_anything(self):
        booking = self.book(paid='40.00')
        preview = refund_preview(booking)
        self.assertEqual(preview, {'eligible': True, 'rate': 1.0, 'amount': 40.0})

        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.CONFIRMED)
        self.assertEqual(Payment.objects.get(booking=booking).refund_status,
                         Payment.REFUND_NONE)

    def test_no_refund_is_quoted_for_a_booking_that_cannot_be_cancelled(self):
        """A played show must not advertise money the user can't claim."""
        past = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() - timedelta(hours=1),
            rows=5, seats_per_row=10, total_seats=50, seats_available=50)
        booking = self.book(paid='40.00', showtime=past)
        self.assertEqual(refund_preview(booking),
                         {'eligible': False, 'rate': 0.0, 'amount': 0.0})


class CancellationAPITest(BookingTestBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_cancel_endpoint_returns_the_refund_and_frees_seats(self):
        booking = self.book(seats=(5, 6), paid='24.00')
        response = self.client.post(f'/api/bookings/{booking.id}/cancel/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['refund']['amount'], 24.0)
        self.assertEqual(response.data['booking']['status'], 'CANCELLED')
        self.assertEqual(response.data['booking']['status_display'], 'Cancelled')

        self.showtime.refresh_from_db()
        self.assertEqual(self.showtime.seats_available, 100)

    def test_refund_quote_previews_without_cancelling(self):
        booking = self.book(paid='30.00')
        response = self.client.get(f'/api/bookings/{booking.id}/refund_quote/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['can_cancel'])
        self.assertEqual(response.data['refund']['amount'], 30.0)

        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.CONFIRMED)

    def test_cancelling_a_played_show_is_refused(self):
        past = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() - timedelta(hours=1),
            rows=5, seats_per_row=10, total_seats=50, seats_available=50)
        booking = self.book(showtime=past)

        response = self.client.post(f'/api/bookings/{booking.id}/cancel/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('already started', response.data['detail'])

    def test_another_user_cannot_cancel_someone_elses_booking(self):
        booking = self.book()
        other = get_user_model().objects.create_user(
            username='mallory', password='pass123', role='USER')
        self.client.force_authenticate(other)

        self.assertEqual(self.client.post(f'/api/bookings/{booking.id}/cancel/').status_code, 404)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.CONFIRMED)

    def test_legacy_patch_still_refunds(self):
        """The dashboard used to cancel via PATCH; it must not skip the refund."""
        booking = self.book(paid='20.00')
        response = self.client.patch(f'/api/bookings/{booking.id}/',
                                     {'status': 'CANCELLED'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Payment.objects.get(booking=booking).refund_amount, Decimal('20.00'))

    def test_booking_payload_carries_status_labels_and_seat_labels(self):
        self.book(seats=(1, 12))
        response = self.client.get('/api/bookings/')
        payload = response.data[0] if isinstance(response.data, list) else response.data['results'][0]

        self.assertEqual(payload['status_display'], 'Confirmed')
        self.assertEqual(payload['seat_labels'], ['A1', 'B2'])
        self.assertTrue(payload['can_cancel'])

    def test_booking_payload_separates_order_value_from_net_spend(self):
        """The dashboard totals read these — a refund must stop counting as spend."""
        booking = self.book(seats=(1, 2), paid='24.00')
        payload = self.first_booking()
        self.assertEqual(payload['amount'], 24.0)
        self.assertEqual(payload['amount_paid'], 24.0)

        self.client.post(f'/api/bookings/{booking.id}/cancel/')
        payload = self.first_booking()
        self.assertEqual(payload['amount'], 24.0)      # still a $24 order
        self.assertEqual(payload['amount_paid'], 0.0)  # but nothing was kept

    def test_unpaid_booking_falls_back_to_the_ticket_price(self):
        self.showtime.price = Decimal('12.50')
        self.showtime.save(update_fields=['price'])
        self.book(seats=(3, 4), status=Booking.PENDING)

        payload = self.first_booking()
        self.assertEqual(payload['amount'], 25.0)
        self.assertEqual(payload['amount_paid'], 0.0)

    def first_booking(self):
        data = self.client.get('/api/bookings/').data
        return data[0] if isinstance(data, list) else data['results'][0]


class BookingImmutabilityTest(BookingTestBase):
    """A booking is settled once made: only cancellation may change it.

    `perform_create` is the only code path that checks seat availability and
    decrements `seats_available`. Anything that edits a booking afterwards
    sidesteps both checks, so all of it is refused.
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_patching_seats_cannot_move_a_booking_onto_taken_seats(self):
        mine = self.book(seats=(1,))
        get_user_model().objects.create_user(
            username='other', password='pass123', role='USER')
        theirs = Booking.objects.create(
            user=get_user_model().objects.get(username='other'),
            showtime=self.showtime, num_seats=1, seats=[9],
            status=Booking.CONFIRMED)

        response = self.client.patch(f'/api/bookings/{mine.id}/',
                                     {'seats': [9]}, format='json')

        self.assertEqual(response.status_code, 405)
        mine.refresh_from_db()
        self.assertEqual(mine.seats, [1])
        self.assertEqual(Booking.objects.get(pk=theirs.pk).seats, [9])

    def test_patching_seats_cannot_grow_a_booking_for_free(self):
        booking = self.book(seats=(1,))
        self.showtime.refresh_from_db()
        before = self.showtime.seats_available

        self.client.patch(f'/api/bookings/{booking.id}/',
                          {'seats': [1, 2, 3, 4, 5], 'num_seats': 5}, format='json')

        booking.refresh_from_db()
        self.showtime.refresh_from_db()
        self.assertEqual(booking.seats, [1])
        self.assertEqual(booking.num_seats, 1)
        self.assertEqual(self.showtime.seats_available, before)

    def test_patching_the_showtime_is_refused(self):
        """Otherwise a ticket bought for a quiet show walks into a sold-out one."""
        booking = self.book(seats=(1,))
        other_show = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() + timedelta(days=5),
            rows=5, seats_per_row=10, total_seats=50, seats_available=50)

        self.client.patch(f'/api/bookings/{booking.id}/',
                          {'showtime': other_show.id}, format='json')

        booking.refresh_from_db()
        self.assertEqual(booking.showtime_id, self.showtime.id)

    def test_put_is_refused_too(self):
        booking = self.book(seats=(1,))
        response = self.client.put(
            f'/api/bookings/{booking.id}/',
            {'showtime': self.showtime.id, 'seats': [7, 8]}, format='json')

        self.assertEqual(response.status_code, 405)
        booking.refresh_from_db()
        self.assertEqual(booking.seats, [1])

    def test_delete_is_refused_so_seats_are_never_orphaned(self):
        booking = self.book(seats=(1, 2), paid='24.00')
        self.showtime.refresh_from_db()
        before = self.showtime.seats_available

        response = self.client.delete(f'/api/bookings/{booking.id}/')

        self.assertEqual(response.status_code, 405)
        self.assertTrue(Booking.objects.filter(pk=booking.pk).exists())
        self.showtime.refresh_from_db()
        self.assertEqual(self.showtime.seats_available, before)

    def test_cancelling_by_patch_is_still_allowed(self):
        booking = self.book(seats=(1,))
        response = self.client.patch(f'/api/bookings/{booking.id}/',
                                     {'status': 'CANCELLED'}, format='json')
        self.assertEqual(response.status_code, 200)


class OverbookingTest(BookingTestBase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def post(self, seats, showtime=None):
        return self.client.post(
            '/api/bookings/',
            {'showtime': (showtime or self.showtime).id, 'seats': seats},
            format='json')

    def test_a_seat_cannot_be_booked_twice(self):
        self.assertEqual(self.post([4, 5]).status_code, 201)

        response = self.post([5, 6])
        self.assertEqual(response.status_code, 400)
        self.assertIn('already booked', response.data['detail'])

        # And nothing partial happened: seat 6 is still free.
        self.assertEqual(self.post([6]).status_code, 201)

    def test_repeating_a_seat_within_one_request_charges_once(self):
        response = self.post([3, 3, 3])
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['seats'], [3])
        self.assertEqual(response.data['num_seats'], 1)

        self.showtime.refresh_from_db()
        self.assertEqual(self.showtime.seats_available, 99)

    def test_seats_outside_the_house_are_refused(self):
        response = self.post([101])
        self.assertEqual(response.status_code, 400)
        self.assertIn('Invalid seat number', response.data['detail'])

    def test_zero_and_negative_seat_numbers_are_refused(self):
        for seats in ([0], [-1]):
            with self.subTest(seats=seats):
                self.assertEqual(self.post(seats).status_code, 400)

    def test_an_empty_seat_list_is_refused(self):
        response = self.post([])
        self.assertEqual(response.status_code, 400)

    def test_a_full_show_cannot_be_oversold(self):
        small = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() + timedelta(days=2),
            rows=1, seats_per_row=2, total_seats=2, seats_available=2)

        self.assertEqual(self.post([1, 2], showtime=small).status_code, 201)
        small.refresh_from_db()
        self.assertEqual(small.seats_available, 0)

        self.assertEqual(self.post([1], showtime=small).status_code, 400)
        self.assertEqual(self.post([3], showtime=small).status_code, 400)
        small.refresh_from_db()
        self.assertEqual(small.seats_available, 0)

    def test_a_cancelled_booking_does_not_keep_holding_its_seats(self):
        self.assertEqual(self.post([1]).status_code, 201)
        cancel_booking(Booking.objects.get(seats=[1]))
        self.assertEqual(self.post([1]).status_code, 201)


class SweepTest(BookingTestBase):
    def test_stale_pending_booking_expires_and_hands_back_its_seats(self):
        booking = self.book(seats=(1, 2, 3), status=Booking.PENDING)
        Booking.objects.filter(pk=booking.pk).update(
            created_at=timezone.now() - timedelta(minutes=PAYMENT_WINDOW_MINUTES + 1))

        result = sweep_stale_bookings()

        booking.refresh_from_db()
        self.showtime.refresh_from_db()
        self.assertEqual(result['expired'], 1)
        self.assertEqual(booking.status, Booking.EXPIRED)
        self.assertEqual(self.showtime.seats_available, 100)

    def test_fresh_pending_booking_keeps_its_seats(self):
        booking = self.book(seats=(1,), status=Booking.PENDING)
        sweep_stale_bookings()

        booking.refresh_from_db()
        self.showtime.refresh_from_db()
        self.assertEqual(booking.status, Booking.PENDING)
        self.assertEqual(self.showtime.seats_available, 99)

    def test_played_show_completes_without_releasing_seats(self):
        past = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() - timedelta(hours=2),
            rows=5, seats_per_row=10, total_seats=50, seats_available=50)
        booking = self.book(seats=(1, 2), showtime=past)

        result = sweep_stale_bookings()

        booking.refresh_from_db()
        past.refresh_from_db()
        self.assertEqual(result['completed'], 1)
        self.assertEqual(booking.status, Booking.COMPLETED)
        # The show was watched, not given up — the seats stay sold.
        self.assertEqual(past.seats_available, 48)

    def test_expired_seats_are_bookable_again(self):
        booking = self.book(seats=(7,), status=Booking.PENDING)
        Booking.objects.filter(pk=booking.pk).update(
            created_at=timezone.now() - timedelta(minutes=PAYMENT_WINDOW_MINUTES + 1))

        client = APIClient()
        client.force_authenticate(self.user)
        # perform_create sweeps first, so seat 7 is free by the time it checks.
        response = client.post('/api/bookings/',
                               {'showtime': self.showtime.id, 'seats': [7]}, format='json')
        self.assertEqual(response.status_code, 201)


class TicketVerificationTests(BookingTestBase):
    """The gate scanner: what gets someone through the door, and what doesn't."""

    def setUp(self):
        super().setUp()
        self.admin = get_user_model().objects.create_user(
            username='usher', password='pass123', role='ADMIN')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def at_the_door(self, booking, minutes_after_start=5):
        """Move the show so `now` sits inside the check-in window."""
        booking.showtime.start_time = timezone.now() - timedelta(minutes=minutes_after_start)
        booking.showtime.save()
        booking.refresh_from_db()
        return booking

    def scan(self, reference):
        return self.client.post('/api/bookings/verify/',
                                {'reference': reference}, format='json')

    # --- the reference itself ------------------------------------------

    def test_every_booking_gets_a_unique_reference(self):
        first = self.book(seats=(1, 2))
        second = self.book(seats=(3, 4))

        self.assertTrue(first.reference.startswith('BK'))
        self.assertEqual(len(first.reference), 12)
        self.assertNotEqual(first.reference, second.reference)
        # The whole point of not using the pk: nothing about the code should
        # follow from the row before it.
        self.assertNotIn(str(first.pk), first.reference)

    def test_reference_is_not_overwritten_on_later_saves(self):
        booking = self.book()
        original = booking.reference

        booking.status = Booking.CANCELLED
        booking.save()

        booking.refresh_from_db()
        self.assertEqual(booking.reference, original)

    def test_reference_is_exposed_on_the_booking_detail(self):
        booking = self.book()
        client = APIClient()
        client.force_authenticate(self.user)

        response = client.get(f'/api/bookings/{booking.pk}/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['reference'], booking.reference)

    # --- the happy path and the one that matters ------------------------

    def test_valid_ticket_is_admitted_and_stamped(self):
        booking = self.at_the_door(self.book())

        response = self.scan(booking.reference)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['valid'])
        self.assertEqual(response.data['code'], 'VALID')
        self.assertEqual(response.data['booking']['reference'], booking.reference)

        booking.refresh_from_db()
        self.assertIsNotNone(booking.checked_in_at)
        self.assertEqual(booking.checked_in_by, self.admin)

    def test_the_same_ticket_cannot_be_used_twice(self):
        """A screenshot forwarded to three friends must only work once."""
        booking = self.at_the_door(self.book())

        self.assertTrue(self.scan(booking.reference).data['valid'])
        second = self.scan(booking.reference)

        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data['valid'])
        self.assertEqual(second.data['code'], 'ALREADY_USED')
        # It names who let them in, so a dispute at the door has an answer.
        self.assertIn('usher', second.data['message'])

    def test_the_qr_payload_prefix_is_accepted(self):
        booking = self.at_the_door(self.book())

        response = self.scan(f'BOOKING:{booking.reference}')

        self.assertTrue(response.data['valid'])

    # --- the time window ------------------------------------------------

    def test_arriving_after_the_film_started_still_works(self):
        """The grace window. If anyone later 'tidies' the check up to
        `status == CONFIRMED`, this is the test that catches it: the status
        reads COMPLETED the instant the show begins."""
        booking = self.at_the_door(self.book(), minutes_after_start=10)
        self.assertEqual(booking.effective_status(), Booking.COMPLETED)

        response = self.scan(booking.reference)

        self.assertTrue(response.data['valid'])

    def test_too_early_is_refused(self):
        # Default fixture showtime is three days out.
        booking = self.book()

        response = self.scan(booking.reference)

        self.assertFalse(response.data['valid'])
        self.assertEqual(response.data['code'], 'TOO_EARLY')

    def test_after_the_show_has_ended_is_refused(self):
        booking = self.book()
        # Past the runtime and the turnover buffer both.
        booking.showtime.start_time = timezone.now() - timedelta(hours=6)
        booking.showtime.save()

        response = self.scan(booking.reference)

        self.assertFalse(response.data['valid'])
        self.assertEqual(response.data['code'], 'SHOW_ENDED')

    # --- the rejections -------------------------------------------------

    def test_unknown_code_is_refused(self):
        response = self.scan('BKZZZZZZZZZZ')

        self.assertFalse(response.data['valid'])
        self.assertEqual(response.data['code'], 'NOT_FOUND')
        self.assertIsNone(response.data['booking'])

    def test_cancelled_booking_is_refused(self):
        booking = self.at_the_door(self.book())
        Booking.objects.filter(pk=booking.pk).update(status=Booking.CANCELLED)

        response = self.scan(booking.reference)

        self.assertFalse(response.data['valid'])
        self.assertEqual(response.data['code'], 'CANCELLED')

    def test_unpaid_booking_is_refused(self):
        booking = self.at_the_door(self.book(status=Booking.PENDING))

        response = self.scan(booking.reference)

        self.assertFalse(response.data['valid'])
        self.assertEqual(response.data['code'], 'UNPAID')

    def test_a_refused_scan_does_not_burn_the_ticket(self):
        """Someone turned away at 6pm for being early must still get in at 7."""
        booking = self.book()  # three days out, so TOO_EARLY

        self.assertEqual(self.scan(booking.reference).data['code'], 'TOO_EARLY')

        booking.refresh_from_db()
        self.assertIsNone(booking.checked_in_at)

        self.at_the_door(booking)
        self.assertTrue(self.scan(booking.reference).data['valid'])

    # --- who may scan ---------------------------------------------------

    def test_a_regular_user_cannot_verify_tickets(self):
        booking = self.at_the_door(self.book())
        client = APIClient()
        client.force_authenticate(self.user)  # the booking's own owner

        response = client.post('/api/bookings/verify/',
                               {'reference': booking.reference}, format='json')

        self.assertEqual(response.status_code, 403)
        booking.refresh_from_db()
        self.assertIsNone(booking.checked_in_at)

    def test_anonymous_cannot_verify_tickets(self):
        booking = self.at_the_door(self.book())

        response = APIClient().post('/api/bookings/verify/',
                                    {'reference': booking.reference}, format='json')

        self.assertEqual(response.status_code, 401)


class TicketStaffRoleTests(BookingTestBase):
    """ROLE_STAFF: may scan a ticket and browse the catalogue. Nothing else.

    The role exists to be *narrow*, so most of what follows asserts a refusal.
    Every admin endpoint in the project gates on the single `is_admin`
    property, and these lock in that a staff account never satisfies it.
    """

    def setUp(self):
        super().setUp()
        self.staff = get_user_model().objects.create_user(
            username='usher', password='pass123', role='STAFF')
        self.client = APIClient()
        self.client.force_authenticate(self.staff)

    # --- the one thing they can do --------------------------------------

    def test_staff_can_verify_a_ticket(self):
        booking = self.book()
        booking.showtime.start_time = timezone.now() - timedelta(minutes=5)
        booking.showtime.save()

        response = self.client.post('/api/bookings/verify/',
                                    {'reference': booking.reference}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['valid'])
        booking.refresh_from_db()
        self.assertEqual(booking.checked_in_by, self.staff)

    def test_staff_can_browse_the_catalogue(self):
        """No new code needed — the movie viewset is read-open to everyone.

        Asserted anyway because "available movies" is half of what the role was
        asked for, and tightening the catalogue later must not break the door.
        """
        self.assertEqual(self.client.get('/api/movies/').status_code, 200)
        self.assertEqual(
            self.client.get(f'/api/movies/{self.movie.slug}/').status_code, 200)

    def test_staff_can_read_their_own_profile(self):
        response = self.client.get('/api/accounts/profile/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'STAFF')

    # --- everything they cannot ------------------------------------------

    def test_staff_cannot_create_a_booking(self):
        response = self.client.post(
            '/api/bookings/',
            {'showtime': self.showtime.id, 'seats': [5, 6]}, format='json')

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Booking.objects.filter(user=self.staff).exists())
        # And the refusal happened before any seat accounting.
        self.showtime.refresh_from_db()
        self.assertEqual(self.showtime.seats_available, 100)

    def test_staff_cannot_pay_for_a_booking(self):
        booking = self.book(status=Booking.PENDING)

        response = self.client.post('/api/payments/mock/',
                                    {'booking_id': booking.id}, format='json')

        self.assertEqual(response.status_code, 403)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.PENDING)

    def test_staff_see_no_bookings_but_their_own_nonexistent_ones(self):
        """The list is scoped by user for anyone who isn't an admin. A staff
        account owns nothing, so a scan tells them about one ticket at a time
        and the list tells them nothing at all."""
        self.book(seats=(7, 8))

        response = self.client.get('/api/bookings/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 0)

    def test_staff_cannot_read_the_analytics_dashboard(self):
        self.assertEqual(
            self.client.get('/api/analytics/dashboard/').status_code, 403)

    def test_staff_cannot_edit_the_catalogue(self):
        response = self.client.post('/api/movies/', {
            'title': 'Ghost Screening', 'genre': 'Horror', 'director': 'D',
            'cast': 'C', 'description': '',
        }, format='json')

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Movie.objects.filter(title='Ghost Screening').exists())

    def test_staff_cannot_retire_a_movie(self):
        response = self.client.delete(f'/api/movies/{self.movie.slug}/')

        self.assertEqual(response.status_code, 403)
        self.movie.refresh_from_db()
        self.assertTrue(self.movie.is_active)

    def test_staff_cannot_cancel_someone_elses_booking(self):
        """404, not 403 — `get_queryset` scopes the detail route by owner, so
        the booking isn't hidden behind a permission, it simply isn't theirs."""
        booking = self.book()

        response = self.client.post(f'/api/bookings/{booking.id}/cancel/')

        self.assertEqual(response.status_code, 404)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.CONFIRMED)


class BookingReviewFieldsTests(BookingTestBase):
    """The dashboard drives its "Rate this movie" prompt off fields on the
    booking payload, so the listing has to report reviewability per booking."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _played_booking(self, seats=(1, 2)):
        """A CONFIRMED booking whose show already started — reads as COMPLETED."""
        past = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() - timedelta(hours=3),
            rows=10, seats_per_row=10, total_seats=100, seats_available=100)
        return self.book(seats=seats, showtime=past)

    def _get(self, booking):
        response = self.client.get('/api/bookings/')
        data = response.data if isinstance(response.data, list) \
            else response.data.get('results', response.data)
        return next(b for b in data if b['id'] == booking.id)

    def test_played_booking_can_be_reviewed(self):
        row = self._get(self._played_booking())
        self.assertTrue(row['can_review'])
        self.assertIsNone(row['review'])
        # The movie identifiers the review modal needs to build its URL.
        self.assertEqual(row['movie'], self.movie.id)
        self.assertEqual(row['movie_slug'], self.movie.slug)

    def test_upcoming_booking_cannot_be_reviewed_yet(self):
        row = self._get(self.book())  # default showtime is 3 days out
        self.assertFalse(row['can_review'])

    def test_reviewed_booking_reports_its_review_and_stops_offering(self):
        booking = self._played_booking()
        review = Review.objects.create(
            user=self.user, movie=self.movie, booking=booking,
            rating=4, title='Solid', comment='Enjoyed it.')

        row = self._get(booking)

        self.assertFalse(row['can_review'])
        self.assertEqual(row['review']['id'], review.id)
        self.assertEqual(row['review']['rating'], 4)
