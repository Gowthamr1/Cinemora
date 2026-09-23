import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';

/**
 * The set of movie ids the current user has saved, loaded once per login.
 *
 * Every heart on the catalogue reads its state from here rather than asking the
 * server per card, and `toggle` updates the shared set so a save made on the
 * movie page is already reflected when you scroll back to the grid.
 *
 * Watchlist is a customer feature: door staff have nothing to save, so the set
 * stays empty for them and the buttons never render (see WatchlistButton).
 */
const WatchlistContext = createContext();

const canHaveWatchlist = (user) => Boolean(user) && user.role !== 'STAFF';

export const WatchlistProvider = ({ children }) => {
  const { user } = useAuth();
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [ready, setReady] = useState(false);

  // Load the id set when a customer signs in; clear it on logout so the next
  // user never sees the previous one's hearts.
  useEffect(() => {
    let cancelled = false;
    if (!canHaveWatchlist(user)) {
      setSavedIds(new Set());
      setReady(false);
      return undefined;
    }
    api.get('/watchlist/ids/')
      .then((res) => {
        if (!cancelled) setSavedIds(new Set(res.data.movie_ids || []));
      })
      .catch(() => {
        if (!cancelled) setSavedIds(new Set());
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, [user]);

  const isSaved = useCallback((movieId) => savedIds.has(movieId), [savedIds]);

  // Flip one movie optimistically, then reconcile with the server's answer so
  // the heart feels instant but can't end up disagreeing with the database.
  const flip = (movieId) => setSavedIds((prev) => {
    const next = new Set(prev);
    if (next.has(movieId)) next.delete(movieId); else next.add(movieId);
    return next;
  });

  const toggle = useCallback(async (movieId) => {
    if (!movieId) return undefined;
    flip(movieId);
    try {
      const res = await api.post('/watchlist/toggle/', { movie_id: movieId });
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (res.data.saved) next.add(movieId); else next.delete(movieId);
        return next;
      });
      return res.data.saved;
    } catch (err) {
      flip(movieId);  // undo the optimistic change
      throw err;
    }
  }, []);

  const value = {
    savedIds,
    count: savedIds.size,
    enabled: canHaveWatchlist(user),
    ready,
    isSaved,
    toggle,
  };

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  );
};

export const useWatchlist = () => {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
};

export default WatchlistContext;
