"""Live seat updates over WebSockets.

TransactionTestCase, not TestCase: broadcasts fire from `transaction.on_commit`,
and TestCase wraps every test in a transaction that never commits, so the
callbacks would silently never run and these tests would prove nothing.
"""
from datetime import timedelta

from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from bookings.models import Booking
from movies.models import Movie
from mtbs_backend.asgi import application
from showtimes.models import Showtime
from showtimes.realtime import seat_state

# A browser sends Origin on every socket handshake; the real app rejects the
# ones it doesn't recognise, so the tests have to look like a real browser.
ORIGIN_HEADERS = [(b'origin', b'http://localhost:3000')]


@override_settings(
    ALLOWED_HOSTS=['localhost', 'testserver'],
    CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}},
)
class SeatSocketTest(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='watcher', password='pass123', role='USER')
        self.movie = Movie.objects.create(
            title='Dune', genre='Sci-Fi', director='Villeneuve', cast='Chalamet',
            description='Sand', poster_url='', duration_minutes=155,
        )
        self.showtime = Showtime.objects.create(
            movie=self.movie, start_time=timezone.now() + timedelta(days=2),
            rows=5, seats_per_row=10, total_seats=50, seats_available=50, price=10,
        )

    def path(self, showtime_id=None):
        return f'/ws/showtimes/{showtime_id or self.showtime.id}/seats/'

    async def open_socket(self, showtime_id=None):
        communicator = WebsocketCommunicator(
            application, self.path(showtime_id), headers=ORIGIN_HEADERS)
        connected, _ = await communicator.connect()
        return communicator, connected

    def book(self, seats):
        """Book over the real HTTP API, so the broadcast path is the real one."""
        client = APIClient()
        client.force_authenticate(self.user)
        return client.post('/api/bookings/',
                           {'showtime': self.showtime.id, 'seats': seats}, format='json')

    def test_seat_state_ignores_bookings_that_gave_their_seats_back(self):
        Booking.objects.create(user=self.user, showtime=self.showtime,
                               num_seats=2, seats=[1, 2], status=Booking.CONFIRMED)
        Booking.objects.create(user=self.user, showtime=self.showtime,
                               num_seats=1, seats=[9], status=Booking.CANCELLED)
        Booking.objects.create(user=self.user, showtime=self.showtime,
                               num_seats=1, seats=[10], status=Booking.EXPIRED)

        state = seat_state(self.showtime.id)
        self.assertEqual(state['booked_seats'], [1, 2])
        self.assertEqual(state['total_seats'], 50)

    async def test_socket_opens_with_the_current_seat_map(self):
        await sync_to_async(Booking.objects.create)(
            user=self.user, showtime=self.showtime, num_seats=2,
            seats=[3, 4], status=Booking.CONFIRMED)

        communicator, connected = await self.open_socket()
        self.assertTrue(connected)

        # The first frame is the full picture, so no separate HTTP fetch is
        # needed and a reconnect is immediately correct again.
        state = await communicator.receive_json_from()
        self.assertEqual(state['type'], 'seat_state')
        self.assertEqual(state['booked_seats'], [3, 4])
        self.assertEqual(state['showtime'], self.showtime.id)

        await communicator.disconnect()

    async def test_someone_else_booking_pushes_the_seat_out_live(self):
        """The whole point: no refresh, no polling — the seat just goes."""
        communicator, connected = await self.open_socket()
        self.assertTrue(connected)
        first = await communicator.receive_json_from()
        self.assertEqual(first['booked_seats'], [])

        response = await sync_to_async(self.book)([7, 8])
        self.assertEqual(response.status_code, 201)

        pushed = await communicator.receive_json_from()
        self.assertEqual(pushed['booked_seats'], [7, 8])
        self.assertEqual(pushed['seats_available'], 48)

        await communicator.disconnect()

    async def test_cancelling_hands_the_seat_back_live(self):
        response = await sync_to_async(self.book)([7])
        booking_id = response.data['id']

        communicator, _ = await self.open_socket()
        opening = await communicator.receive_json_from()
        self.assertEqual(opening['booked_seats'], [7])

        def cancel():
            client = APIClient()
            client.force_authenticate(self.user)
            return client.post(f'/api/bookings/{booking_id}/cancel/')

        self.assertEqual((await sync_to_async(cancel)()).status_code, 200)

        pushed = await communicator.receive_json_from()
        self.assertEqual(pushed['booked_seats'], [])
        self.assertEqual(pushed['seats_available'], 50)

        await communicator.disconnect()

    async def test_a_client_can_ask_for_a_resend(self):
        communicator, _ = await self.open_socket()
        await communicator.receive_json_from()

        await communicator.send_json_to({'action': 'refresh'})
        state = await communicator.receive_json_from()
        self.assertEqual(state['type'], 'seat_state')

        await communicator.disconnect()

    async def test_a_showtime_that_does_not_exist_is_refused(self):
        communicator = WebsocketCommunicator(
            application, self.path(999999), headers=ORIGIN_HEADERS)
        connected, code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4404)

    async def test_a_socket_from_an_unknown_origin_is_rejected(self):
        """Same job as CORS: a page on evil.example must not read our sockets."""
        communicator = WebsocketCommunicator(
            application, self.path(), headers=[(b'origin', b'http://evil.example')])
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
