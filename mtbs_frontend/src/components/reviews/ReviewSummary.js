import React from 'react';
import StarRating from './StarRating';

const LABELS = { 5: 'Excellent', 4: 'Good', 3: 'Average', 2: 'Poor', 1: 'Terrible' };

const ReviewSummary = ({ stats }) => {
  if (!stats) return null;

  const total = stats.total_reviews || 0;
  const average = Number(stats.average_rating) || 0;
  const dist = stats.rating_distribution || {};

  if (total === 0) {
    return (
      <div className="glass-panel border border-slate-800 rounded-3xl p-6 text-center text-slate-400">
        <p className="font-bold text-white text-base font-display">No reviews recorded yet.</p>
        <p className="text-xs text-slate-400 mt-1">
          Confirmed ticket holders can share their ratings & verdict first.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel border border-slate-800 rounded-3xl p-6 flex flex-col sm:flex-row gap-6 shadow-xl">
      <div className="text-center sm:border-r sm:border-slate-800 sm:pr-8 shrink-0 flex flex-col items-center justify-center">
        <div className="text-5xl font-black font-display text-white">{average.toFixed(1)}</div>
        <div className="mt-1">
          <StarRating value={average} size="lg" />
        </div>
        <div className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-wider">
          {total.toLocaleString()} Verified Review{total === 1 ? '' : 's'}
        </div>
      </div>

      <div className="flex-1 space-y-2">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = dist[String(star)] || 0;
          const percent = Math.round((count / total) * 100);
          return (
            <div key={star} className="flex items-center gap-3 text-xs font-semibold">
              <span className="w-10 text-amber-400 shrink-0 font-bold">{star} ★</span>
              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-full h-2.5 overflow-hidden">
                <div className="bg-gradient-to-r from-rose-600 to-amber-400 h-full rounded-full transition-all duration-500"
                     style={{ width: `${percent}%` }} />
              </div>
              <span className="w-10 text-right text-slate-300 font-bold tabular-nums shrink-0">{percent}%</span>
              <span className="w-20 text-slate-500 text-[11px] font-bold hidden sm:block">
                {LABELS[star]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReviewSummary;
