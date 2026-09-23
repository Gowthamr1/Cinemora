from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, status
from .models import CustomUser
from .cookies import clear_auth_cookies, set_access_cookie, set_auth_cookies
from .serializers import RegisterSerializer, UserSerializer, MyTokenObtainPairSerializer
from django.conf import settings
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

# ✅ Register
class RegisterView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    # Open to the public and it creates rows — the tight `auth` budget keeps a
    # script from filling the user table.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

# ✅ Profile View
# Also the client's session-restore call: the access token is httpOnly now, so
# JavaScript can't decode a username out of it and has to ask instead. Setting
# the CSRF cookie here means a returning user who still holds a valid auth
# cookie regains a usable CSRF token without having to log in again.
@method_decorator(ensure_csrf_cookie, name='dispatch')
class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

# ✅ Custom JWT Login View
@method_decorator(ensure_csrf_cookie, name='dispatch')
class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    # Unauthenticated and it validates passwords, which makes it the one
    # endpoint worth brute-forcing.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)  # 401 on bad credentials

        # The tokens deliberately never appear in the response body. Handing
        # them to JavaScript is precisely what this design removes; they leave
        # as httpOnly cookies and the client never sees their contents.
        #
        # The user goes back in the body instead, because the frontend used to
        # read `username`/`role` by decoding the JWT and can no longer do that.
        response = Response(UserSerializer(serializer.user).data)
        return set_auth_cookies(response,
                                serializer.validated_data['access'],
                                serializer.validated_data['refresh'])


# ✅ Refresh, reading the httpOnly cookie
class CookieTokenRefreshView(TokenRefreshView):
    """Mint a new access token from the refresh cookie.

    The stock view expects the refresh token in the request body, which is
    impossible now that it is httpOnly — the client cannot read the cookie to
    put it there. It comes off the cookie here instead, and the fresh access
    token goes straight back out the same way.
    """

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if not refresh:
            return Response({'detail': 'No refresh cookie.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        serializer = self.get_serializer(data={'refresh': refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken):
            # Expired or tampered with. Clear the cookies so the client stops
            # retrying a credential that will never work again — otherwise the
            # frontend's refresh-on-401 loop has nothing to break it.
            return clear_auth_cookies(
                Response({'detail': 'Refresh token is not valid.'},
                         status=status.HTTP_401_UNAUTHORIZED))

        # 204: there is nothing to tell the client. The new token is in the
        # Set-Cookie header and is not theirs to read.
        response = Response(status=status.HTTP_204_NO_CONTENT)
        return set_access_cookie(response, serializer.validated_data['access'])


# ✅ Logout — clears the cookies the client cannot clear itself
class LogoutView(APIView):
    # Deliberately unauthenticated. Logout has to work in exactly the state
    # where authentication doesn't: a stale or malformed access cookie makes
    # CookieJWTAuthentication raise, which would 401 the request and leave both
    # cookies sitting in the browser — failing at the one moment logout
    # matters. It takes no input and only deletes the caller's own cookies, so
    # there is nothing here for an unauthenticated caller to gain.
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        return clear_auth_cookies(Response(status=status.HTTP_204_NO_CONTENT))
