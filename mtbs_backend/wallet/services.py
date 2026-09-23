from decimal import Decimal

from django.db import transaction

from .models import Wallet, WalletTransaction


def apply_delta(user, amount, kind, description=''):
    """Credit or debit a wallet balance atomically.

    This is the ONLY path that writes to `Wallet.balance`. It locks the wallet
    row, applies the delta, writes a ledger row with the snapshot, and commits
    all three in one transaction. A refund, a redeem, and a booking spend all
    flow through here so the balance is guaranteed to match the sum of the
    ledger.

    Args:
        user: The CustomUser whose wallet to mutate.
        amount: A signed Decimal. Positive credits (redeem, refund), negative
            debits (booking spend).
        kind: A WalletTransaction.KIND_CHOICES value.
        description: Human-readable context (booking ref, gift code, etc.).

    Returns:
        The WalletTransaction row that was written.

    Raises:
        ValueError: If the delta would make the balance negative.
    """
    with transaction.atomic():
        # Lazy-create the wallet if this is the user's first transaction, then
        # lock it so two concurrent requests cannot both read zero and write
        # conflicting amounts.
        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)

        new_balance = wallet.balance + amount
        if new_balance < 0:
            raise ValueError(
                f'Insufficient balance: {wallet.balance} + {amount} = {new_balance}')

        wallet.balance = new_balance
        wallet.save(update_fields=['balance', 'updated_at'])

        txn = WalletTransaction.objects.create(
            wallet=wallet,
            amount=amount,
            kind=kind,
            balance_after=new_balance,
            description=description,
        )
        return txn
