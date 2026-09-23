"""JWT authentication that reads the token from an httpOnly cookie.

The access token arrives in a cookie instead of an `Authorization` header, so
no JavaScript on the page can read it — that is the whole point, and it means
an XSS can no longer copy the credential out to someone else's server.

The price is that cookies are *ambient*: the browser attaches them to every
request to this origin, including ones provoked by a page on another site. A
header-based scheme was immune to that by construction. This one is not, so the
CSRF check below is not optional garnish — it is the half of the trade that
makes the swap a net gain rather than a lateral move.
"""

from django.conf import settings
from rest_framework import exceptions
# CSRFCheck is DRF's own CsrfViewMiddleware subclass (it overrides the failure
# handling so a rejection raises instead of rendering a 403 page). It lives in
# rest_framework.authentication, not django.middleware.csrf.
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
        if not raw_token:
            # No credential offered. Returning None rather than raising lets
            # AllowAny views still serve anonymous callers, and leaves
            # IsAuthenticated to produce the 401 for everything else.
            return None

        validated_token = self.get_validated_token(raw_token)
        self.enforce_csrf(request)
        return self.get_user(validated_token), validated_token

    def enforce_csrf(self, request):
        """Reject unsafe requests that don't echo back the CSRF token.

        Nothing else in the stack does this for us. `APIView.as_view()` wraps
        every DRF view in `csrf_exempt`, so Django's CsrfViewMiddleware skips
        the whole API; DRF re-implements the check privately inside
        SessionAuthentication and applies it nowhere else. A cookie-based auth
        class that omits this authenticates from an ambient credential with no
        CSRF defence at all.

        `process_view` is a no-op on GET/HEAD/OPTIONS/TRACE, so reads are
        untouched and only writes have to carry the token.
        """
        def dummy_get_response(request):  # pragma: no cover - never invoked
            return None

        check = CSRFCheck(dummy_get_response)
        # Populates request.META['CSRF_COOKIE'], which process_view then reads.
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f'CSRF Failed: {reason}')
