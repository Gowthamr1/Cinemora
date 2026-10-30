"""JWT authentication that supports both httpOnly cookies and Bearer tokens.

1. Cookie Authentication (Primary for web SPA):
   The access token arrives in an httpOnly cookie (`mtbs_access`).
   Because cookies are ambient, strict CSRF enforcement is applied to all
   mutating requests.

2. Bearer Header Fallback:
   If the browser blocks cookies due to privacy preferences (e.g., Helium Browser,
   Brave, Safari ITP, or strict 3rd-party cookie isolation), authentication
   falls back to the standard `Authorization: Bearer <token>` header.
   Explicit headers cannot be provoked cross-site by ambient browser actions,
   providing immune-by-design CSRF protection.
"""

from django.conf import settings
from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
        if raw_token:
            validated_token = self.get_validated_token(raw_token)
            self.enforce_csrf(request)
            return self.get_user(validated_token), validated_token

        # Fall back to Authorization: Bearer <token> header.
        # This guarantees reliable authentication when privacy-focused browsers
        # block third-party cookies or when cookies are disabled.
        header = self.get_header(request)
        if header is None:
            return None

        raw_token = self.get_raw_token(header)
        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token

    def enforce_csrf(self, request):
        """Reject unsafe cookie-authenticated requests that don't echo back the CSRF token."""
        def dummy_get_response(request):  # pragma: no cover - never invoked
            return None

        check = CSRFCheck(dummy_get_response)
        # Populates request.META['CSRF_COOKIE'], which process_view then reads.
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f'CSRF Failed: {reason}')
