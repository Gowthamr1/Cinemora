from datetime import timedelta

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from movies.models import Movie
from theatres.models import Theatre

# Used when a movie has no runtime recorded, so scheduling still has a
# sensible block of time to reserve on the screen.
DEFAULT_RUNTIME_MINUTES = 120
# Cleaning / trailers / audience turnover between two shows on one screen.
CLEANUP_BUFFER_MINUTES = 15
# Cinemas label rows A-Z; capping here keeps seat labels single-letter.
MAX_ROWS = 26


def seat_label(index, seats_per_row):
    """Turn a 1-based seat number into its row/seat label, e.g. 23 -> 'C3'.

    Layout is row-major: seats 1..seats_per_row are row A, and so on. This is
    derived rather than stored so bookings made before the layout builder
    existed still render correctly.
    """
    if not seats_per_row or seats_per_row < 1 or index < 1:
        return str(index)
    row, col = divmod(index - 1, seats_per_row)
    return f"{chr(65 + row)}{col + 1}" if row < MAX_ROWS else str(index)


class Showtime(models.Model):
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name='showtimes')
    theatre = models.ForeignKey(
        Theatre, on_delete=models.CASCADE, related_name='showtimes',
        null=True, blank=True,
    )
    screen_number = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1)],
        help_text='Which screen inside the theatre this show occupies',
    )
    start_time = models.DateTimeField()
    # Derived from the movie runtime on save so overlap checks can be a single
    # indexed query instead of loading every showtime and comparing in Python.
    end_time = models.DateTimeField(null=True, blank=True, editable=False)

    rows = models.PositiveIntegerField(
        default=5, validators=[MinValueValidator(1), MaxValueValidator(MAX_ROWS)],
        help_text=f'Number of seat rows (max {MAX_ROWS}, labelled A-Z)',
    )
    seats_per_row = models.PositiveIntegerField(
        default=10, validators=[MinValueValidator(1)],
        help_text='Seats in each row',
    )
    # Kept as a stored column (rows * seats_per_row) because booking validation,
    # occupancy analytics and the seat map all read it on hot paths.
    total_seats = models.PositiveIntegerField()
    seats_available = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=8, decimal_places=2, default=10.00,
                                help_text='Ticket price per seat')

    class Meta:
        indexes = [
            # Conflict detection: same theatre + screen, overlapping times.
            models.Index(fields=['theatre', 'screen_number', 'start_time']),
            # The composite above leads with `theatre`, so it can't serve a
            # bare time filter. These two are the listing's own shape:
            # order_by('start_time') on every showtime page, and
            # filter(start_time__gte=now) for the "upcoming shows" count.
            models.Index(fields=['start_time']),
            # Browsing a movie's showtimes — /api/showtimes/?movie=<id> — is
            # the single most requested query in the app.
            models.Index(fields=['movie', 'start_time']),
        ]

    @property
    def runtime_minutes(self):
        return self.movie.duration_minutes or DEFAULT_RUNTIME_MINUTES

    @property
    def blocked_minutes(self):
        """How long the screen is unavailable: runtime plus turnover."""
        return self.runtime_minutes + CLEANUP_BUFFER_MINUTES

    def compute_end_time(self):
        return self.start_time + timedelta(minutes=self.blocked_minutes)

    def seat_label(self, index):
        return seat_label(index, self.seats_per_row)

    def seat_labels(self, indexes):
        return [self.seat_label(i) for i in indexes]

    def save(self, *args, **kwargs):
        if self.rows and self.seats_per_row:
            self.total_seats = self.rows * self.seats_per_row
        if self.seats_available is None:
            self.seats_available = self.total_seats
        self.seats_available = min(self.seats_available, self.total_seats)
        if self.start_time:
            self.end_time = self.compute_end_time()
        # A partial save (e.g. seat accounting) must still persist the fields
        # recomputed above, so widen update_fields when the caller narrowed it.
        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            kwargs['update_fields'] = set(update_fields) | {
                'total_seats', 'seats_available', 'end_time'}
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.movie.title} - {self.start_time.strftime('%Y-%m-%d %H:%M')}"
