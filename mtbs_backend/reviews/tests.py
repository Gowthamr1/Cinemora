"""Reviews: the verified-ticket gate, one-per-booking, and helpful votes."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from movies.models import Movie
from showtimes.models import Showtime
from .models import HelpfulVote, Review


class ReviewTestBase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='viewer', password='pass123', role='USER')
        self.other = get_user_model().objects.create_user(
            username='someone', password='pass123', role='USER')
        self.movie = Movie.objects.create(
            title='Dune', genre='Sci-Fi', director='Villeneuve',
            cast='Chalamet', description='Sand.', duration_minutes=155)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def showtime(self, when=None):
        return Showtime.objects.create(
            movie=self.movie,
            start_time=when or (timezone.now() + timedelta(days=2)),
            rows=10, seats_per_row=10, total_seats=100, seats_available=100)

    def seen_booking(self, user=None, seats=(1, 2)):
        """A CONFIRMED booking whose show has already started.

        That combination is what `effective_status()` reports as COMPLETED, and
        it's the only state that earns the right to review.
        """
        showtime = self.showtime(when=timezone.now() - timedelta(hours=3))
        return Booking.objects.create(
            user=user or self.user, showtime=showtime, num_seats=len(seats),
            seats=list(seats), status=Booking.CONFIRMED)

    def promoted_booking(self, user=None, seats=(3, 4)):
        """A booking already stored as COMPLETED.

        The other route to a watched show: the gate or a sweep writes COMPLETED
        to the row rather than leaving it CONFIRMED for `effective_status()` to
        reinterpret. Most real bookings end up here, so anything that reads
        "has this been seen" has to handle it.
        """
        showtime = self.showtime(when=timezone.now() - timedelta(hours=3))
        return Booking.objects.create(
            user=user or self.user, showtime=showtime, num_seats=len(seats),
            seats=list(seats), status=Booking.COMPLETED)

    def post_review(self, booking, **overrides):
        payload = {
            'movie': self.movie.id,
            'booking': booking.id if booking else None,
            'rating': 5,
            'title': 'Amazing experience',
            'comment': 'Loved every minute of it.',
            **overrides,
        }
        return self.client.post(
            f'/api/movies/{self.movie.slug}/reviews/', payload, format='json')


class ReviewGateTests(ReviewTestBase):
    """Only someone who actually watched the film may review it."""

    def test_a_ticket_holder_can_review_after_the_show(self):
        response = self.post_review(self.seen_booking())

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['is_verified'])
        review = Review.objects.get()
        self.assertEqual(review.user, self.user)
        self.assertEqual(review.rating, 5)

    def test_a_review_without_a_booking_is_refused(self):
        """The whole anti-fake-review premise. No ticket, no opinion on record."""
        response = self.post_review(None)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Review.objects.exists())

    def test_someone_elses_booking_does_not_earn_a_review(self):
        """Otherwise a forwarded booking id is all a fake review needs."""
        response = self.post_review(self.seen_booking(user=self.other))

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Review.objects.exists())

    def test_a_booking_for_a_different_movie_is_refused(self):
        other_movie = Movie.objects.create(
            title='Arrival', genre='Sci-Fi', director='Villeneuve',
            cast='Adams', description='Heptapods.', duration_minutes=116)
        elsewhere = Showtime.objects.create(
            movie=other_movie, start_time=timezone.now() - timedelta(hours=3),
            rows=5, seats_per_row=5, total_seats=25, seats_available=25)
        booking = Booking.objects.create(
            user=self.user, showtime=elsewhere, num_seats=1, seats=[1],
            status=Booking.CONFIRMED)

        response = self.post_review(booking)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Review.objects.exists())

    def test_you_cannot_review_a_show_that_has_not_happened_yet(self):
        upcoming = Booking.objects.create(
            user=self.user, showtime=self.showtime(), num_seats=1, seats=[1],
            status=Booking.CONFIRMED)

        response = self.post_review(upcoming)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Review.objects.exists())

    def test_a_cancelled_booking_does_not_earn_a_review(self):
        booking = self.seen_booking()
        booking.status = Booking.CANCELLED
        booking.save(update_fields=['status'])

        response = self.post_review(booking)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Review.objects.exists())

    def test_an_unpaid_booking_does_not_earn_a_review(self):
        booking = self.seen_booking()
        booking.status = Booking.PENDING
        booking.save(update_fields=['status'])

        response = self.post_review(booking)

        self.assertEqual(response.status_code, 400)

    def test_anonymous_cannot_review(self):
        booking = self.seen_booking()
        response = APIClient().post(
            f'/api/movies/{self.movie.slug}/reviews/',
            {'movie': self.movie.id, 'booking': booking.id, 'rating': 5,
             'title': 'x', 'comment': 'y'}, format='json')

        self.assertEqual(response.status_code, 401)

    def test_anyone_may_read_reviews(self):
        self.post_review(self.seen_booking())

        response = APIClient().get(f'/api/movies/{self.movie.slug}/reviews/')

        self.assertEqual(response.status_code, 200)


class OneReviewPerBookingTests(ReviewTestBase):
    """Seeing a film twice earns two reviews. One ticket never earns two."""

    def test_the_same_booking_cannot_be_reviewed_twice(self):
        booking = self.seen_booking()
        self.assertEqual(self.post_review(booking).status_code, 201)

        second = self.post_review(booking, rating=1, title='Changed my mind')

        self.assertEqual(second.status_code, 400)
        self.assertEqual(Review.objects.count(), 1)

    def test_a_second_showing_earns_a_second_review(self):
        self.assertEqual(self.post_review(self.seen_booking()).status_code, 201)

        again = self.seen_booking(seats=(5, 6))
        self.assertEqual(self.post_review(again).status_code, 201)

        self.assertEqual(Review.objects.count(), 2)

    def test_reviewable_lists_only_unreviewed_completed_bookings(self):
        reviewed = self.seen_booking()
        self.post_review(reviewed)
        pending_review = self.seen_booking(seats=(7, 8))
        # An upcoming show is not reviewable yet.
        Booking.objects.create(
            user=self.user, showtime=self.showtime(), num_seats=1, seats=[9],
            status=Booking.CONFIRMED)

        response = self.client.get(
            f'/api/movies/{self.movie.slug}/reviews/reviewable/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['can_review'])
        self.assertEqual([b['id'] for b in response.data['bookings']],
                         [pending_review.id])

    def test_reviewable_includes_bookings_already_stored_as_completed(self):
        """The common case: the row says COMPLETED rather than CONFIRMED.

        Filtering the candidates on CONFIRMED alone drops these in SQL before
        the effective-status check can see them, which hides the review button
        from nearly everyone who has actually watched something.
        """
        promoted = self.promoted_booking()

        response = self.client.get(
            f'/api/movies/{self.movie.slug}/reviews/reviewable/')

        self.assertTrue(response.data['can_review'])
        self.assertEqual([b['id'] for b in response.data['bookings']],
                         [promoted.id])

    def test_a_booking_stored_as_completed_can_be_reviewed(self):
        self.assertEqual(self.post_review(self.promoted_booking()).status_code, 201)

    def test_reviewable_is_false_with_nothing_left_to_review(self):
        self.post_review(self.seen_booking())

        response = self.client.get(
            f'/api/movies/{self.movie.slug}/reviews/reviewable/')

        self.assertFalse(response.data['can_review'])
        self.assertEqual(response.data['bookings'], [])


class ReviewOwnershipTests(ReviewTestBase):
    def setUp(self):
        super().setUp()
        self.post_review(self.seen_booking())
        self.review = Review.objects.get()

    def test_the_author_may_edit_their_review(self):
        response = self.client.patch(
            f'/api/movies/{self.movie.slug}/reviews/{self.review.id}/',
            {'rating': 3, 'comment': 'On reflection, it dragged.'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.review.refresh_from_db()
        self.assertEqual(self.review.rating, 3)

    def test_someone_else_cannot_edit_it(self):
        self.client.force_authenticate(self.other)

        response = self.client.patch(
            f'/api/movies/{self.movie.slug}/reviews/{self.review.id}/',
            {'rating': 1}, format='json')

        self.assertEqual(response.status_code, 400)
        self.review.refresh_from_db()
        self.assertEqual(self.review.rating, 5)

    def test_someone_else_cannot_delete_it(self):
        self.client.force_authenticate(self.other)

        response = self.client.delete(
            f'/api/movies/{self.movie.slug}/reviews/{self.review.id}/')

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Review.objects.filter(pk=self.review.pk).exists())

    def test_the_author_may_delete_it(self):
        response = self.client.delete(
            f'/api/movies/{self.movie.slug}/reviews/{self.review.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Review.objects.exists())


class HelpfulVoteTests(ReviewTestBase):
    def setUp(self):
        super().setUp()
        self.post_review(self.seen_booking())
        self.review = Review.objects.get()
        self.client.force_authenticate(self.other)

    def url(self, suffix):
        return f'/api/movies/{self.movie.slug}/reviews/{self.review.id}/{suffix}/'

    def test_a_vote_increments_the_counter(self):
        response = self.client.post(self.url('helpful'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['helpful_count'], 1)
        self.assertTrue(response.data['user_has_voted_helpful'])

    def test_voting_twice_counts_once(self):
        """Refreshing the page must not inflate the count."""
        self.client.post(self.url('helpful'))
        response = self.client.post(self.url('helpful'))

        self.assertEqual(response.data['helpful_count'], 1)
        self.assertEqual(HelpfulVote.objects.count(), 1)

    def test_a_vote_can_be_withdrawn(self):
        self.client.post(self.url('helpful'))

        response = self.client.post(self.url('unhelpful'))

        self.assertEqual(response.data['helpful_count'], 0)
        self.assertFalse(response.data['user_has_voted_helpful'])

    def test_withdrawing_a_vote_never_cast_is_harmless(self):
        """No negative counts — PositiveIntegerField would raise on save."""
        response = self.client.post(self.url('unhelpful'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['helpful_count'], 0)

    def test_you_cannot_vote_your_own_review_helpful(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(self.url('helpful'))

        self.assertEqual(response.status_code, 400)
        self.review.refresh_from_db()
        self.assertEqual(self.review.helpful_count, 0)


class ReviewStatsTests(ReviewTestBase):
    """The distribution bars on the Reviews tab."""

    def review_with(self, rating, seats):
        booking = self.seen_booking(seats=seats)
        Review.objects.create(
            user=self.user, movie=self.movie, booking=booking, rating=rating,
            title='t', comment='c')

    def test_stats_for_a_movie_with_no_reviews(self):
        response = self.client.get(f'/api/movies/{self.movie.slug}/reviews/stats/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_reviews'], 0)
        self.assertEqual(response.data['average_rating'], '0.00')
        # Every star present, so the frontend never has to guess a missing key.
        self.assertEqual(set(response.data['rating_distribution']),
                         {'1', '2', '3', '4', '5'})

    def test_average_and_distribution(self):
        self.review_with(5, (1, 2))
        self.review_with(5, (3, 4))
        self.review_with(2, (5, 6))

        response = self.client.get(f'/api/movies/{self.movie.slug}/reviews/stats/')

        self.assertEqual(response.data['total_reviews'], 3)
        self.assertEqual(response.data['average_rating'], '4.00')
        self.assertEqual(response.data['rating_distribution']['5'], 2)
        self.assertEqual(response.data['rating_distribution']['2'], 1)
        self.assertEqual(response.data['rating_distribution']['3'], 0)

    def test_stats_for_an_unknown_movie(self):
        response = self.client.get('/api/movies/no-such-film/reviews/stats/')
        self.assertEqual(response.status_code, 404)


class ReviewSortTests(ReviewTestBase):
    def setUp(self):
        super().setUp()
        for rating, seats in ((2, (1, 2)), (5, (3, 4)), (3, (5, 6))):
            booking = self.seen_booking(seats=seats)
            review = Review.objects.create(
                user=self.user, movie=self.movie, booking=booking,
                rating=rating, title=f'{rating} stars', comment='c')
            if rating == 3:
                Review.objects.filter(pk=review.pk).update(helpful_count=99)

    def ratings(self, sort):
        response = self.client.get(
            f'/api/movies/{self.movie.slug}/reviews/?sort={sort}')
        return [r['rating'] for r in response.data['results']]

    def test_highest_rated_first(self):
        self.assertEqual(self.ratings('highest'), [5, 3, 2])

    def test_lowest_rated_first(self):
        self.assertEqual(self.ratings('lowest'), [2, 3, 5])

    def test_most_helpful_first(self):
        self.assertEqual(self.ratings('helpful')[0], 3)

    def test_newest_is_the_default(self):
        self.assertEqual(self.ratings('newest'), [3, 5, 2])


class ReviewScopingTests(ReviewTestBase):
    def test_the_list_only_shows_reviews_for_that_movie(self):
        self.post_review(self.seen_booking())

        other_movie = Movie.objects.create(
            title='Sicario', genre='Thriller', director='Villeneuve',
            cast='Blunt', description='Border.', duration_minutes=121)

        response = self.client.get(f'/api/movies/{other_movie.slug}/reviews/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 0)

    def test_spoiler_flag_round_trips(self):
        response = self.post_review(self.seen_booking(), contains_spoiler=True)

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['contains_spoiler'])
