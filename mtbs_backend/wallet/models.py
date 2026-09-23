import secrets
from decimal import Decimal

from django.conf import settings
from django.db import models

# Denominations a gift card may be bought in. The amount is validated against
# this set server-side so a client can never mint a card for an arbitrary value
# (a negative, a fraction of a cent, or ten million dollars).
GIFT_CARD_DENOMINATIONS = [Decimal('10'), Decimal('25'), Decimal('50'), Decimal('100')]

# No I, O, 0 or 1: a gift-card code gets read off one screen and typed into
# another, so the same "can't be misread" rule the ticket codes use applies.
CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
CODE_GROUPS = 3
CODE_GROUP_LEN = 4


def generate_gift_code():
    """An unguessable gift-card code, e.g. GC-7Q2K-9F4M-XR3T.

    `secrets`, not `random`: this code is bearer money — anyone who has it can
    redeem it — so it has to be drawn from a cryptographic source, exactly like
    the ticket reference it mirrors. The primary key would be far worse: it's
    sequential, so a redeemer could just count upward.
    """
    groups = ['' .join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_GROUP_LEN))
              for _ in range(CODE_GROUPS)]
    return 'GC-' + '-'.join(groups)


class Wallet(models.Model):
    """A user's store of site credit.

    The balance is deliberately NOT something a request can set. It is
    `editable=False` (so it never appears in a form or the admin), and the only
    code that writes it is `wallet.services.apply_delta`, which does so under a
    row lock and records a matching ledger row every time. The sum of the
    ledger always equals this figure — it is a cache of the ledger, not an
    independent source of truth that could drift or be tampered with.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('0.00'), editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.user.username}: {self.balance}'


class WalletTransaction(models.Model):
    """One immutable line of the wallet ledger.

    Append-only: nothing in the app updates or deletes a row here, and the
    admin registration forbids it too. `amount` is signed (+ credit, - debit)
    and `balance_after` snapshots the running total at the moment it was
    written, so the whole history can be audited and re-summed independently of
    the cached `Wallet.balance`.
    """
    REDEEM = 'REDEEM'
    BOOKING_SPEND = 'BOOKING_SPEND'
    BOOKING_REFUND = 'BOOKING_REFUND'
    ADJUSTMENT = 'ADJUSTMENT'
    KIND_CHOICES = (
        (REDEEM, 'Gift card redeemed'),
        (BOOKING_SPEND, 'Booking payment'),
        (BOOKING_REFUND, 'Booking refund'),
        (ADJUSTMENT, 'Adjustment'),
    )

    wallet = models.ForeignKey(
        Wallet, on_delete=models.CASCADE, related_name='transactions')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    balance_after = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # The wallet detail view and ledger list both read one wallet's
            # rows newest-first.
            models.Index(fields=['wallet', '-created_at']),
        ]

    def __str__(self):
        return f'{self.wallet.user.username} {self.amount} ({self.kind})'


class GiftCard(models.Model):
    """A one-time-use, site-only credit token.

    Lifecycle: PENDING -> ACTIVE -> REDEEMED.

    A card is born PENDING and is worth nothing: its code is withheld and
    redeem refuses it. Paying for it through the checkout flips it to ACTIVE,
    which is the point the code becomes visible. Spending it flips ACTIVE ->
    REDEEMED under a row lock, so a code can only ever move its value into a
    wallet once.

    PENDING is the default deliberately. A card that appears by any route other
    than a completed payment — a stray `objects.create`, a fixture, an admin
    typo — starts out unspendable rather than as free money.

    The code means nothing outside this database — there is no external
    processor — so "usable only on our website" is a property of the design,
    not a rule that has to be enforced.
    """
    PENDING = 'PENDING'
    ACTIVE = 'ACTIVE'
    REDEEMED = 'REDEEMED'
    STATUS_CHOICES = (
        (PENDING, 'Awaiting payment'),
        (ACTIVE, 'Active'),
        (REDEEMED, 'Redeemed'),
    )

    code = models.CharField(max_length=20, unique=True, editable=False)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=PENDING)
    purchased_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='gift_cards_purchased')
    redeemed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='gift_cards_redeemed')
    redeemed_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # "My gift cards", newest-first.
            models.Index(fields=['purchased_by', '-created_at']),
            models.Index(fields=['status']),
        ]

    def save(self, *args, **kwargs):
        # Assign a unique code on first write only. Re-rolls on the astronomically
        # unlikely collision rather than trusting 31^12 to never repeat — the
        # same belt-and-braces the booking reference uses.
        if not self.code:
            while True:
                candidate = generate_gift_code()
                if not GiftCard.objects.filter(code=candidate).exists():
                    self.code = candidate
                    break
        super().save(*args, **kwargs)

    @property
    def is_paid(self):
        """Has this card been paid for? Only then is it worth anything."""
        return self.status in (self.ACTIVE, self.REDEEMED)

    def __str__(self):
        return f'{self.code} ({self.amount}, {self.status})'


class GiftCardPayment(models.Model):
    """The charge that turns a PENDING gift card into a spendable one.

    Kept separate from `payments.Payment` on purpose. That model is the ticket
    ledger: it hangs off a Booking (non-null, one-to-one) and every revenue
    figure in the analytics dashboard sums it. Putting gift-card sales in there
    would count the same money twice — once when the card is bought, again when
    the balance it created pays for a booking — and would need `booking` to go
    nullable, which its serializer and querysets all assume it is not.

    Mirrors the mock ticket charge otherwise: no money actually moves, and the
    amount is copied from the card server-side rather than taken from the
    request.
    """
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('SUCCESS', 'Success'),
        ('FAILED', 'Failed'),
    )

    # Wallet is deliberately absent. Buying a card with wallet credit would just
    # convert balance into a transferable bearer code at par — a cash-out route,
    # and a way to launder a refunded booking into something giftable.
    METHOD_CARD = 'CARD'
    METHOD_UPI = 'UPI'
    METHOD_CHOICES = (
        (METHOD_CARD, 'Card'),
        (METHOD_UPI, 'UPI'),
    )

    gift_card = models.OneToOneField(
        GiftCard, on_delete=models.CASCADE, related_name='payment')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    method = models.CharField(max_length=10, choices=METHOD_CHOICES, default=METHOD_CARD)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['status', 'timestamp']),
        ]

    def __str__(self):
        return f'Gift card {self.gift_card.code} - {self.status}'
