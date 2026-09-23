import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/axios';
import { asList } from '../utils/list';
import MovieRating from '../components/reviews/MovieRating';
import WatchlistButton from '../components/WatchlistButton';
import { useWatchlist } from '../contexts/WatchlistContext';
import { FiHeart, FiFilm, FiChevronRight, FiAlertCircle } from 'react-icons/fi';

const Watchlist = () => {
  const { savedIds } = useWatchlist();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchWatchlist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/watchlist/');
      setEntries(asList(res.data));
      setError('');
    } catch {
      setError('Failed to load your watchlist.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  const visible = entries.filter((e) => savedIds.has(e.movie.id));

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-semibold">Loading your watchlist...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-3xl max-w-md text-center border border-rose-500/30">
          <FiAlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <p className="text-rose-400 font-bold mb-2">{error}</p>
          <button onClick={fetchWatchlist} className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs font-bold border border-rose-500/20 uppercase tracking-widest mb-3">
            <FiHeart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            <span>Saved Movies</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black font-display text-white tracking-tight">
            YOUR <span className="bg-gradient-to-r from-rose-500 to-amber-400 bg-clip-text text-transparent">WATCHLIST</span>
          </h1>
          <p className="text-slate-400 text-base mt-2">
            {visible.length
              ? `${visible.length} movie${visible.length === 1 ? '' : 's'} saved for your next premiere.`
              : 'Keep track of upcoming films you want to see.'}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="glass-panel max-w-xl mx-auto text-center p-12 sm:p-16 rounded-3xl border border-slate-800 my-8">
            <FiFilm className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold font-display text-white mb-2">No Saved Movies</h3>
            <p className="text-slate-400 text-sm mb-8">
              Click the heart icon on any movie card in the catalog to save it to your personal watchlist.
            </p>
            <Link
              to="/movies"
              className="inline-flex items-center space-x-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold px-8 py-3.5 rounded-2xl text-sm shadow-xl shadow-rose-600/30 transition-all"
            >
              <span>Explore Movies Catalog</span>
              <FiChevronRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {visible.map(({ id, movie }) => (
              <div
                key={id}
                className="glass-card glass-card-hover rounded-3xl overflow-hidden border border-slate-800 flex flex-col justify-between group"
              >
                <div>
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-900">
                    {movie.poster_url ? (
                      <Link to={`/movies/${movie.slug || movie.id}`}>
                        <img
                          src={movie.poster_url}
                          alt={movie.title}
                          loading="lazy"
                          decoding="async"
                          className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                        />
                      </Link>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <FiFilm className="w-16 h-16" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/40 opacity-80 pointer-events-none" />

                    <div className="absolute top-3 right-3 z-10">
                      <WatchlistButton movieId={movie.id} />
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="text-2xl font-bold font-display text-white group-hover:text-rose-400 transition-colors">
                        {movie.title}
                      </h3>
                      <div className="shrink-0 pt-0.5">
                        <MovieRating average={movie.average_rating} count={movie.review_count} />
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-xs font-semibold text-slate-400 mb-3">
                      <span className="text-rose-400">{movie.genre}</span>
                      {movie.director && (
                        <>
                          <span>•</span>
                          <span>{movie.director}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-6 pb-6 pt-0">
                  <Link
                    to={`/movies/${movie.slug || movie.id}`}
                    className="w-full inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-rose-600/20 text-sm transition-all"
                  >
                    <span>View Showtimes</span>
                    <FiChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Watchlist;
