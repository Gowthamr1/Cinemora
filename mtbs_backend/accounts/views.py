from django.middleware.csrf import get_token
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

# ✅ CSRF Token View (explicit endpoint for cross-origin or SPA clients)
@method_decorator(ensure_csrf_cookie, name='dispatch')
class CSRFView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = get_token(request)
        response = Response({'csrfToken': token})
        response['X-CSRFToken'] = token
        return response

# ✅ Register
@method_decorator(ensure_csrf_cookie, name='dispatch')
class RegisterView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

# ✅ Profile View
@method_decorator(ensure_csrf_cookie, name='dispatch')
class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        token = get_token(request)
        data = UserSerializer(request.user).data
        data['csrf_token'] = token
        response = Response(data)
        response['X-CSRFToken'] = token
        return response

# ✅ Custom JWT Login View
@method_decorator(ensure_csrf_cookie, name='dispatch')
class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)  # 401 on bad credentials

        token = get_token(request)
        # Returns user data AND access/refresh tokens in body as a fallback
        # for privacy browsers (e.g. Helium, Brave, Safari) that block third-party cookies.
        data = {
            **UserSerializer(serializer.user).data,
            'access': str(serializer.validated_data['access']),
            'refresh': str(serializer.validated_data['refresh']),
            'csrf_token': token,
        }
        response = Response(data)
        response['X-CSRFToken'] = token
        return set_auth_cookies(response,
                                serializer.validated_data['access'],
                                serializer.validated_data['refresh'])


# ✅ Refresh, supporting both httpOnly cookie and request body
class CookieTokenRefreshView(TokenRefreshView):
    """Mint a new access token from the refresh cookie or request body."""

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH) or request.data.get('refresh')
        if not refresh:
            return Response({'detail': 'No refresh token provided.'},
                            status=status.HTTP_401_UNAUTHORIZED)

        serializer = self.get_serializer(data={'refresh': refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken):
            return clear_auth_cookies(
                Response({'detail': 'Refresh token is not valid.'},
                         status=status.HTTP_401_UNAUTHORIZED))

        access_token = str(serializer.validated_data['access'])
        response = Response({'access': access_token}, status=status.HTTP_200_OK)
        return set_access_cookie(response, serializer.validated_data['access'])


# ✅ Logout — clears the cookies the client cannot clear itself
class LogoutView(APIView):
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        return clear_auth_cookies(response)
