"""Release seats from abandoned bookings and close out played shows.

The API sweeps on every booking read, so this command is only needed for a
cron/Task Scheduler entry if you want it to happen without traffic:

    python manage.py sweep_bookings
"""
from django.core.management.base import BaseCommand

from bookings.services import sweep_stale_bookings


class Command(BaseCommand):
    help = 'Expire unpaid bookings past their payment window and complete played shows.'

    def handle(self, *args, **options):
        result = sweep_stale_bookings()
        self.stdout.write(self.style.SUCCESS(
            f"Expired {result['expired']} unpaid booking(s); "
            f"marked {result['completed']} booking(s) completed."
        ))
