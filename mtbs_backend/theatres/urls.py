from rest_framework.routers import DefaultRouter
from .views import TheatreViewSet

router = DefaultRouter()
router.register(r'theatres', TheatreViewSet, basename='theatre')

urlpatterns = router.urls
