import React, { useState } from 'react';
import { useWatchlist } from '../contexts/WatchlistContext';

const HeartIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5"
       fill={filled ? 'currentColor' : 'none'}
       stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 21s-6.716-4.35-9.428-8.06C.86 10.66 1.1 7.5 3.5 6.09c1.94-1.14 4.22-.5 5.5 1.06L12 9l3-1.85c1.28-1.56 3.56-2.2 5.5-1.06 2.4 1.41 2.64 4.57.928 6.85C18.716 16.65 12 21 12 21z" />
  </svg>
);

const WatchlistButton = ({ movieId, variant = 'icon', className = '' }) => {
  const { enabled, isSaved, toggle } = useWatchlist();
  const [busy, setBusy] = useState(false);

  if (!enabled || !movieId) return null;

  const saved = isSaved(movieId);

  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await toggle(movieId);
    } catch {
      /* Handled by context */
    } finally {
      setBusy(false);
    }
  };

  const label = saved ? 'Remove from watchlist' : 'Add to watchlist';

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={saved}
        title={label}
        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border text-xs font-bold transition-all shadow-md disabled:opacity-60 ${
          saved
            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-600 hover:text-white'
            : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-rose-500 hover:text-white'
        } ${className}`}
      >
        <HeartIcon filled={saved} />
        <span>{saved ? 'In Your Watchlist' : 'Add to Watchlist'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full shadow-lg backdrop-blur-md transition-all disabled:opacity-60 ${
        saved
          ? 'bg-rose-600 text-white shadow-rose-600/30'
          : 'bg-slate-950/70 text-slate-300 hover:text-white hover:bg-slate-950/90 border border-slate-800'
      } ${className}`}
    >
      <HeartIcon filled={saved} />
    </button>
  );
};

export default WatchlistButton;
