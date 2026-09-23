import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { StatTile, VIZ } from '../components/Charts';
import { asList } from '../utils/list';
import ReviewFormModal from '../components/reviews/ReviewFormModal';
import StarRating from '../components/reviews/StarRating';
import { FiCalendar, FiClock, FiMapPin, FiCheckCircle, FiXCircle, FiGrid, FiStar, FiAlertCircle, FiChevronRight } from 'react-icons/fi';
import { motion } from 'framer-motion';

const STATUS_STYLES = {
  CONFIRMED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  PENDING: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  COMPLETED: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  CANCELLED: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  EXPIRED: 'bg-slate-800 text-slate-400 border-slate-700',
};

const REFUND_STYLES = {
  REFUNDED: 'text-emerald-400',
  PENDING: 'text-amber-400',
};

const LIVE_STATUSES = ['CONFIRMED', 'PENDING', 'COMPLETED'];
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const isUpcoming = (b) =>
  new Date(b.start_time) > new Date() && ['CONFIRMED', 'PENDING'].includes(b.status);

const FILTERS = {
  upcoming: { label: 'Upcoming', match: isUpcoming },
  past: {
    label: 'Past',
    match: (b) => ['COMPLETED'].includes(b.status)
      || (new Date(b.start_time) <= new Date() && b.status !== 'CANCELLED' && b.status !== 'EXPIRED'),
  },
  cancelled: { label: 'Cancelled', match: (b) => ['CANCELLED', 'EXPIRED'].includes(b.status) },
  all: { label: 'All', match: () => true },
};

const countdown = (iso) => {
  const mins = Math.round((new Date(iso) - new Date()) / 60000);
  if (mins <= 0) return 'starting now';
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in ${Math.round(hours / 24)} days`;
};

const Dashboard = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [cancelling, setCancelling] = useState(null);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [reviewing, setReviewing] = useState(null);
  const { user } = useAuth();

  const fetchBookings = useCallback(async () => {
    try {
      const res = await axios.get('/bookings/');
      const data = asList(res.data);
      const sorted = [...data].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
      setBookings(sorted);
    } catch (err) {
      console.error('Booking fetch error:', err);
      setError('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchBookings();
  }, [user, fetchBookings]);

  const stats = useMemo(() => {
    const live = bookings.filter((b) => LIVE_STATUSES.includes(b.status));
    return {
      upcoming: bookings.filter(isUpcoming).length,
      total: bookings.length,
      seats: live.reduce((sum, b) => sum + (b.num_seats || 0), 0),
      spent: bookings.reduce((sum, b) => sum + Number(b.amount_paid || 0), 0),
      refunded: bookings.reduce((sum, b) => sum + Number(b.refund?.amount || 0), 0),
    };
  }, [bookings]);

  const nextShow = useMemo(
    () => [...bookings].reverse().find(isUpcoming),
    [bookings],
  );

  const visible = useMemo(
    () => bookings.filter(FILTERS[filter].match),
    [bookings, filter],
  );

  const openCancel = async (booking) => {
    setCancelling(booking);
    setQuote(null);
    try {
      const res = await axios.get(`/bookings/${booking.id}/refund_quote/`);
      setQuote(res.data);
    } catch {
      setQuote({ can_cancel: booking.can_cancel, refund: booking.refund?.preview });
    }
  };

  const confirmCancel = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`/bookings/${cancelling.id}/cancel/`);
      const refunded = res.data?.refund?.amount;
      setNotice(refunded
        ? `${res.data.detail} ${money(refunded)} refunded.`
        : res.data?.detail || 'Booking cancelled.');
      setCancelling(null);
      fetchBookings();
    } catch (err) {
      setNotice(err.response?.data?.detail || 'Could not cancel booking.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-semibold">Loading your dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-3xl max-w-md text-center border border-rose-500/30">
          <FiAlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <p className="text-rose-400 font-bold mb-2">{error}</p>
          <button onClick={fetchBookings} className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl sm:text-5xl font-black font-display text-white tracking-tight">
            YOUR <span className="bg-gradient-to-r from-rose-500 to-amber-400 bg-clip-text text-transparent">DASHBOARD</span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base mt-2">
            {user?.username ? `Welcome back, ${user.username}. ` : ''}
            Manage your active bookings, view digital tickets, and review past shows.
          </p>
        </div>

        {notice && (
          <div className="glass-panel p-4 rounded-2xl border border-rose-500/40 text-rose-300 text-sm flex items-center justify-between">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className="text-slate-400 hover:text-white font-bold">✕</button>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Upcoming shows" value={stats.upcoming} color={VIZ.revenue}
            sub={nextShow ? `Next show ${countdown(nextShow.start_time)}` : 'Nothing booked ahead'} />
          <StatTile label="Total bookings" value={stats.total} color={VIZ.bookings}
            sub={`${bookings.filter(FILTERS.cancelled.match).length} cancelled`} />
          <StatTile label="Seats booked" value={stats.seats} color={VIZ.seats}
            sub="Across active shows" />
          <StatTile label="Total spent" value={money(stats.spent)} color={VIZ.occupancy}
            sub={stats.refunded ? `${money(stats.refunded)} refunded` : 'Completed shows'} />
        </div>

        {/* Next Show Highlight */}
        {nextShow && (
          <div className="glass-panel p-6 rounded-3xl border border-rose-500/30 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-rose-400 mb-3">
              <FiCalendar className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>Next Upcoming Premiere</span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              {nextShow.poster_url && (
                <img
                  src={nextShow.poster_url}
                  alt=""
                  decoding="async"
                  className="w-20 h-28 rounded-2xl object-cover border border-slate-700 shadow-xl"
                />
              )}
              <div className="flex-1 space-y-1">
                <h3 className="text-2xl font-bold font-display text-white">{nextShow.showtime_title}</h3>
                <p className="text-sm font-semibold text-rose-400">
                  {new Date(nextShow.start_time).toLocaleString()} · {countdown(nextShow.start_time)}
                </p>
                {nextShow.theatre_name && (
                  <p className="text-xs text-slate-400">
                    {nextShow.theatre_name}
                    {nextShow.screen_number ? ` · Screen ${nextShow.screen_number}` : ''}
                  </p>
                )}
                <p className="text-xs text-slate-400">
                  {nextShow.num_seats} seat(s)
                  {nextShow.seat_labels?.length ? ` · ${nextShow.seat_labels.join(', ')}` : ''}
                </p>
              </div>

              <Link
                to={`/ticket/${nextShow.id}`}
                className="px-6 py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold rounded-2xl text-xs shadow-lg shadow-rose-600/30 transition-all flex items-center space-x-2"
              >
                <span>View Digital Pass</span>
                <FiChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {/* History List */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h3 className="text-2xl font-bold font-display text-white">Booking History</h3>
            
            {/* Filter Tabs */}
            <div className="glass-panel p-1 rounded-2xl border border-slate-800 flex space-x-1">
              {Object.entries(FILTERS).map(([key, f]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                    filter === key
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {f.label} ({bookings.filter(f.match).length})
                </button>
              ))}
            </div>
          </div>

          {bookings.length === 0 ? (
            <div className="glass-panel p-12 rounded-3xl text-center border border-slate-800">
              <p className="text-slate-400 font-semibold mb-4">No bookings found yet.</p>
              <Link to="/movies" className="px-6 py-3 bg-rose-600 text-white font-bold rounded-xl text-sm shadow-lg shadow-rose-600/30 inline-block">
                Browse Movies
              </Link>
            </div>
          ) : visible.length === 0 ? (
            <div className="glass-panel p-10 rounded-3xl text-center border border-slate-800">
              <p className="text-slate-400 text-sm">No bookings match the selected filter tab.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {visible.map((booking) => {
                const refund = booking.refund;
                const isRefunded = refund && refund.status !== 'NONE';
                return (
                  <div
                    key={booking.id}
                    className="glass-card glass-card-hover p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                  >
                    <div className="flex items-start space-x-4">
                      {booking.poster_url ? (
                        <img
                          src={booking.poster_url}
                          alt="poster"
                          loading="lazy"
                          decoding="async"
                          className="w-16 h-24 rounded-2xl object-cover border border-slate-700/80 shadow-md shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-24 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 shrink-0">
                          <FiGrid className="w-6 h-6" />
                        </div>
                      )}

                      <div className="space-y-1">
                        <h4 className="text-xl font-bold font-display text-white">{booking.showtime_title || 'Showtime'}</h4>
                        <p className="text-xs font-semibold text-rose-400">
                          {booking.start_time ? new Date(booking.start_time).toLocaleString() : 'Time unknown'}
                        </p>
                        {booking.theatre_name && (
                          <p className="text-xs text-slate-400">
                            {booking.theatre_name}
                            {booking.screen_number ? ` · Screen ${booking.screen_number}` : ''}
                          </p>
                        )}
                        <p className="text-xs text-slate-300 font-medium">
                          {booking.num_seats} Seat(s): {(booking.seat_labels?.length ? booking.seat_labels : booking.seats || []).join(', ')}
                        </p>
                        {booking.payment_status && (
                          <p className="text-xs text-slate-400">
                            Amount: <span className="font-bold text-emerald-400">{money(booking.amount)}</span> ({booking.payment_status})
                          </p>
                        )}
                        {isRefunded && (
                          <p className={`text-xs font-bold ${REFUND_STYLES[refund.status] || 'text-slate-400'}`}>
                            Refund: {refund.status_display} — {money(refund.amount)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap md:flex-col items-stretch justify-end gap-2 w-full md:w-auto">
                      <span className={`px-3 py-1 rounded-xl text-xs font-bold text-center border uppercase tracking-wider ${
                        STATUS_STYLES[booking.status] || 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {booking.status_display || booking.status}
                      </span>

                      {['CONFIRMED', 'COMPLETED'].includes(booking.status) && (
                        <Link
                          to={`/ticket/${booking.id}`}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-xs rounded-xl text-center shadow-sm"
                        >
                          View Pass
                        </Link>
                      )}

                      {booking.can_review && (
                        <button
                          onClick={() => setReviewing({ booking, review: null })}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl text-center shadow-sm"
                        >
                          Rate Film
                        </button>
                      )}

                      {booking.review && (
                        <button
                          onClick={() => setReviewing({ booking, review: booking.review })}
                          className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-xs rounded-xl text-center"
                        >
                          Edit Review
                        </button>
                      )}

                      {booking.can_cancel && (
                        <button
                          onClick={() => openCancel(booking)}
                          className="px-4 py-2 bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white font-bold text-xs rounded-xl text-center transition-all"
                        >
                          Cancel Booking
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cancellation Confirmation Modal */}
        {cancelling && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
            onClick={() => !busy && setCancelling(null)}
          >
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 max-w-md w-full shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold font-display text-white">Cancel Booking?</h3>
              <p className="text-xs text-slate-400">
                {cancelling.showtime_title} — {cancelling.num_seats} seat(s).
              </p>

              {quote === null ? (
                <p className="text-xs text-slate-400 animate-pulse">Calculating refund quote...</p>
              ) : quote.refund?.eligible ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                  <p className="text-sm font-extrabold mb-1">Refund Amount: {money(quote.refund.amount)}</p>
                  <p>
                    {quote.refund.rate >= 1
                      ? '100% full refund eligible.'
                      : `${Math.round(quote.refund.rate * 100)}% partial refund based on showtime proximity.`}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                  No refund due for this booking.
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setCancelling(null)}
                  disabled={busy}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Keep Booking
                </button>
                <button
                  onClick={confirmCancel}
                  disabled={busy || (quote && !quote.can_cancel)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30"
                >
                  {busy ? 'Processing...' : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Review Form Modal */}
        {reviewing && (
          <ReviewFormModal
            movie={{ id: reviewing.booking.movie, slug: reviewing.booking.movie_slug, title: reviewing.booking.showtime_title }}
            bookings={[{ id: reviewing.booking.id, showtime: reviewing.booking.start_time, seats: reviewing.booking.seats }]}
            editingReview={reviewing.review}
            onClose={() => setReviewing(null)}
            onSubmitted={() => {
              setReviewing(null);
              setNotice('Your review has been posted!');
              fetchBookings();
            }}
          />
        )}

      </div>
    </div>
  );
};

export default Dashboard;
