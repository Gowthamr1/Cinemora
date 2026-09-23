from django.contrib import admin
from .models import Movie


@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    list_display = ['title', 'genre', 'language', 'director', 'duration_minutes', 'release_date']
    search_fields = ['title', 'genre', 'director', 'cast']
    list_filter = ['genre', 'language']
