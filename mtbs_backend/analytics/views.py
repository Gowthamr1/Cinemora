"""Aggregate queries powering the admin analytics dashboard.

This app owns no models — every number here is derived from the existing
bookings, payments, showtimes and theatres tables.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, DecimalField, Q, Sum
from django.db.models.functions import (
    Coalesce, ExtractHour, ExtractIsoWeekDay, TruncDate, TruncWeek,
)
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from bookings.models import Booking
from movies.models import Movie
from payments.models import Payment
from reviews.models import Review
from showtimes.models import Showtime
from theatres.models import Theatre

# Cancelled/expired bookings don't count as sales; only SUCCESS payments are
# revenue, and a refunded payment nets out to what was actually kept.
ACTIVE = ~Q(showtimes__bookings__status__in=Booking.RELEASED_STATUSES)
PAID = Q(showtimes__bookings__payment__status='SUCCESS')
MONEY = DecimalField(max_digits=12, decimal_places=2)


def _pct(part, whole):
    return round(part / whole * 100, 1) if whole else 0.0


def _money(value):
    return float(value or 0)


def _sales_annotations():
    """Seats sold / bookings / revenue, joined through showtimes -> bookings.

    Safe to combine in one query: a booking belongs to exactly one showtime
    and has at most one payment, so the join never fans out rows.
    """
    return {
        'bookings_count': Count('showtimes__bookings', filter=ACTIVE, distinct=True),
        'seats_sold': Coalesce(Sum('showtimes__bookings__num_seats', filter=ACTIVE), 0),
        'revenue': Coalesce(Sum('showtimes__bookings__payment__amount', filter=PAID),
                            Decimal('0'), output_field=MONEY),
    }


def _daily_series(days):
    """Revenue and bookings per day, zero-filled so the graph has no gaps."""
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)

    revenue_rows = (Payment.objects
                    .filter(status='SUCCESS', timestamp__date__gte=start)
                    .annotate(day=TruncDate('timestamp')).values('day')
                    .annotate(total=Sum('amount'), refunded=Sum('refund_amount')))
    booking_rows = (Booking.objects
                    .filter(created_at__date__gte=start)
                    .exclude(status__in=Booking.RELEASED_STATUSES)
                    .annotate(day=TruncDate('created_at')).values('day')
                    .annotate(count=Count('id'), seats=Sum('num_seats')))

    revenue_by_day = {r['day']: (r['total'] or 0) - (r['refunded'] or 0) for r in revenue_rows}
    bookings_by_day = {r['day']: r for r in booking_rows}

    series = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        booked = bookings_by_day.get(day)
        series.append({
            'date': day.isoformat(),
            'revenue': _money(revenue_by_day.get(day)),
            'bookings': booked['count'] if booked else 0,
            'seats': booked['seats'] if booked else 0,
        })
    return series


class DashboardAnalyticsView(APIView):
    """GET /api/analytics/dashboard/?days=30 — admin only."""
    permission_classes = [IsAdmin]

    def get(self, request):
        try:
            days = max(1, min(365, int(request.query_params.get('days', 30))))
        except (TypeError, ValueError):
            days = 30

        # --- Booking statistics ---
        status_counts = {row['status']: row['count'] for row in
                         Booking.objects.values('status').annotate(count=Count('id'))}
        active_bookings = Booking.objects.exclude(status__in=Booking.RELEASED_STATUSES)
        seats_sold = active_bookings.aggregate(n=Coalesce(Sum('num_seats'), 0))['n']
        total_bookings = sum(status_counts.values())
        cancelled = status_counts.get('CANCELLED', 0)
        released = sum(status_counts.get(s, 0) for s in Booking.RELEASED_STATUSES)

        # Revenue is net of refunds — a refunded ticket isn't income.
        payment_totals = Payment.objects.filter(status='SUCCESS').aggregate(
            gross=Coalesce(Sum('amount'), Decimal('0'), output_field=MONEY),
            refunded=Coalesce(Sum('refund_amount'), Decimal('0'), output_field=MONEY),
        )
        total_revenue = _money(payment_totals['gross'] - payment_totals['refunded'])
        total_refunded = _money(payment_totals['refunded'])
        paid_seats = Booking.objects.filter(payment__status='SUCCESS') \
            .aggregate(n=Coalesce(Sum('num_seats'), 0))['n']

        # --- Occupancy across every scheduled show ---
        capacity = Showtime.objects.aggregate(
            total=Coalesce(Sum('total_seats'), 0),
            free=Coalesce(Sum('seats_available'), 0),
        )
        occupied = max(0, capacity['total'] - capacity['free'])

        now = timezone.now()
        active_count = total_bookings - released
        summary = {
            'total_revenue': total_revenue,
            'total_refunded': total_refunded,
            'total_bookings': total_bookings,
            'active_bookings': active_count,
            'seats_sold': seats_sold,
            'occupancy_pct': _pct(occupied, capacity['total']),
            'total_capacity': capacity['total'],
            'seats_occupied': occupied,
            'avg_ticket_price': round(total_revenue / paid_seats, 2) if paid_seats else 0.0,
            'avg_seats_per_booking': round(seats_sold / active_count, 2) if active_count else 0.0,
            'cancellation_rate_pct': _pct(cancelled, total_bookings),
            'total_movies': Movie.objects.count(),
            'total_theatres': Theatre.objects.count(),
            'total_users': get_user_model().objects.filter(role='USER').count(),
            'upcoming_shows': Showtime.objects.filter(start_time__gte=now).count(),
        }

        booking_stats = {
            'by_status': {s: status_counts.get(s, 0) for s, _ in Booking.STATUS_CHOICES},
            'by_payment': {row['status']: row['count'] for row in
                           Payment.objects.values('status').annotate(count=Count('id'))},
            'refunds': {
                'count': Payment.objects.filter(refund_status='REFUNDED').count(),
                'amount': total_refunded,
            },
        }

        # --- Popular movies ---
        popular_movies = [
            {
                'id': m.id, 'title': m.title, 'genre': m.genre, 'language': m.language,
                'poster_url': m.poster_url, 'bookings': m.bookings_count,
                'seats_sold': m.seats_sold, 'revenue': _money(m.revenue),
            }
            for m in Movie.objects.annotate(**_sales_annotations())
                                  .filter(seats_sold__gt=0)
                                  .order_by('-seats_sold', '-revenue')[:8]
        ]

        # --- Most booked theatre ---
        # Capacity comes from a separate query: joining showtimes AND bookings in
        # one go would multiply total_seats by each showtime's booking count.
        theatre_capacity = {
            row['id']: row for row in Theatre.objects.values('id').annotate(
                total=Coalesce(Sum('showtimes__total_seats'), 0),
                free=Coalesce(Sum('showtimes__seats_available'), 0),
            )
        }
        top_theatres = []
        for t in Theatre.objects.annotate(**_sales_annotations()).order_by('-seats_sold'):
            cap = theatre_capacity.get(t.id, {'total': 0, 'free': 0})
            filled = max(0, cap['total'] - cap['free'])
            top_theatres.append({
                'id': t.id, 'name': t.name, 'city': t.city,
                'bookings': t.bookings_count, 'seats_sold': t.seats_sold,
                'revenue': _money(t.revenue), 'capacity': cap['total'],
                'occupancy_pct': _pct(filled, cap['total']),
            })

        return Response({
            'range_days': days,
            'summary': summary,
            'revenue_series': _daily_series(days),
            'booking_stats': booking_stats,
            'popular_movies': popular_movies,
            'top_theatres': top_theatres[:8],
        })


def _revenue_heatmap():
    """Revenue by day-of-week x hour-of-day of the show slot.

    Answers "which slots earn the most" — a Friday 8pm show vs a Tuesday
    matinee. Keyed on the showtime's start_time (when the film plays), not the
    payment timestamp (when the ticket sold), since the slot is what a
    programmer schedules against.

    Returned as a flat list of {weekday, hour, revenue, seats} cells; the
    frontend pivots it into a grid. Only non-empty cells are emitted.
    """
    rows = (Payment.objects
            .filter(status='SUCCESS')
            .annotate(weekday=ExtractIsoWeekDay('booking__showtime__start_time'),
                      hour=ExtractHour('booking__showtime__start_time'))
            .values('weekday', 'hour')
            .annotate(revenue=Coalesce(Sum('amount') - Sum('refund_amount'),
                                       Decimal('0'), output_field=MONEY),
                      seats=Coalesce(Sum('booking__num_seats'), 0))
            .order_by('weekday', 'hour'))
    return [
        {
            'weekday': r['weekday'],  # 1=Mon .. 7=Sun (ISO)
            'hour': r['hour'],
            'revenue': _money(r['revenue']),
            'seats': r['seats'],
        }
        for r in rows if r['weekday'] is not None and r['hour'] is not None
    ]


def _weekly_cancellation_trend(weeks):
    """Cancellation rate per week: cancelled / total bookings created that week.

    Zero-filled across the window so a quiet week reads as 0%, not a gap.
    """
    today = timezone.localdate()
    start = today - timedelta(weeks=weeks - 1)
    # Anchor to the Monday of the earliest week so buckets line up with TruncWeek.
    start -= timedelta(days=start.weekday())

    rows = (Booking.objects
            .filter(created_at__date__gte=start)
            .annotate(week=TruncWeek('created_at')).values('week')
            .annotate(total=Count('id'),
                      cancelled=Count('id', filter=Q(status=Booking.CANCELLED)),
                      expired=Count('id', filter=Q(status=Booking.EXPIRED)))
            .order_by('week'))
    by_week = {r['week'].date() if hasattr(r['week'], 'date') else r['week']: r
               for r in rows}

    series = []
    for offset in range(weeks):
        week_start = start + timedelta(weeks=offset)
        row = by_week.get(week_start)
        total = row['total'] if row else 0
        cancelled = row['cancelled'] if row else 0
        expired = row['expired'] if row else 0
        series.append({
            'week': week_start.isoformat(),
            'total': total,
            'cancelled': cancelled,
            'expired': expired,
            'cancellation_rate_pct': _pct(cancelled, total),
            'released_rate_pct': _pct(cancelled + expired, total),
        })
    return series


def _weekly_review_sentiment(weeks):
    """Average star rating per week — sentiment drifting over time.

    Weeks with no reviews are emitted with a null average so the line breaks
    rather than plunging to zero.
    """
    today = timezone.localdate()
    start = today - timedelta(weeks=weeks - 1)
    start -= timedelta(days=start.weekday())

    rows = (Review.objects
            .filter(created_at__date__gte=start)
            .annotate(week=TruncWeek('created_at')).values('week')
            .annotate(avg=Avg('rating'), count=Count('id'))
            .order_by('week'))
    by_week = {r['week'].date() if hasattr(r['week'], 'date') else r['week']: r
               for r in rows}

    series = []
    for offset in range(weeks):
        week_start = start + timedelta(weeks=offset)
        row = by_week.get(week_start)
        series.append({
            'week': week_start.isoformat(),
            'average_rating': round(row['avg'], 2) if row and row['avg'] is not None else None,
            'count': row['count'] if row else 0,
        })
    return series


def _occupancy_forecast():
    """Forecast next week's occupancy from the trailing 4 weeks of played shows.

    Deliberately not ML: a trailing average of seats-filled / capacity over
    shows that have already started. Enough signal to staff a week against,
    honest about being a naive baseline. Also returns the per-week history so
    the frontend can draw the trend the forecast extrapolates.
    """
    now = timezone.now()
    weeks_back = 4
    window_start = now - timedelta(weeks=weeks_back)

    played = Showtime.objects.filter(start_time__lt=now, start_time__gte=window_start)
    history = []
    filled_total = 0
    capacity_total = 0
    for offset in range(weeks_back):
        w_start = now - timedelta(weeks=weeks_back - offset)
        w_end = now - timedelta(weeks=weeks_back - offset - 1)
        agg = played.filter(start_time__gte=w_start, start_time__lt=w_end).aggregate(
            capacity=Coalesce(Sum('total_seats'), 0),
            free=Coalesce(Sum('seats_available'), 0),
        )
        filled = max(0, agg['capacity'] - agg['free'])
        filled_total += filled
        capacity_total += agg['capacity']
        history.append({
            'week_start': w_start.date().isoformat(),
            'capacity': agg['capacity'],
            'seats_filled': filled,
            'occupancy_pct': _pct(filled, agg['capacity']),
        })

    forecast_pct = _pct(filled_total, capacity_total)
    # Project against next week's already-scheduled capacity, if any.
    upcoming = Showtime.objects.filter(
        start_time__gte=now, start_time__lt=now + timedelta(weeks=1)
    ).aggregate(capacity=Coalesce(Sum('total_seats'), 0))['capacity']

    return {
        'method': 'trailing_4_week_average',
        'forecast_occupancy_pct': forecast_pct,
        'weeks_observed': weeks_back,
        'upcoming_capacity': upcoming,
        'projected_seats_filled': round(upcoming * forecast_pct / 100),
        'history': history,
    }


class EnhancedAnalyticsView(APIView):
    """GET /api/analytics/enhanced/?weeks=8 — admin only.

    The deeper cuts that sit beside the headline dashboard: a revenue heatmap
    across the week's slots, cancellation and review-sentiment trends, and a
    naive occupancy forecast.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        try:
            weeks = max(1, min(52, int(request.query_params.get('weeks', 8))))
        except (TypeError, ValueError):
            weeks = 8

        return Response({
            'range_weeks': weeks,
            'revenue_heatmap': _revenue_heatmap(),
            'cancellation_trend': _weekly_cancellation_trend(weeks),
            'review_sentiment': _weekly_review_sentiment(weeks),
            'occupancy_forecast': _occupancy_forecast(),
        })
