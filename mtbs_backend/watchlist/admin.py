from django.contrib import admin

from .models import Watchlist


@admin.register(Watchlist)
class WatchlistAdmin(admin.ModelAdmin):
    list_display = ('user', 'movie', 'created_at')
    list_select_related = ('user', 'movie')
    search_fields = ('user__username', 'movie__title')
    autocomplete_fields = ('user', 'movie')
    ordering = ('-created_at',)
