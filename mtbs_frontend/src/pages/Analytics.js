import React, { useCallback, useEffect, useState } from 'react';
import axios from '../api/axios';
import {
  BarList, ChartCard, Heatmap, HeroFigure, StatTile, STATUS_COLORS,
  TimeSeriesChart, VIZ, compact, hourLabel, money, moneyCompact, shortDate,
} from '../components/Charts';
import { FiPieChart, FiTrendingUp, FiDollarSign, FiUsers, FiCalendar, FiActivity, FiShield, FiAlertCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';

const RANGES = [
  { label: '7 Days', value: 7 },
  { label: '30 Days', value: 30 },
  { label: '90 Days', value: 90 },
  { label: '1 Year', value: 365 },
];

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_LABELS = {
  CONFIRMED: 'Confirmed',
  PENDING: 'Pending Payment',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const weeksForDays = (days) => Math.max(4, Math.min(52, Math.round(days / 7)));

const Analytics = () => {
  const [data, setData] = useState(null);
  const [enhanced, setEnhanced] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, enh] = await Promise.all([
        axios.get('/analytics/dashboard/', { params: { days } }),
        axios.get('/analytics/enhanced/', { params: { weeks: weeksForDays(days) } }),
      ]);
      setData(dash.data);
      setEnhanced(enh.data);
      setError('');
    } catch (err) {
      setError(err.response?.status === 403
        ? 'Admin access required to view business intelligence.'
        : 'Failed to load analytics records.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-semibold">Generating analytics intelligence...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-3xl max-w-md text-center border border-rose-500/30">
          <FiAlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <p className="text-rose-400 font-bold mb-4">{error}</p>
          <button onClick={fetchAnalytics} className="px-5 py-2.5 bg-rose-600 text-white text-xs font-bold rounded-xl shadow-lg">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary: s, revenue_series, booking_stats, popular_movies, top_theatres } = data;
  const rangeRevenue = revenue_series.reduce((sum, d) => sum + d.revenue, 0);
  const rangeBookings = revenue_series.reduce((sum, d) => sum + d.bookings, 0);
  const best = popular_movies[0];

  const statusRows = Object.entries(booking_stats.by_status);
  const statusTotal = statusRows.reduce((sum, [, c]) => sum + c, 0);

  const heatmapCells = (enhanced?.revenue_heatmap || []).map((c) => ({
    weekday: c.weekday,
    hour: c.hour,
    value: c.revenue,
    tip: `${WEEKDAY_LABELS[c.weekday - 1]} ${hourLabel(c.hour)} · ${money(c.revenue)} · ${c.seats} seat(s)`,
  }));
  const heatmapPeak = (enhanced?.revenue_heatmap || [])
    .reduce((best, c) => (c.revenue > (best?.revenue ?? -1) ? c : best), null);

  const cancelSeries = (enhanced?.cancellation_trend || []).map((w) => ({ ...w, date: w.week }));
  const rangeCancelled = cancelSeries.reduce((sum, w) => sum + w.cancelled, 0);
  const rangeBookingsAll = cancelSeries.reduce((sum, w) => sum + w.total, 0);

  const sentimentSeries = (enhanced?.review_sentiment || [])
    .filter((w) => w.average_rating !== null)
    .map((w) => ({ ...w, date: w.week }));
  const totalReviews = (enhanced?.review_sentiment || []).reduce((sum, w) => sum + w.count, 0);

  const forecast = enhanced?.occupancy_forecast;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header & Range Selector */}
        <div className="glass-panel p-8 rounded-3xl border border-amber-500/30 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 text-xs font-bold border border-amber-500/20 uppercase tracking-widest mb-2">
              <FiPieChart className="w-3.5 h-3.5" />
              <span>Executive Business Intelligence</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black font-display text-white tracking-tight">
              ANALYTICS DASHBOARD
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Financial trends, seat occupancy, slot heatmaps, and demand forecasting.
            </p>
          </div>

          <div className="glass-panel p-1.5 rounded-2xl border border-slate-800 flex space-x-1.5 shrink-0">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setDays(r.value)}
                className={`px-4 py-2.5 text-xs font-extrabold rounded-xl transition-all ${
                  days === r.value
                    ? 'bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Section 1: Executive KPI Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="glass-panel p-7 rounded-3xl border border-slate-800 lg:col-span-1 flex flex-col justify-center shadow-xl">
            <HeroFigure
              label="Total Revenue"
              value={money(s.total_revenue)}
              sub={`${money(rangeRevenue)} collected in last ${days} days`}
            />
          </div>
          <StatTile
            label="Total Bookings"
            value={compact(s.total_bookings)}
            color={VIZ.bookings}
            sub={`${s.active_bookings} active · ${rangeBookings} in last ${days}d`}
          />
          <StatTile
            label="Theatre Occupancy"
            value={`${s.occupancy_pct}%`}
            meter={s.occupancy_pct}
            color={VIZ.occupancy}
            sub={`${s.seats_occupied} of ${s.total_capacity} seats filled`}
          />
          <StatTile
            label="Average Ticket Price"
            value={money(s.avg_ticket_price)}
            color={VIZ.seats}
            sub={`${s.avg_seats_per_booking} seats/booking · ${s.seats_sold} sold`}
          />
        </div>

        {/* Section 2: Financial Performance & Time Series */}
        <ChartCard
          title="Revenue Performance Trend"
          subtitle={`${money(rangeRevenue)} total revenue in the last ${days} days`}
          table={{
            head: ['Date', 'Revenue', 'Bookings', 'Seats'],
            rows: revenue_series.map((d) => [shortDate(d.date), money(d.revenue), d.bookings, d.seats]),
          }}
        >
          <TimeSeriesChart
            series={revenue_series} valueKey="revenue" color={VIZ.revenue} format={moneyCompact}
            tip={(d) => `${money(d.revenue)} · ${d.bookings} booking(s) · ${d.seats} seat(s)`}
          />
        </ChartCard>

        {/* Daily Bookings & Status Mix Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ChartCard
            title="Daily Bookings Distribution"
            subtitle={`${rangeBookings} total bookings across selected timeline`}
            table={{
              head: ['Date', 'Bookings', 'Seats', 'Revenue'],
              rows: revenue_series.map((d) => [shortDate(d.date), d.bookings, d.seats, money(d.revenue)]),
            }}
          >
            <TimeSeriesChart
              variant="column" series={revenue_series} valueKey="bookings" color={VIZ.bookings}
              tip={(d) => `${d.bookings} booking(s) · ${d.seats} seat(s) · ${money(d.revenue)}`}
            />
          </ChartCard>

          <ChartCard
            title="Booking Status Statistics"
            subtitle={`${s.total_bookings} all-time reservations · ${s.cancellation_rate_pct}% cancellation rate`}
            table={{
              head: ['Status', 'Bookings', 'Share'],
              rows: statusRows.map(([st, c]) => [STATUS_LABELS[st] || st, c, `${pct(c, statusTotal)}%`]),
            }}
          >
            <BarList
              max={statusTotal}
              emptyText="No bookings recorded yet."
              items={statusRows.map(([st, count]) => ({
                key: st,
                label: STATUS_LABELS[st] || st,
                value: count,
                display: `${count} (${pct(count, statusTotal)}%)`,
                color: STATUS_COLORS[st] || VIZ.muted,
                tip: `${count} of ${statusTotal} booking(s)`,
              }))}
            />
          </ChartCard>
        </div>

        {/* Section 3: Content & Venue Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ChartCard
            title="Top Performing Movies"
            subtitle={best ? `Top title: ${best.title} (${best.seats_sold} seats sold)` : 'No sales recorded yet.'}
            table={{
              head: ['Movie', 'Seats', 'Bookings', 'Revenue'],
              rows: popular_movies.map((m) => [m.title, m.seats_sold, m.bookings, money(m.revenue)]),
            }}
          >
            <BarList
              emptyText="Movie popularity will populate as tickets sell."
              items={popular_movies.map((m, i) => ({
                key: m.id,
                rank: `#${i + 1}`,
                label: m.title,
                value: m.seats_sold,
                display: `${m.seats_sold} seats`,
                color: VIZ.seats,
                sublabel: `${m.bookings} booking(s) · ${money(m.revenue)}`,
                tip: `${m.seats_sold} seats sold · ${money(m.revenue)}`,
                media: m.poster_url ? (
                  <img
                    src={m.poster_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-10 h-14 rounded-xl object-cover border border-slate-700/80 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-14 rounded-xl bg-slate-900 border border-slate-800 shrink-0" />
                ),
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Theatre Occupancy Breakdown"
            subtitle={`${s.occupancy_pct}% overall capacity occupancy`}
            table={{
              head: ['Theatre', 'Occupancy', 'Seats', 'Capacity', 'Revenue'],
              rows: top_theatres.map((t) => [
                `${t.name} — ${t.city}`, `${t.occupancy_pct}%`, t.seats_sold, t.capacity, money(t.revenue),
              ]),
            }}
          >
            <BarList
              max={100}
              emptyText="No theatres registered in database."
              items={top_theatres.map((t, i) => ({
                key: t.id,
                rank: `#${i + 1}`,
                label: `${t.name} — ${t.city}`,
                value: t.occupancy_pct,
                display: `${t.occupancy_pct}%`,
                color: VIZ.occupancy,
                sublabel: `${t.seats_sold} / ${t.capacity} seats · ${money(t.revenue)}`,
                tip: `${t.occupancy_pct}% occupied`,
              }))}
            />
          </ChartCard>
        </div>

        {/* Section 4: Temporal Heatmap & Advanced Insights */}
        <ChartCard
          title="Weekly Revenue Heatmap"
          subtitle={heatmapPeak ? `Busiest Time Slot: ${WEEKDAY_LABELS[heatmapPeak.weekday - 1]} ${hourLabel(heatmapPeak.hour)} — ${money(heatmapPeak.revenue)}` : 'Revenue by day and hour'}
          table={{
            head: ['Day', 'Hour', 'Revenue', 'Seats'],
            rows: (enhanced?.revenue_heatmap || []).map((c) => [
              WEEKDAY_LABELS[c.weekday - 1], hourLabel(c.hour), money(c.revenue), c.seats,
            ]),
          }}
        >
          <Heatmap
            cells={heatmapCells} color={VIZ.revenue} format={money}
            emptyText="Heatmap populates as ticket sales occur."
          />
        </ChartCard>

        {/* Cancellation & Sentiment Trends Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ChartCard
            title="Cancellation Rate Trend"
            subtitle={rangeBookingsAll
              ? `${rangeCancelled} cancelled of ${rangeBookingsAll} total bookings (${pct(rangeCancelled, rangeBookingsAll)}%)`
              : 'Weekly share of bookings cancelled'}
            table={{
              head: ['Week', 'Cancelled', 'Total', 'Rate'],
              rows: cancelSeries.map((w) => [
                shortDate(w.week), w.cancelled, w.total, `${w.cancellation_rate_pct}%`,
              ]),
            }}
          >
            <TimeSeriesChart
              variant="column" series={cancelSeries} valueKey="cancellation_rate_pct"
              color={STATUS_COLORS.CANCELLED} format={(v) => `${Math.round(v)}%`}
              tip={(w) => `${w.cancellation_rate_pct}% · ${w.cancelled} of ${w.total} cancelled`}
            />
          </ChartCard>

          <ChartCard
            title="Review Sentiment Over Time"
            subtitle={totalReviews ? `${totalReviews} review(s) submitted — weekly average star rating` : 'Average star rating per week'}
            table={{
              head: ['Week', 'Avg Rating', 'Reviews'],
              rows: (enhanced?.review_sentiment || []).map((w) => [
                shortDate(w.week), w.average_rating === null ? '—' : w.average_rating.toFixed(2), w.count,
              ]),
            }}
          >
            {sentimentSeries.length ? (
              <TimeSeriesChart
                series={sentimentSeries} valueKey="average_rating" color={VIZ.seats}
                format={(v) => v.toFixed(1)}
                tip={(w) => `${w.average_rating?.toFixed(2)} ★ · ${w.count} review(s)`}
              />
            ) : (
              <p className="text-xs text-slate-500 py-8 text-center font-medium">No reviews in this range yet.</p>
            )}
          </ChartCard>
        </div>

        {/* Forecast Card */}
        {forecast && (
          <ChartCard
            title="Occupancy Demand Forecast"
            subtitle={`Projected ${forecast.forecast_occupancy_pct}% occupancy next week based on ${forecast.weeks_observed}-week trailing average`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-center">
                <HeroFigure
                  label="Projected Occupancy"
                  value={`${forecast.forecast_occupancy_pct}%`}
                  sub={`~${compact(forecast.projected_seats_filled)} of ${compact(forecast.upcoming_capacity)} seats scheduled`}
                />
              </div>
              <div className="md:col-span-2">
                <BarList
                  max={100}
                  emptyText="No historical show data available."
                  items={forecast.history.map((h, i) => ({
                    key: h.week_start,
                    label: `Week of ${shortDate(h.week_start)}`,
                    value: h.occupancy_pct,
                    display: `${h.occupancy_pct}%`,
                    color: VIZ.occupancy,
                    sublabel: `${h.seats_filled} of ${h.capacity} seats filled`,
                    tip: `${h.occupancy_pct}% full`,
                    rank: i === forecast.history.length - 1 ? 'Latest' : '',
                  }))}
                />
              </div>
            </div>
          </ChartCard>
        )}

      </div>
    </div>
  );
};

export default Analytics;
