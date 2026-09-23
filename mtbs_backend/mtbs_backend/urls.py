from django.contrib import admin
from django.urls import path, include
from accounts.views import CookieTokenRefreshView, MyTokenObtainPairView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/token/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'),

    # The refresh token lives in an httpOnly cookie scoped to exactly this
    # path, so the stock body-reading TokenRefreshView can't be used here.
    path('api/token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),

    path('api/', include('movies.urls')),
    path('api/', include('theatres.urls')),
    path('api/bookings/', include('bookings.urls')),
    path('api/accounts/', include('accounts.urls')),
    path('api/', include('showtimes.urls')),
    path('api/payments/', include('payments.urls')),  # 👈 gives you /api/payments/
    path('api/analytics/', include('analytics.urls')),
    path('api/watchlist/', include('watchlist.urls')),
    path('api/wallet/', include('wallet.urls')),
    # Nested under movies: /api/movies/{slug}/reviews/
    path('api/movies/<slug:slug>/reviews/', include('reviews.urls')),

]

