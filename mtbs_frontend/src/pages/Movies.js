import React, { useEffect, useState, useCallback } from 'react';
import axios from '../api/axios';
import { Link } from 'react-router-dom';
import { asList } from '../utils/list';
import MovieRating from '../components/reviews/MovieRating';
import WatchlistButton from '../components/WatchlistButton';
import { FiSearch, FiFilter, FiX, FiFilm, FiClock, FiChevronRight } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const EMPTY_FILTERS = {
  language: '',
  genre: '',
  theatre: '',
  city: '',
  date: '',
  min_price: '',
  max_price: '',
};

const Movies = () => {
  const [movies, setMovies] = useState([]);
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState('title');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [options, setOptions] = useState({ languages: [], genres: [], cities: [], theatres: [] });
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const moviesPerPage = 6;

  useEffect(() => {
    axios.get('/movies/filter-options/')
      .then(res => setOptions(res.data))
      .catch(() => {});
  }, []);

  const fetchMovies = useCallback(async () => {
    setLoading(true);
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== '')
    );
    if (search.trim()) params.search = search.trim();
    if (ordering !== 'title') params.ordering = ordering;

    try {
      const res = await axios.get('/movies/', { params });
      setMovies(asList(res.data));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, search, ordering]);

  useEffect(() => {
    const t = setTimeout(fetchMovies, 300);
    return () => clearTimeout(t);
  }, [fetchMovies]);

  useEffect(() => setCurrentPage(1), [filters, search, ordering]);

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setSearch(''); };

  const activeCount = Object.values(filters).filter(Boolean).length;
  const indexOfLast = currentPage * moviesPerPage;
  const currentMovies = movies.slice(indexOfLast - moviesPerPage, indexOfLast);
  const totalPages = Math.ceil(movies.length / moviesPerPage);

  const theatreChoices = filters.city
    ? options.theatres.filter(t => t.city === filters.city)
    : options.theatres;

  const selectClass = 'w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-rose-500 transition-colors';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      
      {/* Header Banner */}
      <div className="max-w-7xl mx-auto mb-10 text-center">
        <h1 className="text-4xl sm:text-6xl font-black font-display text-white tracking-tight mb-3">
          EXPLORE <span className="bg-gradient-to-r from-rose-500 to-amber-400 bg-clip-text text-transparent">PREMIERES</span>
        </h1>
        <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
          Discover critically acclaimed films, blockbuster hits, and reserve real-time seats across premium theaters.
        </p>
      </div>

      {/* 🔍 Search & Filter Bar */}
      <div className="max-w-5xl mx-auto mb-8 space-y-4">
        <div className="glass-panel p-2 sm:p-3 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center gap-3 shadow-xl">
          
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search movies, genre, cast, director..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-900/80 text-white pl-12 pr-4 py-3 rounded-xl border border-slate-800 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all placeholder-slate-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={ordering}
              onChange={e => setOrdering(e.target.value)}
              className="bg-slate-900 text-slate-200 border border-slate-800 px-4 py-3 rounded-xl text-sm font-semibold focus:outline-none focus:border-rose-500 transition-all"
            >
              <option value="title">A-Z Title</option>
              <option value="rating">Top Rated</option>
              <option value="popularity">Most Reviewed</option>
              <option value="release_date">Newest Releases</option>
            </select>

            <button
              onClick={() => setShowFilters(s => !s)}
              className={`px-5 py-3 rounded-xl text-sm font-bold flex items-center space-x-2 border transition-all whitespace-nowrap ${
                showFilters || activeCount > 0
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <FiFilter className="w-4 h-4" />
              <span>Filters</span>
              {activeCount > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs font-black rounded-full bg-rose-600 text-white">
                  {activeCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* 🎛️ Filter Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="glass-panel p-6 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <label className="text-xs font-semibold uppercase text-slate-400">
                  Language
                  <select className={selectClass} value={filters.language}
                    onChange={e => setFilter('language', e.target.value)}>
                    <option value="">Any Language</option>
                    {options.languages.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>

                <label className="text-xs font-semibold uppercase text-slate-400">
                  Genre
                  <select className={selectClass} value={filters.genre}
                    onChange={e => setFilter('genre', e.target.value)}>
                    <option value="">Any Genre</option>
                    {options.genres.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>

                <label className="text-xs font-semibold uppercase text-slate-400">
                  City
                  <select className={selectClass} value={filters.city}
                    onChange={e => { setFilter('city', e.target.value); setFilter('theatre', ''); }}>
                    <option value="">Any City</option>
                    {options.cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label className="text-xs font-semibold uppercase text-slate-400">
                  Theatre
                  <select className={selectClass} value={filters.theatre}
                    onChange={e => setFilter('theatre', e.target.value)}>
                    <option value="">Any Theatre</option>
                    {theatreChoices.map(t => (
                      <option key={t.id} value={t.id}>{t.name} — {t.city}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold uppercase text-slate-400">
                  Show Date
                  <input type="date" className={selectClass} value={filters.date}
                    onChange={e => setFilter('date', e.target.value)} />
                </label>

                <div className="text-xs font-semibold uppercase text-slate-400">
                  Price per Seat ($)
                  <div className="flex gap-2 items-center mt-1">
                    <input type="number" min={0} placeholder="Min" className={selectClass}
                      value={filters.min_price} onChange={e => setFilter('min_price', e.target.value)} />
                    <span className="text-slate-500">–</span>
                    <input type="number" min={0} placeholder="Max" className={selectClass}
                      value={filters.max_price} onChange={e => setFilter('max_price', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-400">
                  {loading ? 'Searching catalog...' : `${movies.length} film(s) available`}
                </span>
                <button onClick={clearFilters} className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center space-x-1">
                  <FiX className="w-3.5 h-3.5" />
                  <span>Reset All Filters</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Filter Chips */}
        {activeCount > 0 && !showFilters && (
          <div className="flex flex-wrap gap-2 justify-center">
            {Object.entries(filters).filter(([, v]) => v).map(([key, value]) => (
              <button
                key={key}
                onClick={() => setFilter(key, '')}
                className="text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20 px-3 py-1 rounded-full hover:bg-rose-500/20 flex items-center space-x-1.5"
              >
                <span className="capitalize">{key.replace('_', ' ')}: {value}</span>
                <FiX className="w-3 h-3 text-rose-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="py-20 text-center">
          <div className="inline-block w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
          <p className="text-slate-400 text-sm font-semibold">Fetching cinema catalog...</p>
        </div>
      )}

      {error && (
        <div className="max-w-md mx-auto my-12 p-6 glass-panel border border-rose-500/30 rounded-2xl text-center">
          <p className="text-rose-400 font-bold mb-2">Unable to load movies</p>
          <p className="text-slate-400 text-xs mb-4">{error}</p>
          <button onClick={fetchMovies} className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl">
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && movies.length === 0 && (
        <div className="text-center py-20 glass-panel max-w-xl mx-auto rounded-3xl border border-slate-800 my-8">
          <FiFilm className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No Movies Found</h3>
          <p className="text-slate-400 text-sm mb-6">No titles match your selected filters or search terms.</p>
          <button onClick={clearFilters} className="px-6 py-2.5 bg-rose-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-rose-600/30">
            Clear Filters & Search
          </button>
        </div>
      )}

      {/* 🖼️ Movie Cards Grid */}
      {!loading && !error && movies.length > 0 && (
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {currentMovies.map(movie => (
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
                      decoding="async"
                      className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-600">
                      <FiFilm className="w-16 h-16 mb-2 stroke-[1.5]" />
                      <span className="text-xs font-semibold uppercase tracking-wider">No Poster</span>
                    </div>
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/40 opacity-80" />

                  {/* Watchlist Heart Button */}
                  <div className="absolute top-3 right-3 z-10">
                    <WatchlistButton movieId={movie.id} />
                  </div>

                  {/* Language Badge */}
                  {movie.language && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-900/80 backdrop-blur-md border border-slate-700/80 text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                      {movie.language}
                    </div>
                  )}
                </div>

                {/* Movie Info Details */}
                <div className="p-6">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-2xl font-bold font-display text-white leading-snug group-hover:text-rose-400 transition-colors">
                      {movie.title}
                    </h3>
                    <div className="shrink-0 pt-0.5">
                      <MovieRating average={movie.average_rating} count={movie.review_count} />
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-xs font-medium text-slate-400 mb-3">
                    <span className="text-rose-400 font-semibold">{movie.genre}</span>
                    <span>•</span>
                    <div className="flex items-center space-x-1">
                      <FiClock className="w-3.5 h-3.5 text-slate-500" />
                      <span>
                        {movie.duration_minutes
                          ? `${Math.floor(movie.duration_minutes / 60)}h ${movie.duration_minutes % 60}m`
                          : '120m'}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-400 text-xs line-clamp-2 mb-6 leading-relaxed">
                    {movie.description || 'No detailed description available for this title.'}
                  </p>
                </div>
              </div>

              {/* Action Button Footer */}
              <div className="px-6 pb-6 pt-0">
                <Link
                  to={`/movies/${movie.slug || movie.id}`}
                  className="w-full inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-rose-600/20 group-hover:shadow-rose-600/40 transition-all text-sm"
                >
                  <span>Book Showtimes</span>
                  <FiChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-12 mb-6">
          <div className="glass-panel p-1.5 rounded-2xl border border-slate-800 flex space-x-1.5">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                  currentPage === i + 1
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Movies;
