import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiFilm,
  FiClock,
  FiArrowRight,
  FiStar,
  FiZap,
  FiCheckCircle,
  FiPlay,
  FiX,
  FiSearch,
  FiTv,
  FiChevronRight,
  FiSmartphone,
  FiVolume2,
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import axios from '../api/axios';
import { asList } from '../utils/list';
import MovieRating from '../components/reviews/MovieRating';
import WatchlistButton from '../components/WatchlistButton';

// Utility to convert YouTube or video links to safe embed URLs
const toEmbedUrl = (url) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}?autoplay=1&rel=0`;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}?autoplay=1&rel=0`;
    }
    if (u.pathname.includes('/embed/')) return `${url}?autoplay=1&rel=0`;
  } catch {
    return null;
  }
  return url;
};

// Curated backup highlights in case the API catalog is still warming up
const FALLBACK_FEATURED = [
  {
    id: 3,
    title: 'Interstellar',
    slug: 'interstellar',
    genre: 'Sci-Fi, Drama',
    language: 'English, Hindi',
    duration_minutes: 169,
    release_date: '2026-08-28',
    average_rating: '5.00',
    review_count: 1,
    description: 'A team of explorers travels through a newly discovered wormhole in an epic bid to find a habitable new home for humanity.',
    poster_url: 'https://m.media-amazon.com/images/M/MV5BYzdjMDAxZGItMjI2My00ODA1LTlkNzItOWFjMDU5ZDJlYWY3XkEyXkFqcGc@._V1_.jpg',
    trailer_url: 'https://youtu.be/zSWdZVtXT7E?si=ZKELlzhylcbFfbLB',
    badge: 'IMAX 70MM EXCLUSIVE',
  },
  {
    id: 4,
    title: 'Black Clover: Season 2',
    slug: 'black-clover-season-2',
    genre: 'Action, Anime',
    language: 'Japanese, English',
    duration_minutes: 150,
    release_date: '2026-10-18',
    average_rating: '4.80',
    review_count: 12,
    description: 'Born without magical powers in a magic-reliant universe, Asta and his rival Yuno push their limits to claim the mantle of Wizard King.',
    poster_url: 'https://preview.redd.it/black-clover-season-2-announced-teaser-visual-v0-i0cr2bdgj5bf1.jpeg?auto=webp&s=b879086af5512d9e7aa05cf9c98cb976dd810264',
    trailer_url: 'https://youtu.be/BwdMT-OiARI?si=McMJ7-39hA5l1Tha',
    badge: 'PREMIERE SCREENING',
  },
];

// Interactive Demo Auditorium Seat Matrix
const DEMO_ROWS = [
  { id: 'A', name: 'VIP Recliner', price: 22, seats: [1, 2, 3, 4, 5, 6, 7, 8], occupied: [3, 4] },
  { id: 'B', name: 'Executive', price: 18, seats: [1, 2, 3, 4, 5, 6, 7, 8], occupied: [7] },
  { id: 'C', name: 'Club Classic', price: 15, seats: [1, 2, 3, 4, 5, 6, 7, 8], occupied: [2, 8] },
  { id: 'D', name: 'Standard', price: 12, seats: [1, 2, 3, 4, 5, 6, 7, 8], occupied: [1, 5] },
];

const Home = () => {
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMovieIndex, setActiveMovieIndex] = useState(0);
  const [trailerModalUrl, setTrailerModalUrl] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDemoSeats, setSelectedDemoSeats] = useState(new Set(['B4', 'B5']));
  const [isHoveringHero, setIsHoveringHero] = useState(false);

  // Fetch catalog movies from API
  useEffect(() => {
    let cancelled = false;
    axios.get('/movies/')
      .then((res) => {
        if (cancelled) return;
        const list = asList(res.data);
        if (list && list.length > 0) {
          setMovies(list);
        } else {
          setMovies(FALLBACK_FEATURED);
        }
      })
      .catch(() => {
        if (!cancelled) setMovies(FALLBACK_FEATURED);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Compute featured list (API movies + fallback)
  const featuredMovies = useMemo(() => {
    if (movies.length > 0) return movies.slice(0, 5);
    return FALLBACK_FEATURED;
  }, [movies]);

  const activeMovie = featuredMovies[activeMovieIndex] || featuredMovies[0] || FALLBACK_FEATURED[0];

  // Auto-advance hero carousel unless hovered
  useEffect(() => {
    if (isHoveringHero || featuredMovies.length <= 1) return undefined;
    const interval = setInterval(() => {
      setActiveMovieIndex((prev) => (prev + 1) % featuredMovies.length);
    }, 6500);
    return () => clearInterval(interval);
  }, [isHoveringHero, featuredMovies.length]);

  // Handle Quick Search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/movies?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/movies');
    }
  };

  // Toggle seat in interactive demo
  const toggleDemoSeat = useCallback((seatId, isOccupied) => {
    if (isOccupied) return;
    setSelectedDemoSeats((prev) => {
      const next = new Set(prev);
      if (next.has(seatId)) {
        next.delete(seatId);
      } else {
        next.add(seatId);
      }
      return next;
    });
  }, []);

  // Calculate demo subtotal
  const demoTotal = useMemo(() => {
    let sum = 0;
    selectedDemoSeats.forEach((seatId) => {
      const rowId = seatId.charAt(0);
      const row = DEMO_ROWS.find((r) => r.id === rowId);
      if (row) sum += row.price;
    });
    return sum;
  }, [selectedDemoSeats]);

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
  };

  return (
    <div className="bg-slate-950 text-slate-100 overflow-x-clip flex flex-col relative selection:bg-rose-500 selection:text-white min-h-screen">

      {/* Ambient Atmospheric Light Bleeds */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[500px] bg-gradient-to-b from-rose-600/25 via-amber-500/10 to-transparent blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-[650px] -left-[200px] w-[550px] h-[550px] bg-indigo-600/15 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-[1200px] -right-[200px] w-[550px] h-[550px] bg-rose-600/15 blur-3xl pointer-events-none rounded-full" />

      {/* 🎬 1. CINEMATIC HERO SPOTLIGHT SECTION */}
      <section
        className="relative pt-6 pb-12 lg:pt-10 lg:pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full z-10"
        onMouseEnter={() => setIsHoveringHero(true)}
        onMouseLeave={() => setIsHoveringHero(false)}
      >
        {/* Main Hero Billboard Container */}
        <div className="relative rounded-3xl overflow-hidden border border-slate-800/80 bg-slate-900/60 shadow-2xl backdrop-blur-md">

          {/* Dynamic Background Backdrop with Radial Glow */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {activeMovie?.poster_url && (
              <img
                src={activeMovie.poster_url}
                alt=""
                className="w-full h-full object-cover object-center filter blur-2xl scale-110 opacity-30 transform transition-all duration-1000"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/40" />
          </div>

          <div className="relative z-10 p-6 sm:p-10 lg:p-14 flex flex-col lg:flex-row items-center justify-between gap-10 min-h-[580px]">

            {/* Left Content Billboard */}
            <div className="flex-1 max-w-2xl">
              {/* Category / Cinema Badge */}
              <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-black uppercase tracking-widest mb-6 shadow-md shadow-rose-500/10">
                <FiZap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>{activeMovie?.badge || 'FEATURED SHOWCASE'}</span>
              </div>

              {/* Title */}
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white mb-4 leading-[1.06] font-display">
                {activeMovie?.title || 'EXPERIENCE THE MAGIC'}
              </h1>

              {/* Metadata Pill Strip */}
              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm font-semibold text-slate-300 mb-6">
                {activeMovie?.genre && (
                  <span className="px-3 py-1 rounded-lg bg-slate-800/90 border border-slate-700/80 text-rose-300">
                    {activeMovie.genre}
                  </span>
                )}
                {activeMovie?.language && (
                  <span className="px-3 py-1 rounded-lg bg-slate-800/90 border border-slate-700/80 text-amber-300">
                    {activeMovie.language.split(',')[0]}
                  </span>
                )}
                {activeMovie?.duration_minutes && (
                  <div className="flex items-center space-x-1.5 text-slate-300">
                    <FiClock className="w-4 h-4 text-slate-400" />
                    <span>{activeMovie.duration_minutes} min</span>
                  </div>
                )}
                <div className="flex items-center space-x-1 text-amber-400 font-bold">
                  <FiStar className="w-4 h-4 fill-amber-400" />
                  <span>{activeMovie?.average_rating ? Number(activeMovie.average_rating).toFixed(1) : '5.0'}</span>
                </div>
              </div>

              {/* Synopsis Description */}
              <p className="text-base sm:text-lg text-slate-300/90 mb-8 font-normal leading-relaxed line-clamp-3">
                {activeMovie?.description ||
                  'Reserve your front-row seats in real-time. Experience stunning 4K IMAX projection, crystal-clear Dolby Atmos acoustics, and zero waiting lines.'}
              </p>

              {/* Hero Action CTA Buttons */}
              <div className="flex flex-wrap items-center gap-4">
                <Link to={activeMovie?.slug ? `/movies/${activeMovie.slug}` : '/movies'}>
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center justify-center bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 text-white font-extrabold px-8 py-4 rounded-2xl text-base shadow-xl shadow-rose-600/30 hover:shadow-rose-600/50 transition-all duration-300 group border border-rose-400/20"
                  >
                    <FiFilm className="mr-2.5 w-5 h-5 transition-transform group-hover:rotate-12" />
                    <span>Book Seats Now</span>
                    <FiArrowRight className="ml-2.5 w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </motion.button>
                </Link>

                {activeMovie?.trailer_url ? (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setTrailerModalUrl(activeMovie.trailer_url)}
                    className="inline-flex items-center justify-center glass-panel hover:bg-slate-800/80 text-slate-200 font-bold px-7 py-4 rounded-2xl text-base border border-slate-700 transition-all group"
                  >
                    <FiPlay className="mr-2.5 w-5 h-5 text-rose-400 fill-rose-400/40 group-hover:scale-110 transition-transform" />
                    <span>Watch Trailer</span>
                  </motion.button>
                ) : (
                  <Link to="/movies">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className="inline-flex items-center justify-center glass-panel hover:bg-slate-800/80 text-slate-200 font-bold px-7 py-4 rounded-2xl text-base border border-slate-700 transition-all"
                    >
                      <span>Explore Catalog</span>
                    </motion.button>
                  </Link>
                )}
              </div>
            </div>

            {/* Right Showcase Poster Display */}
            <div className="shrink-0 w-full lg:w-80 flex flex-col items-center">
              <motion.div
                key={activeMovie?.id || 'poster'}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="relative rounded-3xl overflow-hidden shadow-2xl border border-slate-700/80 w-64 sm:w-72 lg:w-80 aspect-[2/3] group bg-slate-950"
              >
                {activeMovie?.poster_url ? (
                  <img
                    src={activeMovie.poster_url}
                    alt={activeMovie.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 bg-slate-900">
                    <FiFilm className="w-16 h-16 mb-2" />
                    <span className="text-xs uppercase font-bold">Cinema Showcase</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/30 pointer-events-none" />

                {/* Watchlist Quick Button */}
                {activeMovie?.id && (
                  <div className="absolute top-4 right-4 z-20">
                    <WatchlistButton movieId={activeMovie.id} />
                  </div>
                )}

                {/* Trailer Play Overlay Pill */}
                {activeMovie?.trailer_url && (
                  <button
                    onClick={() => setTrailerModalUrl(activeMovie.trailer_url)}
                    className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-xl shadow-rose-600/40 hover:scale-110 hover:bg-rose-500 transition-all group-hover:opacity-100"
                    aria-label="Play Trailer"
                  >
                    <FiPlay className="w-7 h-7 ml-1 fill-white" />
                  </button>
                )}
              </motion.div>

              {/* Selector Dots / Thumbnail Strip */}
              {featuredMovies.length > 1 && (
                <div className="flex items-center space-x-2 mt-6">
                  {featuredMovies.map((m, idx) => (
                    <button
                      key={m.id || idx}
                      onClick={() => setActiveMovieIndex(idx)}
                      aria-label={`Select ${m.title}`}
                      className={`h-2.5 rounded-full transition-all duration-300 ${
                        idx === activeMovieIndex
                          ? 'w-8 bg-gradient-to-r from-rose-500 to-amber-400 shadow-md shadow-rose-500/30'
                          : 'w-2.5 bg-slate-700 hover:bg-slate-500'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* 🔍 2. QUICK SEARCH & GENRE FILTER STRIP */}
      <section className="relative z-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full -mt-4 mb-16">
        <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">

          {/* Live Search Input Form */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, genre, actor, or director..."
              className="w-full bg-slate-900/90 text-white pl-12 pr-28 py-3.5 rounded-xl border border-slate-800 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all placeholder-slate-500"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white text-xs font-bold rounded-lg shadow-md hover:opacity-95 transition-opacity"
            >
              Search
            </button>
          </form>

          {/* Quick Genre Chips */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0 justify-start md:justify-end">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mr-1 hidden lg:inline">
              Popular:
            </span>
            {['All', 'Action', 'Sci-Fi', 'Drama', 'IMAX'].map((genre) => (
              <button
                key={genre}
                onClick={() => {
                  if (genre === 'All') navigate('/movies');
                  else navigate(`/movies?genre=${encodeURIComponent(genre)}`);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-slate-800/90 transition-all"
              >
                {genre}
              </button>
            ))}
          </div>

        </div>

        {/* Live Cinema Trust Statistics Bar */}
        <div className="mt-8 pt-6 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {[
            { label: 'Active Moviegoers', val: '500K+', sub: 'Verified members' },
            { label: 'Screenings Hosted', val: '120+', sub: 'Premier partner screens' },
            { label: 'Seat Hold Speed', val: '< 50ms', sub: 'Instant WebSocket sync' },
            { label: 'Customer Rating', val: '4.9 / 5', sub: 'From 80,000+ reviews' },
          ].map((stat, i) => (
            <div key={i} className="text-center sm:text-left sm:border-r last:border-r-0 border-slate-800/80 pr-4">
              <p className="text-2xl sm:text-3xl font-black text-white font-display">{stat.val}</p>
              <p className="text-xs sm:text-sm text-slate-300 font-bold mt-0.5">{stat.label}</p>
              <p className="text-[11px] text-slate-500 font-medium">{stat.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 🎞️ 3. "NOW SHOWING" TRENDING MOVIES SHELF */}
      <section className="py-12 relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="inline-flex items-center space-x-2 text-rose-400 text-xs font-extrabold uppercase tracking-widest mb-1.5">
              <FiTv className="w-3.5 h-3.5" />
              <span>In Theaters Now</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">
              TRENDING BLOCKBUSTERS
            </h2>
          </div>

          <Link
            to="/movies"
            className="text-xs sm:text-sm font-bold text-rose-400 hover:text-rose-300 inline-flex items-center space-x-1.5 transition-colors group"
          >
            <span>View All Releases</span>
            <FiChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Movie Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((n) => (
              <div key={n} className="glass-card rounded-3xl overflow-hidden border border-slate-800 p-4 animate-pulse">
                <div className="aspect-[2/3] w-full rounded-2xl bg-slate-900 mb-4" />
                <div className="h-6 bg-slate-800 rounded-lg w-3/4 mb-3" />
                <div className="h-4 bg-slate-800 rounded-lg w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {(movies.length > 0 ? movies : FALLBACK_FEATURED).slice(0, 6).map((movie) => (
              <div
                key={movie.id}
                className="glass-card glass-card-hover rounded-3xl overflow-hidden border border-slate-800 flex flex-col justify-between group"
              >
                <div>
                  {/* Poster Box */}
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-900">
                    {movie.poster_url ? (
                      <img
                        src={movie.poster_url}
                        alt={movie.title}
                        loading="lazy"
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-600">
                        <FiFilm className="w-16 h-16 mb-2" />
                        <span className="text-xs font-semibold uppercase">No Poster Available</span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/40 opacity-80" />

                    {/* Watchlist Heart Button */}
                    <div className="absolute top-3 right-3 z-10">
                      <WatchlistButton movieId={movie.id} />
                    </div>

                    {/* Language & Format Badges */}
                    <div className="absolute top-3 left-3 flex items-center space-x-1.5">
                      {movie.language && (
                        <span className="px-2.5 py-1 rounded-md bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                          {movie.language.split(',')[0]}
                        </span>
                      )}
                      <span className="px-2 py-1 rounded-md bg-rose-600/90 text-white text-[10px] font-black uppercase tracking-wider">
                        4K LASER
                      </span>
                    </div>
                  </div>

                  {/* Movie Details */}
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="text-xl sm:text-2xl font-bold font-display text-white leading-snug group-hover:text-rose-400 transition-colors">
                        {movie.title}
                      </h3>
                      <div className="shrink-0 pt-0.5">
                        <MovieRating average={movie.average_rating} count={movie.review_count} />
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-xs font-medium text-slate-400 mb-4">
                      <span className="text-rose-400 font-semibold">{movie.genre || 'Cinema'}</span>
                      {movie.duration_minutes && (
                        <>
                          <span>•</span>
                          <div className="flex items-center space-x-1">
                            <FiClock className="w-3.5 h-3.5 text-slate-500" />
                            <span>{movie.duration_minutes} min</span>
                          </div>
                        </>
                      )}
                    </div>

                    {movie.description && (
                      <p className="text-slate-400 text-xs sm:text-sm line-clamp-2 leading-relaxed mb-6">
                        {movie.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Strip */}
                <div className="px-6 pb-6 pt-0 flex items-center gap-3">
                  <Link
                    to={movie.slug ? `/movies/${movie.slug}` : `/movies`}
                    className="flex-1 text-center py-3 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-amber-500 text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-lg shadow-rose-600/20 transition-all duration-300"
                  >
                    Book Tickets
                  </Link>

                  {movie.trailer_url && (
                    <button
                      onClick={() => setTrailerModalUrl(movie.trailer_url)}
                      className="p-3 glass-panel hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-all"
                      title="Watch Trailer"
                    >
                      <FiPlay className="w-4 h-4 text-rose-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 🎟️ 4. INTERACTIVE LIVE SEAT MATRIX PREVIEW ("FEEL THE SPEED") */}
      <section className="py-20 relative z-10 bg-slate-900/40 border-y border-slate-800/80 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1" />
              <span>Interactive Cinema Tech Preview</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4 font-display">
              LIVE SEAT SELECTION PREVIEW
            </h2>
            <p className="text-slate-400 text-base sm:text-lg">
              Click on seats below to test our real-time seat locking engine. Zero waiting queues, zero double bookings.
            </p>
          </div>

          {/* Interactive Seat Stage Widget */}
          <div className="max-w-3xl mx-auto glass-panel p-6 sm:p-10 rounded-3xl border border-slate-800 shadow-2xl relative">

            {/* Ambient Screen Light Glow Beam */}
            <div className="w-full flex flex-col items-center mb-10">
              <div className="theater-screen-curve w-3/4 sm:w-2/3 h-3 bg-gradient-to-r from-rose-500 via-amber-400 to-rose-500 rounded-full shadow-[0_-10px_35px_rgba(225,29,72,0.6)]" />
              <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest mt-3 flex items-center gap-1.5">
                <FiTv className="w-3.5 h-3.5 text-rose-500" />
                <span>Auditorium 1 — Curved 4K Laser Screen</span>
              </span>
            </div>

            {/* Seat Rows Matrix */}
            <div className="space-y-4 mb-8">
              {DEMO_ROWS.map((row) => (
                <div key={row.id} className="flex items-center justify-between sm:justify-center gap-2 sm:gap-4">
                  {/* Row Label */}
                  <span className="w-6 text-xs font-black text-slate-400 font-mono text-center">
                    {row.id}
                  </span>

                  {/* Seat Buttons */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    {row.seats.map((seatNum) => {
                      const seatId = `${row.id}${seatNum}`;
                      const isOccupied = row.occupied.includes(seatNum);
                      const isSelected = selectedDemoSeats.has(seatId);

                      return (
                        <button
                          key={seatId}
                          onClick={() => toggleDemoSeat(seatId, isOccupied)}
                          disabled={isOccupied}
                          title={isOccupied ? `${seatId}: Reserved` : `${seatId}: $${row.price} (${row.name})`}
                          className={`w-7 h-7 sm:w-9 sm:h-9 rounded-xl text-xs font-bold flex items-center justify-center transition-all duration-200 ${
                            isOccupied
                              ? 'bg-slate-800/50 text-slate-600 border border-slate-800 cursor-not-allowed'
                              : isSelected
                              ? 'bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-lg shadow-rose-500/40 scale-105 border border-rose-300'
                              : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-rose-500/60 hover:bg-slate-800'
                          }`}
                        >
                          {seatNum}
                        </button>
                      );
                    })}
                  </div>

                  {/* Price Tag */}
                  <span className="w-12 text-[11px] font-bold text-slate-500 text-right hidden sm:inline">
                    ${row.price}
                  </span>
                </div>
              ))}
            </div>

            {/* Seat Legend */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-6 border-t border-slate-800 text-xs font-semibold text-slate-400 mb-6">
              <div className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-md bg-slate-900 border border-slate-700" />
                <span>Available</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-md bg-gradient-to-r from-rose-500 to-amber-500" />
                <span>Selected</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-4 h-4 rounded-md bg-slate-800/60 border border-slate-800 text-slate-600" />
                <span>Reserved</span>
              </div>
            </div>

            {/* Selected Seats Real-Time Summary */}
            <div className="bg-slate-950/80 border border-slate-800 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                  Live Selection Summary:
                </p>
                <p className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                  {selectedDemoSeats.size > 0 ? (
                    <>
                      <span className="text-rose-400 font-bold">{selectedDemoSeats.size} Seats</span> (
                      {Array.from(selectedDemoSeats).join(', ')}) • Total: <span className="text-emerald-400">${demoTotal.toFixed(2)}</span>
                    </>
                  ) : (
                    <span className="text-slate-500 font-normal">Click any seat above to test selection</span>
                  )}
                </p>
              </div>

              <Link to="/movies" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold text-xs sm:text-sm shadow-lg shadow-rose-600/30 transition-all">
                  Reserve Real Seats &rarr;
                </button>
              </Link>
            </div>

          </div>

        </div>
      </section>

      {/* 🌟 5. WHY MOVIE LOVERS CHOOSE CINEPASS */}
      <section className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4 font-display">
              ENGINEERED FOR CINEMA PURISTS
            </h2>
            <p className="text-slate-400 text-lg">
              Next-generation theater technology built to guarantee the ultimate movie night.
            </p>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{
              visible: { transition: { staggerChildren: 0.12 } },
            }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              {
                icon: FiZap,
                title: 'Real-Time Seat Locking',
                content: 'Instant WebSocket synchronization guarantees that the moment you click a seat, it is reserved for you across all devices.',
                badge: 'Live WebSocket',
                gradient: 'from-rose-500 to-amber-500',
              },
              {
                icon: FiVolume2,
                title: 'IMAX & Dolby Atmos 7.1',
                content: 'Find verified screenings with laser projection, acoustic calibration, and high-frame-rate 3D audio.',
                badge: 'Premium Sound',
                gradient: 'from-amber-400 to-emerald-400',
              },
              {
                icon: FiSmartphone,
                title: 'Digital Passes & Offline QR',
                content: 'Skip all box office ticket queues. Scan your encrypted CinePass QR directly from your phone at the theater gate.',
                badge: 'Paperless',
                gradient: 'from-purple-500 to-rose-500',
              },
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                variants={fadeUp}
                className="glass-card glass-card-hover p-8 rounded-3xl relative overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <feature.icon className="w-7 h-7" />
                    </div>
                    <span className="text-[11px] font-extrabold uppercase px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {feature.badge}
                    </span>
                  </div>

                  <h3 className="text-2xl font-bold text-white mb-3 font-display">{feature.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed mb-6">{feature.content}</p>
                </div>

                <div className="flex items-center space-x-2 text-xs font-bold text-rose-400 group-hover:text-rose-300 transition-colors">
                  <FiCheckCircle className="w-4 h-4" />
                  <span>Verified Feature</span>
                </div>
              </motion.div>
            ))}
          </motion.div>

        </div>
      </section>

      {/* 🚀 6. SIMPLE 3-STEP JOURNEY */}
      <section className="py-16 relative z-10 bg-slate-950/70 border-t border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-12 font-display uppercase">
            Book In Three Simple Steps
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Choose Movie & Showtime',
                desc: 'Explore now-showing titles, filter by language, IMAX format, and select your preferred theatre venue.',
              },
              {
                step: '02',
                title: 'Pick Exact Seats',
                desc: 'View the live seat map and lock your favorite recliner or club seats with instant socket feedback.',
              },
              {
                step: '03',
                title: 'Scan QR at the Gate',
                desc: 'Receive your instant digital pass. Present your mobile QR directly at the hall entrance and enjoy the movie.',
              },
            ].map((step, idx) => (
              <div key={idx} className="glass-panel p-8 rounded-3xl border border-slate-800 relative text-left">
                <span className="text-4xl font-black font-display bg-gradient-to-r from-rose-500 to-amber-400 bg-clip-text text-transparent block mb-4">
                  {step.step}
                </span>
                <h3 className="text-xl font-bold text-white mb-2 font-display">{step.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 📢 7. VIP CALL TO ACTION BANNER */}
      <section className="py-20 relative z-10 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
          <div className="glass-panel p-12 sm:p-16 rounded-3xl border border-rose-500/20 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <FiStar className="w-12 h-12 text-amber-400 mx-auto mb-6 animate-bounce" />
            
            <h2 className="text-4xl sm:text-6xl font-black text-white mb-6 tracking-tight font-display">
              READY FOR YOUR NEXT SHOW?
            </h2>
            <p className="text-slate-300 text-lg sm:text-xl max-w-2xl mx-auto mb-8">
              Explore upcoming blockbusters and lock your seats in under 60 seconds.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/movies">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 text-white font-extrabold px-10 py-4.5 rounded-2xl text-lg shadow-xl shadow-rose-600/30 hover:shadow-rose-600/50 transition-all inline-flex items-center space-x-3"
                >
                  <span>Book Tickets Now</span>
                  <FiArrowRight className="w-5 h-5" />
                </motion.button>
              </Link>
              <Link to="/register">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  className="glass-panel hover:bg-slate-800 text-slate-200 font-bold px-8 py-4.5 rounded-2xl text-lg border border-slate-700 transition-all"
                >
                  <span>Create Account</span>
                </motion.button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 🎥 8. MODAL TRAILER PLAYER POPUP */}
      <AnimatePresence>
        {trailerModalUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
            onClick={() => setTrailerModalUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-4xl w-full aspect-video rounded-3xl overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setTrailerModalUrl(null)}
                className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-slate-900/90 text-white hover:bg-rose-600 flex items-center justify-center transition-colors border border-slate-700"
                aria-label="Close Trailer"
              >
                <FiX className="w-5 h-5" />
              </button>

              {/* YouTube Iframe Embed */}
              <iframe
                src={toEmbedUrl(trailerModalUrl)}
                title="Movie Trailer"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Home;
