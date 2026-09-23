"""
ASGI config for mtbs_backend project.

Serves both protocols: ordinary HTTP goes to Django, and `ws://` goes to the
channels router. `daphne` sits first in INSTALLED_APPS so `manage.py runserver`
picks this up, meaning WebSockets work in development with no extra process.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mtbs_backend.settings')

# Django has to be set up before consumers (and the models they touch) import.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import OriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402

from showtimes.routing import websocket_urlpatterns  # noqa: E402


class AllowedHostsOrigin:
    """Reject sockets from origins we don't serve — the CORS of WebSockets.

    A browser will open a socket from any page, no preflight required, so
    without this a script on someone else's site could read our seat feed.

    channels ships `AllowedHostsOriginValidator` for this, but it is a factory
    that snapshots ALLOWED_HOSTS the moment this module is imported. That makes
    the rule depend on import order at boot and impossible to override in
    tests. Same check, resolved per handshake instead.
    """

    def __init__(self, application):
        self.application = application

    async def __call__(self, scope, receive, send):
        hosts = list(settings.ALLOWED_HOSTS)
        if settings.DEBUG and not hosts:
            hosts = ['localhost', '127.0.0.1', '[::1]']
        # A fresh validator per connection: sharing one would mean mutating
        # allowed_origins under concurrent handshakes.
        return await OriginValidator(self.application, hosts)(scope, receive, send)


application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AllowedHostsOrigin(URLRouter(websocket_urlpatterns)),
})
