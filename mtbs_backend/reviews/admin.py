from django.contrib import admin

from .models import Review, HelpfulVote


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('movie', 'user', 'rating', 'created_at', 'helpful_count', 'contains_spoiler')
    list_filter = ('rating', 'contains_spoiler', 'created_at')
    search_fields = ('movie__title', 'user__username', 'title', 'comment')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(HelpfulVote)
class HelpfulVoteAdmin(admin.ModelAdmin):
    list_display = ('review', 'user', 'created_at')
    list_filter = ('created_at',)
