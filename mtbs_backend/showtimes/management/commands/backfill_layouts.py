"""Backfill layout + end_time on showtimes created before those fields existed.

Derives rows/seats_per_row from each show's existing total_seats so seat
numbering and capacity stay exactly as they were. Idempotent.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from showtimes.models import MAX_ROWS, Showtime


def factor_layout(total):
    """Pick the layout closest to a real cinema shape for `total` seats.

    Prefers rows x seats_per_row == total exactly, with the widest row count
    that still keeps rows <= MAX_ROWS. Falls back to one long row when total
    is prime and too large to factor nicely.
    """
    if total <= 0:
        return 1, 1
    best = None
    for rows in range(1, min(total, MAX_ROWS) + 1):
        if total % rows:
            continue
        per_row = total // rows
        # Favour layouts that look like a cinema: more seats across than rows.
        score = abs(per_row - rows * 2)
        if best is None or score < best[0]:
            best = (score, rows, per_row)
    if best:
        return best[1], best[2]
    return 1, total


class Command(BaseCommand):
    help = 'Derive rows/seats_per_row and end_time for pre-existing showtimes.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true',
                            help='Recompute layout even where it already matches total_seats.')

    @transaction.atomic
    def handle(self, *args, **options):
        force = options['force']
        fixed = 0

        for show in Showtime.objects.select_related('movie'):
            derived = show.rows * show.seats_per_row
            needs_layout = force or derived != show.total_seats
            if needs_layout:
                original_total = show.total_seats
                booked = original_total - show.seats_available
                rows, per_row = factor_layout(original_total)
                show.rows, show.seats_per_row = rows, per_row
                # save() recomputes total_seats from the layout; keep the same
                # number of seats sold rather than the same seats_available.
                show.seats_available = max(0, rows * per_row - booked)
                self.stdout.write(
                    f'  #{show.id} {show.movie.title[:28]:28} '
                    f'{original_total} seats -> {rows} rows x {per_row}'
                )
                fixed += 1
            show.save()

        total = Showtime.objects.count()
        self.stdout.write(self.style.SUCCESS(
            f'Backfilled {fixed} layout(s); refreshed end_time on {total} showtime(s).'
        ))
