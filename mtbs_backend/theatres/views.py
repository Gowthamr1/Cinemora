from rest_framework import viewsets

from accounts.permissions import IsAdminOrReadOnly
from .models import Theatre
from .serializers import TheatreSerializer


class TheatreViewSet(viewsets.ModelViewSet):
    queryset = Theatre.objects.all()
    serializer_class = TheatreSerializer
    permission_classes = [IsAdminOrReadOnly]
