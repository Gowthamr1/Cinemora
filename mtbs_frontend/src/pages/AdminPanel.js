import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import MoviesSection from '../components/admin/MoviesSection';
import TheatresSection from '../components/admin/TheatresSection';
import ShowtimesSection from '../components/admin/ShowtimesSection';
import { BookingsSection, PaymentsSection } from '../components/admin/RecordsSections';
import { asList as arr } from '../utils/list';
import { FiFilm, FiGrid, FiClock, FiCheckSquare, FiCreditCard, FiPieChart, FiShield, FiAlertCircle, FiChevronRight } from 'react-icons/fi';
import { motion } from 'framer-motion';

const AdminPanel = () => {
  const navigate = useNavigate();
  const [section, setSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({
    payments: [], bookings: [], movies: [], theatres: [], showtimes: [],
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [payments, bookings, movies, theatres, showtimes] = await Promise.all([
        axios.get('/payments/'),
        axios.get('/bookings/'),
        axios.get('/movies/'),
        axios.get('/theatres/'),
        axios.get('/showtimes/'),
      ]);
      setData({
        payments: arr(payments.data), bookings: arr(bookings.data),
        movies: arr(movies.data), theatres: arr(theatres.data),
        showtimes: arr(showtimes.data),
      });
      setError('');
    } catch (err) {
      console.error('Admin fetch failed:', err);
      setError(err.response?.status === 403
        ? 'Admin access required.'
        : 'Could not load admin data. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [section]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-semibold">Loading admin management console...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-3xl max-w-md text-center border border-rose-500/30">
          <FiAlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <p className="text-rose-400 font-bold mb-3">{error}</p>
          <button onClick={fetchData} className="px-5 py-2.5 bg-rose-600 text-white text-xs font-bold rounded-xl shadow-lg">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const { payments, bookings, movies, theatres, showtimes } = data;
  const back = () => setSection(null);

  const seatsSold = bookings
    .filter((b) => b.status !== 'CANCELLED')
    .reduce((n, b) => n + (b.seats?.length || b.num_seats || 0), 0);
  const revenue = payments
    .filter((p) => p.status === 'SUCCESS')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const sections = {
    movies: <MoviesSection movies={movies} onBack={back} refresh={fetchData} />,
    theatres: <TheatresSection theatres={theatres} onBack={back} refresh={fetchData} />,
    showtimes: (
      <ShowtimesSection showtimes={showtimes} movies={movies} theatres={theatres}
        onBack={back} refresh={fetchData} />
    ),
    bookings: <BookingsSection bookings={bookings} onBack={back} />,
    payments: <PaymentsSection payments={payments} onBack={back} />,
  };

  const navCards = [
    {
      key: 'movies',
      icon: FiFilm,
      title: 'Movies Catalogue',
      count: movies.length,
      desc: 'Manage film listings, posters, and details.',
      gradient: 'from-rose-500 to-amber-500',
    },
    {
      key: 'theatres',
      icon: FiGrid,
      title: 'Theatres & Halls',
      count: theatres.length,
      desc: 'Configure venues, seat layouts, and screens.',
      gradient: 'from-amber-400 to-emerald-400',
    },
    {
      key: 'showtimes',
      icon: FiClock,
      title: 'Showtime Schedules',
      count: showtimes.length,
      desc: 'Schedule showtimes and seat pricing.',
      gradient: 'from-purple-500 to-rose-500',
    },
    {
      key: 'bookings',
      icon: FiCheckSquare,
      title: 'All Bookings',
      count: bookings.length,
      desc: 'View customer reservations & tickets.',
      gradient: 'from-cyan-400 to-blue-500',
    },
    {
      key: 'payments',
      icon: FiCreditCard,
      title: 'Payments Ledger',
      count: payments.length,
      desc: 'Monitor transaction logs & refunds.',
      gradient: 'from-emerald-400 to-teal-500',
    },
    {
      key: 'analytics',
      icon: FiPieChart,
      title: 'Analytics Reports',
      count: 'Charts',
      desc: 'Revenue, occupancy & top-performing movies.',
      gradient: 'from-indigo-500 to-purple-500',
      action: () => navigate('/admin/analytics'),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-6xl mx-auto">
        
        {section ? (
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl">
            {sections[section]}
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* Header Banner */}
            <div className="glass-panel p-8 rounded-3xl border border-amber-500/30 shadow-2xl relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              <div>
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 text-xs font-bold border border-amber-500/20 uppercase tracking-widest mb-2">
                  <FiShield className="w-3.5 h-3.5" />
                  <span>Management Console</span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-black font-display text-white tracking-tight">
                  ADMIN PANEL
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                  System metrics: <span className="text-emerald-400 font-bold">{seatsSold}</span> seats sold across all theaters.
                </p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl text-right shrink-0">
                <p className="text-xs text-slate-400 uppercase font-semibold">Total Revenue Collected</p>
                <p className="text-3xl sm:text-4xl font-black text-emerald-400 font-display mt-0.5">
                  ${revenue.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Nav Card Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {navCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.key}
                    onClick={card.action || (() => setSection(card.key))}
                    className="glass-card glass-card-hover p-6 rounded-3xl border border-slate-800 text-left flex flex-col justify-between group transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <span className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-black text-amber-400">
                          {card.count}
                        </span>
                      </div>

                      <h3 className="text-xl font-bold font-display text-white mb-2 group-hover:text-amber-400 transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-slate-400 text-xs leading-relaxed mb-4">
                        {card.desc}
                      </p>
                    </div>

                    <div className="flex items-center space-x-1 text-xs font-bold text-amber-400 group-hover:text-amber-300">
                      <span>Open Section</span>
                      <FiChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                );
              })}
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default AdminPanel;
