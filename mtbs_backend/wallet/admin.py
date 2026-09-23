from django.contrib import admin

from .models import GiftCard, GiftCardPayment, Wallet, WalletTransaction


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    """Read-only: the balance is mutated only through services.apply_delta."""
    list_display = ('user', 'balance', 'created_at', 'updated_at')
    search_fields = ('user__username', 'user__email')
    readonly_fields = ('user', 'balance', 'created_at', 'updated_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    """Read-only: the ledger is append-only."""
    list_display = ('wallet', 'amount', 'kind', 'balance_after', 'created_at')
    list_filter = ('kind', 'created_at')
    search_fields = ('wallet__user__username', 'description')
    readonly_fields = ('wallet', 'amount', 'kind', 'balance_after', 'description', 'created_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(GiftCard)
class GiftCardAdmin(admin.ModelAdmin):
    """Normal admin: cards can be created, viewed, or voided manually."""
    list_display = ('code', 'amount', 'status', 'purchased_by', 'redeemed_by',
                    'paid_at', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('code', 'purchased_by__username', 'redeemed_by__username')
    readonly_fields = ('code', 'created_at')


@admin.register(GiftCardPayment)
class GiftCardPaymentAdmin(admin.ModelAdmin):
    """Read-only: a charge is a record of something that happened.

    Editing one would let an unpaid card be marked as sold, or change what a
    sale was worth.
    """
    list_display = ('gift_card', 'amount', 'status', 'method', 'timestamp')
    list_filter = ('status', 'method', 'timestamp')
    search_fields = ('gift_card__code', 'gift_card__purchased_by__username')
    readonly_fields = ('gift_card', 'amount', 'status', 'method', 'timestamp')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
