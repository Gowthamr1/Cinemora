"""The one place that decides how the auth cookies are written.

Login, refresh and logout all have to agree on name, path and flags. In
particular `delete_cookie` only clears a cookie whose path matches the one it
was set with — get that wrong and logout returns 204 while the browser quietly
keeps the credential, which is the worst possible way for this to fail.
"""

from django.conf import settings
from rest_framework_simplejwt.settings import api_settings


def _flags():
    return {
        # The entire point of the exercise: `document.cookie` and `fetch` can't
        # see these, so script running on the page cannot exfiltrate them.
        'httponly': True,
        # Off in development, or http://localhost would never receive them.
        'secure': not settings.DEBUG,
        'samesite': settings.AUTH_COOKIE_SAMESITE,
    }


def set_access_cookie(response, access):
    # `max_age` tracks the token's own lifetime rather than a hardcoded number,
    # so the cookie can't outlive the credential inside it (or vice versa) if
    # SIMPLE_JWT is ever tuned.
    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS, access,
        max_age=api_settings.ACCESS_TOKEN_LIFETIME,
        path=settings.AUTH_COOKIE_ACCESS_PATH,
        **_flags(),
    )
    return response


def set_auth_cookies(response, access, refresh):
    set_access_cookie(response, access)
    response.set_cookie(
        settings.AUTH_COOKIE_REFRESH, refresh,
        max_age=api_settings.REFRESH_TOKEN_LIFETIME,
        # Scoped to the single endpoint that consumes it. The browser then
        # never attaches the long-lived credential to ordinary API calls, so
        # the token that matters most isn't riding along on every request.
        path=settings.AUTH_COOKIE_REFRESH_PATH,
        **_flags(),
    )
    return response


def clear_auth_cookies(response):
    for name, path in (
        (settings.AUTH_COOKIE_ACCESS, settings.AUTH_COOKIE_ACCESS_PATH),
        (settings.AUTH_COOKIE_REFRESH, settings.AUTH_COOKIE_REFRESH_PATH),
    ):
        response.delete_cookie(
            name, path=path, samesite=settings.AUTH_COOKIE_SAMESITE)
    return response
