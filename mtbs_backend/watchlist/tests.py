"""Watchlist: a user's private saved-movies list."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from movies.models import Movie
from .models import Watchlist


class WatchlistTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username='ada', password='pass123', role='USER')
        self.other = get_user_model().objects.create_user(
            username='bob', password='pass123', role='USER')
        self.movie = Movie.objects.create(
            title='Dune', genre='Sci-Fi', director='Villeneuve',
            cast='Chalamet', description='Sand.', duration_minutes=155)
        self.movie2 = Movie.objects.create(
            title='Arrival', genre='Sci-Fi', director='Villeneuve',
            cast='Adams', description='Squid ink.', duration_minutes=116)

    def auth(self, user=None):
        self.client.force_authenticate(user or self.user)


class WatchlistCrudTests(WatchlistTestBase):
    def test_save_a_movie_then_see_it_in_the_list(self):
        self.auth()
        res = self.client.post('/api/watchlist/', {'movie_id': self.movie.id})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['movie']['id'], self.movie.id)

        listing = self.client.get('/api/watchlist/')
        self.assertEqual(listing.data['count'], 1)
        self.assertEqual(listing.data['results'][0]['movie']['title'], 'Dune')

    def test_saving_the_same_movie_twice_is_idempotent(self):
        self.auth()
        first = self.client.post('/api/watchlist/', {'movie_id': self.movie.id})
        self.assertEqual(first.status_code, 201)
        again = self.client.post('/api/watchlist/', {'movie_id': self.movie.id})
        # 200, not a 400 from the unique constraint — a double-tap is harmless.
        self.assertEqual(again.status_code, 200)
        self.assertEqual(Watchlist.objects.filter(user=self.user).count(), 1)

    def test_remove_a_saved_movie(self):
        self.auth()
        entry = Watchlist.objects.create(user=self.user, movie=self.movie)
        res = self.client.delete(f'/api/watchlist/{entry.id}/')
        self.assertEqual(res.status_code, 204)
        self.assertFalse(Watchlist.objects.filter(pk=entry.pk).exists())

    def test_saved_movie_carries_its_rating_annotations(self):
        """The grid renders a rating badge, so the nested movie must expose the
        same review_count / average_rating the catalogue does."""
        self.auth()
        self.client.post('/api/watchlist/', {'movie_id': self.movie.id})
        row = self.client.get('/api/watchlist/').data['results'][0]
        self.assertIn('average_rating', row['movie'])
        self.assertIn('review_count', row['movie'])

    def test_cannot_save_a_retired_movie(self):
        self.auth()
        self.movie.is_active = False
        self.movie.save(update_fields=['is_active'])
        res = self.client.post('/api/watchlist/', {'movie_id': self.movie.id})
        self.assertEqual(res.status_code, 400)


class WatchlistToggleTests(WatchlistTestBase):
    def test_toggle_adds_then_removes(self):
        self.auth()
        on = self.client.post('/api/watchlist/toggle/', {'movie_id': self.movie.id})
        self.assertEqual(on.status_code, 201)
        self.assertTrue(on.data['saved'])
        self.assertTrue(Watchlist.objects.filter(user=self.user, movie=self.movie).exists())

        off = self.client.post('/api/watchlist/toggle/', {'movie_id': self.movie.id})
        self.assertFalse(off.data['saved'])
        self.assertFalse(Watchlist.objects.filter(user=self.user, movie=self.movie).exists())

    def test_toggle_on_unknown_movie_is_404(self):
        self.auth()
        res = self.client.post('/api/watchlist/toggle/', {'movie_id': 999999})
        self.assertEqual(res.status_code, 404)

    def test_ids_returns_only_the_callers_saved_movies(self):
        self.auth()
        Watchlist.objects.create(user=self.user, movie=self.movie)
        Watchlist.objects.create(user=self.user, movie=self.movie2)
        # The other user's save must not leak into this list.
        Watchlist.objects.create(user=self.other, movie=self.movie)

        res = self.client.get('/api/watchlist/ids/')
        self.assertCountEqual(res.data['movie_ids'], [self.movie.id, self.movie2.id])


class WatchlistIsolationTests(WatchlistTestBase):
    def test_list_is_scoped_to_the_caller(self):
        Watchlist.objects.create(user=self.other, movie=self.movie)
        self.auth()  # ada, who saved nothing
        res = self.client.get('/api/watchlist/')
        self.assertEqual(res.data['count'], 0)

    def test_cannot_delete_another_users_entry(self):
        entry = Watchlist.objects.create(user=self.other, movie=self.movie)
        self.auth()  # ada tries to delete bob's row
        res = self.client.delete(f'/api/watchlist/{entry.id}/')
        self.assertEqual(res.status_code, 404)
        self.assertTrue(Watchlist.objects.filter(pk=entry.pk).exists())


class WatchlistPermissionTests(WatchlistTestBase):
    def test_unauthenticated_cannot_list(self):
        res = self.client.get('/api/watchlist/')
        self.assertIn(res.status_code, (401, 403))

    def test_unauthenticated_cannot_save(self):
        res = self.client.post('/api/watchlist/', {'movie_id': self.movie.id})
        self.assertIn(res.status_code, (401, 403))
