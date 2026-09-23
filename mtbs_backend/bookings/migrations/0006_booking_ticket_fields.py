import secrets

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

# Deliberately re-declared rather than imported from bookings.models: a
# historical model has no save() override to lean on, and a migration that
# imports live code silently changes meaning the day that code does.
REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
REFERENCE_LENGTH = 10


def backfill_references(apps, schema_editor):
    """Give every pre-existing booking a ticket code.

    Runs while `reference` is still nullable, so the AlterField that follows
    finds a full column and the NOT NULL applies cleanly.
    """
    Booking = apps.get_model('bookings', 'Booking')
    taken = set(
        Booking.objects.exclude(reference=None).values_list('reference', flat=True)
    )
    for booking in Booking.objects.filter(reference=None):
        while True:
            candidate = 'BK' + ''.join(
                secrets.choice(REFERENCE_ALPHABET) for _ in range(REFERENCE_LENGTH))
            if candidate not in taken:
                break
        taken.add(candidate)
        booking.reference = candidate
        booking.save(update_fields=['reference'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('bookings', '0005_booking_bookings_bo_user_id_6151bb_idx_and_more'),
    ]

    operations = [
        # Nullable first. A unique constraint permits many NULLs, which is what
        # lets this land on a table that already has rows in it.
        migrations.AddField(
            model_name='booking',
            name='reference',
            field=models.CharField(editable=False, max_length=16, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='booking',
            name='checked_in_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='booking',
            name='checked_in_by',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='tickets_checked_in', to=settings.AUTH_USER_MODEL),
        ),
        migrations.RunPython(backfill_references, noop),
        migrations.AlterField(
            model_name='booking',
            name='reference',
            field=models.CharField(editable=False, max_length=16, unique=True),
        ),
    ]
