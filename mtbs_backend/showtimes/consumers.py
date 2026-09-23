"""WebSocket consumer for the live seat map."""
import asyncio

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .realtime import apush_seat_state, group_name, seat_state

# How often a socket asks the server to settle expiries. The payment window is
# 15 minutes, so a 30s check makes a freed seat visible well inside a minute
# without turning idle browsers into a busy loop.
SWEEP_INTERVAL_SECONDS = 30


class SeatConsumer(AsyncJsonWebsocketConsumer):
    """Streams the seat map of one showtime.

    Read-only and unauthenticated by design: this pushes exactly what
    `GET /api/showtimes/<id>/` already returns to anonymous callers, so
    requiring a token here would gate nothing. Seats are still only *changed*
    over the authenticated HTTP API.
    """

    async def connect(self):
        try:
            self.showtime_id = int(self.scope['url_route']['kwargs']['showtime_id'])
        except (KeyError, TypeError, ValueError):
            await self.close(code=4400)
            return

        state = await database_sync_to_async(seat_state)(self.showtime_id)
        if state is None:
            # No such showtime — say so rather than holding an idle socket open.
            await self.close(code=4404)
            return

        self.group = group_name(self.showtime_id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

        # Send the current picture straight away: the client then has correct
        # state from its first frame, and needs no separate HTTP fetch.
        await self.send_json(state)

        self._sweeper = asyncio.create_task(self._sweep_loop())

    async def disconnect(self, code):
        sweeper = getattr(self, '_sweeper', None)
        if sweeper:
            sweeper.cancel()
        group = getattr(self, 'group', None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        """The only thing a client may ask for is a resend of the truth."""
        if content.get('action') == 'refresh':
            state = await database_sync_to_async(seat_state)(self.showtime_id)
            if state:
                await self.send_json(state)

    async def seat_state(self, event):
        """Group broadcast handler — `type: 'seat.state'` maps here."""
        await self.send_json(event['payload'])

    async def _sweep_loop(self):
        """Settle expiries while anyone is watching, so freed seats appear live.

        `sweep_stale_bookings` is otherwise lazy — it only runs when someone
        reads the bookings API — which would leave an abandoned booking's seats
        looking taken indefinitely. Running it here means the sweep happens
        exactly when there is someone to show the result to.
        """
        # Imported lazily: bookings.services imports showtimes.models, so a
        # module-level import here would be circular.
        from bookings.services import sweep_stale_bookings

        try:
            while True:
                await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
                result = await database_sync_to_async(sweep_stale_bookings)()
                if result['expired'] or result['completed']:
                    # The sweep may have touched other showtimes too, but each
                    # release already broadcasts to its own group.
                    await apush_seat_state(self.showtime_id)
        except asyncio.CancelledError:
            raise
