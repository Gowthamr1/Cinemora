import React, { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import axios from '../api/axios';
import { asList } from '../utils/list';
import { useAuth } from '../contexts/AuthContext';
import StarRating from '../components/reviews/StarRating';
import ReviewsTab from '../components/reviews/ReviewsTab';
import WatchlistButton from '../components/WatchlistButton';
import { FiClock, FiCalendar, FiFilm, FiVideo, FiUsers, FiMessageSquare, FiMapPin, FiChevronRight, FiAlertCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';

const toEmbedUrl = (url) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.pathname.includes('/embed/')) return url;
  } catch {
    return null;
  }
  return url;
};

const Chips = ({ value }) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item, i) => (
      <span key={i} className="inline-block bg-slate-900 border border-slate-700/80 text-rose-300 text-xs font-semibold px-3 py-1 rounded-lg mr-2 mb-1 shadow-sm">
        {item}
      </span>
    ));

const TABS = ['Overview', 'Cast', 'Reviews', 'Trailers'];

const MovieDetail = () => {
  const { slug } = useParams();
  const { user } = useAuth();
  const [movie, setMovie] = useState(null);
  const [showtimes, setShowtimes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = TABS.find((t) => t.toLowerCase() === tabParam) || 'Overview';

  const setTab = (tab) => {
    if (tab === 'Overview') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', tab.toLowerCase());
    }
    setSearchParams(searchParams, { replace: true });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [movieRes, showtimesRes, statsRes] = await Promise.all([
          axios.get(`/movies/${slug}/`),
          axios.get(`/showtimes/?movie=${slug}`),
          axios.get(`/movies/${slug}/reviews/stats/`).catch(() => null),
        ]);
        setMovie(movieRes.data);
        setShowtimes(asList(showtimesRes.data));
        if (statsRes) setStats(statsRes.data);
      } catch (err) {
        console.error(err);
        setError(err.response?.status === 404
          ? 'That movie is no longer available.'
          : 'Failed to load movie details');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-semibold">Loading movie details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-3xl max-w-md text-center border border-rose-500/30">
          <FiAlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Movie Unavailable</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <Link to="/movies" className="inline-block bg-rose-600 text-white font-bold px-6 py-2.5 rounded-xl text-sm shadow-lg shadow-rose-600/30">
            Back to Catalog
          </Link>
        </div>
      </div>
    );
  }

  const embed = toEmbedUrl(movie?.trailer_url);
  const castList = (movie?.cast || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-6xl mx-auto">
        
        {/* 🎬 Hero Header Card */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row gap-8 relative z-10">
            {/* Poster */}
            {movie?.poster_url ? (
              <div className="w-48 sm:w-60 shrink-0 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/60 relative group">
                <img
                  src={movie.poster_url}
                  alt={movie.title}
                  decoding="async"
                  className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
            ) : (
              <div className="w-48 sm:w-60 h-72 shrink-0 rounded-2xl bg-slate-900 flex flex-col items-center justify-center text-slate-600 border border-slate-800">
                <FiFilm className="w-16 h-16 mb-2" />
                <span className="text-xs uppercase tracking-wider font-semibold">No Poster</span>
              </div>
            )}

            {/* Movie Info */}
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  {movie?.language && (
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-500/30">
                      {movie.language}
                    </span>
                  )}
                  {movie?.duration_minutes && (
                    <span className="text-xs text-slate-400 font-medium flex items-center space-x-1">
                      <FiClock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{Math.floor(movie.duration_minutes / 60)}h {movie.duration_minutes % 60}m</span>
                    </span>
                  )}
                </div>

                <h1 className="text-3xl sm:text-5xl font-black font-display text-white tracking-tight mb-3">
                  {movie?.title}
                </h1>

                {/* Rating Badge */}
                {stats?.total_reviews > 0 && (
                  <button
                    onClick={() => setTab('Reviews')}
                    className="inline-flex items-center space-x-3 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 mb-4 group hover:border-slate-700 transition-colors"
                  >
                    <StarRating value={Number(stats.average_rating)} size="sm" />
                    <span className="text-xs font-bold text-slate-300 group-hover:text-amber-400">
                      {Number(stats.average_rating).toFixed(1)}/5
                      <span className="text-slate-500 font-normal ml-1">
                        ({stats.total_reviews.toLocaleString()} review{stats.total_reviews === 1 ? '' : 's'})
                      </span>
                    </span>
                  </button>
                )}

                <div className="mb-4">
                  <Chips value={movie?.genre} />
                </div>

                {movie?.director && (
                  <p className="text-sm text-slate-400 mb-2">
                    <span className="font-semibold text-slate-300">Director:</span> {movie.director}
                  </p>
                )}
                {movie?.release_date && (
                  <p className="text-sm text-slate-400 mb-2">
                    <span className="font-semibold text-slate-300">Release Date:</span> {new Date(movie.release_date).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Watchlist CTA */}
              <div className="pt-4 border-t border-slate-800/80">
                <WatchlistButton variant="button" movieId={movie?.id} />
              </div>
            </div>
          </div>
        </div>

        {/* 🔖 Navigation Tabs */}
        <div className="border-b border-slate-800 mb-8">
          <nav className="flex space-x-2 sm:space-x-4" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setTab(tab)}
                className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center space-x-2 ${
                  activeTab === tab
                    ? 'border-rose-500 text-rose-400 bg-rose-500/10 rounded-t-xl'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/60 rounded-t-xl'
                }`}
              >
                <span>{tab}</span>
                {tab === 'Reviews' && stats?.total_reviews > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {stats.total_reviews}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* 📑 Tab Content Panels */}
        {activeTab === 'Overview' && (
          <div className="space-y-10">
            {movie?.description && (
              <section className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800">
                <h3 className="text-xl font-bold font-display text-white mb-3 flex items-center space-x-2">
                  <FiFilm className="w-5 h-5 text-rose-500" />
                  <span>Synopsis</span>
                </h3>
                <p className="text-slate-300 leading-relaxed text-base">{movie.description}</p>
              </section>
            )}

            <section className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800">
              <h3 className="text-2xl font-bold font-display text-white mb-6 flex items-center space-x-2">
                <FiCalendar className="w-6 h-6 text-amber-400" />
                <span>Available Showtimes</span>
              </h3>

              {showtimes.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <p className="text-sm font-semibold">No showtimes currently scheduled for this movie.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {showtimes.map((show) => (
                    <div
                      key={show.id}
                      className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-2">
                          <FiClock className="w-4 h-4 text-rose-500" />
                          <span className="font-bold text-white text-base">
                            {new Date(show.start_time).toLocaleString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>

                        {show.theatre && (
                          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400">
                            <FiMapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>{show.theatre.name}, {show.theatre.city}</span>
                          </div>
                        )}

                        <div className="flex items-center space-x-3 text-xs pt-1">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                            {show.seats_available} seats left
                          </span>
                          {show.price != null && (
                            <span className="font-extrabold text-amber-400">
                              ${Number(show.price).toFixed(2)} / seat
                            </span>
                          )}
                        </div>
                      </div>

                      <Link
                        to={`/book/${show.id}`}
                        className="px-6 py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold rounded-xl text-sm shadow-lg shadow-rose-600/20 flex items-center justify-center space-x-2 transition-all"
                      >
                        <span>Select Seats</span>
                        <FiChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'Cast' && (
          <div className="space-y-8">
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800">
              <h3 className="text-xl font-bold font-display text-white mb-4 flex items-center space-x-2">
                <FiUsers className="w-5 h-5 text-rose-500" />
                <span>Featured Cast & Crew</span>
              </h3>

              {castList.length === 0 ? (
                <p className="text-slate-400 text-sm">Cast details aren't listed for this film.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {castList.map((name, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-sm font-semibold text-slate-200">
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Reviews' && (
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800">
            <ReviewsTab movie={movie} currentUser={user} onStatsChange={setStats} />
          </div>
        )}

        {activeTab === 'Trailers' && (
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800">
            {embed ? (
              <div className="aspect-video w-full rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
                <iframe
                  src={embed}
                  title={`${movie?.title} trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="text-center py-16 text-slate-400">
                <FiVideo className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-semibold">No official trailer URL available for this title.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default MovieDetail;
