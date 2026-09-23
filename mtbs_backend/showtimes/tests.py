"""Scheduling rules: overlap rejection and the generated seat layout."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from movies.models import Movie
from theatres.models import Theatre
from .models import CLEANUP_BUFFER_MINUTES, Showtime, seat_label


def make_movie(title="Interstellar", minutes=120):
    return Movie.objects.create(
        title=title, genre="Sci-Fi", director="Nolan",
        cast="Cast", description="Desc", poster_url="", duration_minutes=minutes,
    )


class ShowtimeModelTest(TestCase):
    def setUp(self):
        self.movie = make_movie()

    def test_showtime_creation(self):
        showtime = Showtime.objects.create(
            movie=self.movie,
            start_time=timezone.now() + timedelta(days=1),
            total_seats=100,
            seats_available=100,
        )
        # rows x seats_per_row is the source of truth for capacity.
        self.assertEqual(showtime.total_seats, showtime.rows * showtime.seats_per_row)
        self.assertEqual(showtime.movie.title, "Interstellar")

    def test_layout_drives_total_seats(self):
        showtime = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() + timedelta(days=1),
            rows=12, seats_per_row=20, total_seats=0, seats_available=0,
        )
        self.assertEqual(showtime.total_seats, 240)

    def test_end_time_covers_runtime_plus_turnover(self):
        start = timezone.now() + timedelta(days=1)
        showtime = Showtime.objects.create(
            movie=self.movie, start_time=start, total_seats=10, seats_available=10)
        self.assertEqual(
            showtime.end_time, start + timedelta(minutes=120 + CLEANUP_BUFFER_MINUTES))

    def test_partial_save_still_refreshes_derived_fields(self):
        """Seat accounting saves with update_fields must not skip end_time."""
        showtime = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() + timedelta(days=1),
            rows=2, seats_per_row=5, total_seats=0, seats_available=0)
        showtime.start_time += timedelta(hours=2)
        showtime.seats_available = 3
        showtime.save(update_fields=['start_time', 'seats_available'])

        showtime.refresh_from_db()
        self.assertEqual(showtime.end_time, showtime.compute_end_time())

    def test_seat_labels_are_row_major(self):
        self.assertEqual(seat_label(1, 10), 'A1')
        self.assertEqual(seat_label(10, 10), 'A10')
        self.assertEqual(seat_label(11, 10), 'B1')
        self.assertEqual(seat_label(23, 10), 'C3')
        # No layout information -> fall back to the plain number.
        self.assertEqual(seat_label(23, 0), '23')


class ScheduleTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        admin = get_user_model().objects.create_user(
            username='admin1', password='pass123', role='ADMIN')
        self.client.force_authenticate(admin)

        self.theatre = Theatre.objects.create(name='PVR', city='Mumbai', total_screens=3)
        self.avengers = make_movie('Avengers', minutes=180)
        self.spiderman = make_movie('Spider-Man', minutes=150)

        self.ten_am = timezone.now().replace(
            hour=10, minute=0, second=0, microsecond=0) + timedelta(days=3)
        self.existing = Showtime.objects.create(
            movie=self.avengers, theatre=self.theatre, screen_number=1,
            start_time=self.ten_am, rows=5, seats_per_row=10,
            total_seats=50, seats_available=50,
        )

    def post(self, **overrides):
        payload = {
            'movie_id': self.spiderman.id,
            'theatre_id': self.theatre.id,
            'screen_number': 1,
            'start_time': (self.ten_am + timedelta(hours=2, minutes=30)).isoformat(),
            'rows': 5, 'seats_per_row': 10, 'price': '10.00',
        }
        payload.update(overrides)
        return self.client.post('/api/showtimes/', payload, format='json')


class ScheduleConflictTest(ScheduleTestBase):
    """Avengers 10:00-13:00 and Spider-Man 12:30-15:00 can't share a screen."""

    def test_overlapping_show_on_same_screen_is_rejected(self):
        response = self.post()
        self.assertEqual(response.status_code, 400)
        self.assertIn('Avengers', str(response.data['start_time']))
        self.assertEqual(Showtime.objects.count(), 1)

    def test_same_time_on_a_different_screen_is_allowed(self):
        self.assertEqual(self.post(screen_number=2).status_code, 201)

    def test_same_time_at_a_different_theatre_is_allowed(self):
        other = Theatre.objects.create(name='INOX', city='Pune')
        self.assertEqual(self.post(theatre_id=other.id).status_code, 201)

    def test_show_starting_after_the_previous_one_clears_is_allowed(self):
        # 10:00 + 180min runtime + 15min turnover = 13:15.
        clear = self.ten_am + timedelta(minutes=180 + CLEANUP_BUFFER_MINUTES)
        self.assertEqual(self.post(start_time=clear.isoformat()).status_code, 201)

    def test_show_starting_inside_the_turnover_gap_is_rejected(self):
        during_cleanup = self.ten_am + timedelta(minutes=180 + 5)
        self.assertEqual(self.post(start_time=during_cleanup.isoformat()).status_code, 400)

    def test_editing_a_show_does_not_clash_with_itself(self):
        response = self.client.patch(
            f'/api/showtimes/{self.existing.id}/', {'price': '15.00'}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_layout_cannot_shrink_below_a_booked_seat(self):
        from bookings.models import Booking
        user = get_user_model().objects.create_user(
            username='u2', password='pass123', role='USER')
        Booking.objects.create(user=user, showtime=self.existing, num_seats=1,
                               seats=[48], status=Booking.CONFIRMED)

        response = self.client.patch(
            f'/api/showtimes/{self.existing.id}/',
            {'rows': 2, 'seats_per_row': 10}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('48', str(response.data['rows']))

    def test_seat_layout_is_exposed_to_clients(self):
        response = self.client.get(f'/api/showtimes/{self.existing.id}/')
        self.assertEqual(response.data['seat_layout'],
                         {'rows': 5, 'seats_per_row': 10,
                          'row_labels': ['A', 'B', 'C', 'D', 'E']})


class ShowtimeValidationTest(ScheduleTestBase):
    """Inputs that would produce a show nobody can sit in."""

    def test_a_screen_the_theatre_does_not_have_is_rejected(self):
        response = self.post(screen_number=9)

        self.assertEqual(response.status_code, 400)
        self.assertIn('screen 9 does not exist', str(response.data['screen_number']))
        self.assertEqual(Showtime.objects.count(), 1)

    def test_a_negative_price_is_rejected(self):
        response = self.post(screen_number=2, price='-5.00')
        self.assertEqual(response.status_code, 400)
        self.assertIn('negative', str(response.data['price']))

    def test_an_absurd_price_is_rejected(self):
        response = self.post(screen_number=2, price='999999.00')
        self.assertEqual(response.status_code, 400)

    def test_zero_rows_are_rejected(self):
        response = self.post(screen_number=2, rows=0)
        self.assertEqual(response.status_code, 400)

    def test_too_many_rows_are_rejected(self):
        response = self.post(screen_number=2, rows=30)
        self.assertEqual(response.status_code, 400)

    def test_a_theatre_cannot_shrink_below_its_scheduled_screens(self):
        """`self.existing` sits on screen 1; screen 3 has a show too."""
        self.assertEqual(self.post(screen_number=3).status_code, 201)

        response = self.client.patch(f'/api/theatres/{self.theatre.id}/',
                                     {'total_screens': 2}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Screen 3', str(response.data['total_screens']))

    def test_a_theatre_needs_at_least_one_screen(self):
        response = self.client.patch(f'/api/theatres/{self.theatre.id}/',
                                     {'total_screens': 0}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_a_blank_theatre_name_is_rejected(self):
        response = self.client.post('/api/theatres/',
                                    {'name': '   ', 'city': 'Pune'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_an_absurd_movie_runtime_is_rejected(self):
        response = self.client.post('/api/movies/', {
            'title': 'Endless', 'genre': 'Drama', 'director': 'Someone',
            'cast': 'Cast', 'description': 'Desc', 'duration_minutes': 100000,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('duration_minutes', response.data)

    def test_a_blank_movie_title_is_rejected(self):
        response = self.client.post('/api/movies/', {
            'title': '   ', 'genre': 'Drama', 'director': 'Someone',
            'cast': 'Cast', 'description': 'Desc',
        }, format='json')
        self.assertEqual(response.status_code, 400)


class AdminOnlyWriteTest(TestCase):
    """Browsing is public; changing the catalogue is not."""

    def setUp(self):
        self.movie = make_movie()
        self.theatre = Theatre.objects.create(name='PVR', city='Mumbai')
        self.showtime = Showtime.objects.create(
            movie=self.movie, theatre=self.theatre,
            start_time=timezone.now() + timedelta(days=1),
            rows=5, seats_per_row=10, total_seats=50, seats_available=50)
        self.client = APIClient()

    def payload(self):
        return {'title': 'Sneaky', 'genre': 'Drama', 'director': 'Nobody',
                'cast': 'Cast', 'description': 'Desc'}

    def test_anyone_may_browse(self):
        for url in ('/api/movies/', '/api/showtimes/', '/api/theatres/'):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_anonymous_users_cannot_write(self):
        self.assertEqual(self.client.post('/api/movies/', self.payload()).status_code, 401)

    def test_a_regular_user_cannot_write(self):
        user = get_user_model().objects.create_user(
            username='joe', password='pass123', role='USER')
        self.client.force_authenticate(user)

        cases = [
            ('post', '/api/movies/', self.payload()),
            ('patch', f'/api/movies/{self.movie.id}/', {'title': 'Renamed'}),
            ('delete', f'/api/movies/{self.movie.id}/', None),
            ('patch', f'/api/theatres/{self.theatre.id}/', {'name': 'Renamed'}),
            ('delete', f'/api/theatres/{self.theatre.id}/', None),
            ('patch', f'/api/showtimes/{self.showtime.id}/', {'price': '1.00'}),
            ('delete', f'/api/showtimes/{self.showtime.id}/', None),
        ]
        for method, url, body in cases:
            with self.subTest(method=method, url=url):
                call = getattr(self.client, method)
                response = call(url, body, format='json') if body else call(url)
                self.assertEqual(response.status_code, 403)

        # Nothing was renamed or removed along the way.
        self.movie.refresh_from_db()
        self.assertEqual(self.movie.title, 'Interstellar')
        self.assertTrue(Showtime.objects.filter(pk=self.showtime.pk).exists())

    def test_an_admin_can_write(self):
        admin = get_user_model().objects.create_user(
            username='boss', password='pass123', role='ADMIN')
        self.client.force_authenticate(admin)
        self.assertEqual(
            self.client.post('/api/movies/', self.payload(), format='json').status_code, 201)

    def test_analytics_are_admin_only(self):
        user = get_user_model().objects.create_user(
            username='nosy', password='pass123', role='USER')
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/analytics/dashboard/').status_code, 403)
