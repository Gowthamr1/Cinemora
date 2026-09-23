from django.contrib import admin
from .models import Theatre


@admin.register(Theatre)
class TheatreAdmin(admin.ModelAdmin):
    list_display = ['name', 'city', 'total_screens']
    search_fields = ['name', 'city']
