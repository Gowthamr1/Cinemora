"""WebSocket URL map, kept separate from the HTTP `urls.py`."""
from django.urls import path

from .consumers import SeatConsumer

websocket_urlpatterns = [
    path('ws/showtimes/<int:showtime_id>/seats/', SeatConsumer.as_asgi()),
]
