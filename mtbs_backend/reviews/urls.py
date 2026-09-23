from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ReviewViewSet, movie_reviews_stats

router = DefaultRouter()
# Nested under /api/movies/{slug}/reviews/ via the main urls.py include.
# The viewset reads `movie_slug` from kwargs to scope the queryset.
router.register(r'', ReviewViewSet, basename='review')

urlpatterns = [
    # Aggregate stats for the Reviews tab header.
    path('stats/', movie_reviews_stats, name='review-stats'),
] + router.urls
