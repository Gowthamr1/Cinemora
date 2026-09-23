from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from showtimes.models import Showtime
from theatres.models import Theatre

from .models import Movie


class MovieModelTest(TestCase):
    def test_movie_creation(self):
        movie = Movie.objects.create(
            title="Inception",
            genre="Sci-Fi",
            director="Christopher Nolan",
            cast="Leonardo DiCaprio, Joseph Gordon-Levitt",
            description="A mind-bending thriller.",
            poster_url="https://example.com/inception.jpg"
        )
        self.assertEqual(movie.title, "Inception")


class FilterOptionsCacheTests(TestCase):
    """The dropdowns are cached, so the risk is showing a stale catalogue."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.url = reverse('movie-filter-options')

    def tearDown(self):
        cache.clear()

    def _make_movie(self, **kwargs):
        return Movie.objects.create(**{
            'title': 'Dune', 'genre': 'Sci-Fi', 'language': 'English',
            'director': 'Denis Villeneuve', 'cast': 'Timothee Chalamet',
            'description': 'Sand.', **kwargs,
        })

    def test_options_are_served_from_cache_on_the_second_call(self):
        self._make_movie()
        first = self.client.get(self.url)

        # Nothing hits the database the second time — that is the whole point.
        with self.assertNumQueries(0):
            second = self.client.get(self.url)

        self.assertEqual(first.data, second.data)
        self.assertEqual(first.data['genres'], ['Sci-Fi'])

    def test_a_new_movie_invalidates_the_cache(self):
        self._make_movie()
        self.assertEqual(self.client.get(self.url).data['genres'], ['Sci-Fi'])

        self._make_movie(title='Heat', genre='Crime')

        self.assertEqual(self.client.get(self.url).data['genres'], ['Crime', 'Sci-Fi'])

    def test_a_deleted_movie_invalidates_the_cache(self):
        movie = self._make_movie()
        self.client.get(self.url)

        movie.delete()

        self.assertEqual(self.client.get(self.url).data['genres'], [])

    def test_a_new_theatre_invalidates_the_cache(self):
        """The cache spans three tables, so a Theatre write has to clear it too."""
        self._make_movie()
        self.assertEqual(self.client.get(self.url).data['cities'], [])

        Theatre.objects.create(name='PVR Central', city='Mumbai', total_screens=3)

        self.assertEqual(self.client.get(self.url).data['cities'], ['Mumbai'])


class MovieSlugTests(TestCase):
    """The slug is a public URL, so the risks are collisions and churn."""

    def _make(self, title, **kwargs):
        return Movie.objects.create(title=title, genre='Drama', director='D',
                                    cast='C', description='', **kwargs)

    def test_slug_is_generated_from_the_title(self):
        self.assertEqual(self._make('Avengers: Endgame').slug, 'avengers-endgame')

    def test_a_duplicate_title_gets_a_counter(self):
        """Titles are not unique — two remakes share one — so this must not raise."""
        self._make('Dune')
        self.assertEqual(self._make('Dune').slug, 'dune-2')
        self.assertEqual(self._make('Dune').slug, 'dune-3')

    def test_an_existing_slug_survives_a_title_edit(self):
        """A published URL that silently changes is a dead link everywhere it was shared."""
        movie = self._make('Old Title')
        movie.title = 'Brand New Title'
        movie.save()
        self.assertEqual(Movie.objects.get(pk=movie.pk).slug, 'old-title')

    def test_a_title_with_no_ascii_still_gets_a_usable_slug(self):
        """slugify() strips non-ASCII entirely, and a blank slug would collide."""
        first, second = self._make('君の名は'), self._make('千と千尋')
        self.assertTrue(first.slug and second.slug)
        self.assertNotEqual(first.slug, second.slug)

    def test_a_narrowed_update_fields_still_writes_the_slug(self):
        """save(update_fields=['title']) must not drop the slug it just generated."""
        movie = self._make('Some Film')
        Movie.objects.filter(pk=movie.pk).update(slug='')
        stale = Movie.objects.get(pk=movie.pk)
        stale.title = 'Some Film'
        stale.save(update_fields=['title'])
        self.assertEqual(Movie.objects.get(pk=movie.pk).slug, 'some-film')


class MovieLookupTests(TestCase):
    """Slug URLs, with the id path kept alive for callers that predate them."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.movie = Movie.objects.create(
            title='Interstellar', genre='Sci-Fi', director='Nolan',
            cast='McConaughey', description='Corn.')

    def tearDown(self):
        cache.clear()

    def test_detail_by_slug(self):
        res = self.client.get(f'/api/movies/{self.movie.slug}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['title'], 'Interstellar')

    def test_detail_by_id_still_resolves(self):
        res = self.client.get(f'/api/movies/{self.movie.pk}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['slug'], 'interstellar')

    def test_the_catch_all_lookup_does_not_shadow_filter_options(self):
        """`[^/]+` matches "filter-options" too — the router order is what saves it."""
        self.assertEqual(self.client.get('/api/movies/filter-options/').status_code, 200)

    def test_slug_is_read_only(self):
        admin = get_user_model().objects.create_user(
            username='boss', password='pass123', role='ADMIN')
        self.client.force_authenticate(admin)
        res = self.client.patch(f'/api/movies/{self.movie.slug}/', {'slug': 'hijacked'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Movie.objects.get(pk=self.movie.pk).slug, 'interstellar')


class SoftDeleteTests(TestCase):
    """Retiring a film must hide it everywhere without touching its history."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.admin = get_user_model().objects.create_user(
            username='boss', password='pass123', role='ADMIN')
        self.user = get_user_model().objects.create_user(
            username='punter', password='pass123', role='USER')
        self.movie = Movie.objects.create(
            title='Heat', genre='Crime', language='English', director='Mann',
            cast='Pacino', description='Bank job.')
        self.showtime = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() + timedelta(days=2),
            rows=5, seats_per_row=5, total_seats=25, seats_available=25, price=10)

    def tearDown(self):
        cache.clear()

    def _list(self, url):
        """The list endpoints are paginated, so unwrap before asserting."""
        data = self.client.get(url).data
        return data['results'] if isinstance(data, dict) and 'results' in data else data

    def _retire(self):
        self.client.force_authenticate(self.admin)
        res = self.client.delete(f'/api/movies/{self.movie.slug}/')
        self.client.force_authenticate(None)
        return res

    def test_delete_flips_the_flag_instead_of_removing_the_row(self):
        res = self._retire()
        self.assertEqual(res.status_code, 200)
        # 200 with the object, not 204 — the client re-renders the retired row.
        self.assertFalse(res.data['is_active'])
        self.assertFalse(Movie.objects.get(pk=self.movie.pk).is_active)

    def test_bookings_survive_a_retire(self):
        """The whole point: a real DELETE cascades through showtimes to bookings."""
        booking = Booking.objects.create(
            user=self.user, showtime=self.showtime, num_seats=2, seats=[1, 2],
            status=Booking.CONFIRMED)

        self._retire()

        self.assertTrue(Booking.objects.filter(pk=booking.pk).exists())
        self.assertTrue(Showtime.objects.filter(pk=self.showtime.pk).exists())

    def test_a_retired_film_disappears_from_the_public_catalogue(self):
        self._retire()

        self.assertEqual(self._list('/api/movies/'), [])
        self.assertEqual(self.client.get(f'/api/movies/{self.movie.slug}/').status_code, 404)
        # Its showtimes must not be bookable either.
        self.assertEqual(self._list('/api/showtimes/'), [])
        # And no dropdown should offer a filter that now matches nothing.
        options = self.client.get('/api/movies/filter-options/').data
        self.assertEqual(options['genres'], [])
        self.assertEqual(options['price_max'], 0)

    def test_an_admin_still_sees_a_retired_film(self):
        """Otherwise the panel could retire a film and never get it back."""
        self._retire()
        self.client.force_authenticate(self.admin)

        titles = [m['title'] for m in self._list('/api/movies/')]
        self.assertEqual(titles, ['Heat'])
        self.assertEqual(len(self._list('/api/movies/?is_active=false')), 1)
        self.assertEqual(self._list('/api/movies/?is_active=true'), [])

    def test_restore_puts_it_back(self):
        self._retire()
        self.client.force_authenticate(self.admin)

        res = self.client.post(f'/api/movies/{self.movie.slug}/restore/')

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['is_active'])
        self.client.force_authenticate(None)
        self.assertEqual(len(self._list('/api/movies/')), 1)

    def test_retiring_twice_is_rejected(self):
        self._retire()
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.delete(f'/api/movies/{self.movie.slug}/').status_code, 400)

    def test_a_non_admin_cannot_retire_or_restore(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(
            self.client.delete(f'/api/movies/{self.movie.slug}/').status_code, 403)
        self.assertEqual(
            self.client.post(f'/api/movies/{self.movie.slug}/restore/').status_code, 403)
        self.assertTrue(Movie.objects.get(pk=self.movie.pk).is_active)


class MovieRatingTests(TestCase):
    """The catalogue carries each film's average rating and review count, and
    can sort by them — the social proof on every movie card."""

    def setUp(self):
        from reviews.models import Review
        self.Review = Review
        self.client = APIClient()
        cache.clear()
        self.user = get_user_model().objects.create_user(
            username='punter', password='pass123', role='USER')

    def tearDown(self):
        cache.clear()

    def _movie(self, title):
        return Movie.objects.create(
            title=title, genre='Drama', language='English',
            director='Someone', cast='A Cast', description='...')

    def _review(self, movie, rating):
        """A review needs a booking against a finished showtime. Build the
        chain the gate expects, then attach the review to it."""
        showtime = Showtime.objects.create(
            movie=movie, start_time=timezone.now() - timedelta(days=1),
            rows=5, seats_per_row=5, total_seats=25, seats_available=24, price=10)
        booking = Booking.objects.create(
            user=self.user, showtime=showtime, num_seats=1, seats=[1],
            status=Booking.COMPLETED)
        return self.Review.objects.create(
            user=self.user, movie=movie, booking=booking, rating=rating,
            title='t', comment='c')

    def _list(self, url):
        data = self.client.get(url).data
        return data['results'] if isinstance(data, dict) and 'results' in data else data

    def _find(self, rows, title):
        return next(r for r in rows if r['title'] == title)

    def test_a_movie_carries_its_average_and_count(self):
        movie = self._movie('Reviewed')
        self._review(movie, 5)
        self._review(movie, 3)

        row = self._find(self._list('/api/movies/'), 'Reviewed')
        self.assertEqual(row['review_count'], 2)
        self.assertEqual(float(row['average_rating']), 4.0)

    def test_an_unreviewed_movie_reports_zero_and_null(self):
        self._movie('Untouched')

        row = self._find(self._list('/api/movies/'), 'Untouched')
        self.assertEqual(row['review_count'], 0)
        self.assertIsNone(row['average_rating'])

    def test_ordering_by_rating_puts_unreviewed_films_last(self):
        """The nulls-last guard: a NULL average must not sort above a real one,
        which is exactly what plain `-average_rating` does on Postgres."""
        low = self._movie('AAA Low')      # alphabetically first, so only the
        high = self._movie('BBB High')    # rating order can put High ahead
        self._movie('CCC Unreviewed')
        self._review(low, 1)
        self._review(high, 5)

        titles = [r['title'] for r in self._list('/api/movies/?ordering=rating')]
        self.assertEqual(titles[0], 'BBB High')
        self.assertEqual(titles[1], 'AAA Low')
        self.assertEqual(titles[2], 'CCC Unreviewed')

    def test_ordering_by_popularity_counts_reviews(self):
        one = self._movie('One Review')
        two = self._movie('Two Reviews')
        self._review(one, 4)
        self._review(two, 4)
        self._review(two, 2)

        titles = [r['title'] for r in self._list('/api/movies/?ordering=popularity')]
        self.assertEqual(titles[0], 'Two Reviews')
        self.assertEqual(titles[1], 'One Review')

    def test_review_count_is_not_inflated_by_a_showtime_filter(self):
        """A showtime filter LEFT JOINs showtimes and can fan review rows out.
        The distinct count must survive it — otherwise a film with three
        showtimes would report three times its real review total."""
        movie = self._movie('Multi Showtime')
        self._review(movie, 5)  # this makes one past showtime
        # Two more showtimes, so a naive join would triple the count.
        for _ in range(2):
            Showtime.objects.create(
                movie=movie, start_time=timezone.now() + timedelta(days=3),
                rows=5, seats_per_row=5, total_seats=25, seats_available=25, price=10)

        # min_price=0 forces the showtimes LEFT JOIN (all three match >= 0),
        # fanning the one review row out to three before the distinct count.
        row = self._find(self._list('/api/movies/?min_price=0'), 'Multi Showtime')
        self.assertEqual(row['review_count'], 1)

