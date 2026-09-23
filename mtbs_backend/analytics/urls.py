from django.urls import path
from .views import DashboardAnalyticsView, EnhancedAnalyticsView

urlpatterns = [
    path('dashboard/', DashboardAnalyticsView.as_view(), name='analytics-dashboard'),
    path('enhanced/', EnhancedAnalyticsView.as_view(), name='analytics-enhanced'),
]
