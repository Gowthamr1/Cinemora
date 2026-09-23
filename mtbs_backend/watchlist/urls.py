from rest_framework.routers import DefaultRouter

from .views import WatchlistViewSet

router = DefaultRouter()
# Mounted at /api/watchlist/ by the project urls. Registering at r'' keeps the
# list/create at the mount root and the custom actions at
# /api/watchlist/toggle/ and /api/watchlist/ids/.
router.register(r'', WatchlistViewSet, basename='watchlist')

urlpatterns = router.urls
