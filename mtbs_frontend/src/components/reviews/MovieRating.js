import React from 'react';
import StarRating from './StarRating';

const MovieRating = ({ average, count = 0, size = 'sm' }) => {
  if (!count) {
    return <span className="text-xs text-slate-500 font-medium whitespace-nowrap">No reviews yet</span>;
  }

  const value = Number(average) || 0;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap"
          aria-label={`${value.toFixed(1)} out of 5, ${count} review${count === 1 ? '' : 's'}`}>
      <span aria-hidden="true" className="inline-flex items-center gap-1.5">
        <StarRating value={value} size={size} />
        <span className="text-xs font-bold text-amber-400">{value.toFixed(1)}</span>
        <span className="text-xs font-semibold text-slate-400">({count})</span>
      </span>
    </span>
  );
};

export default MovieRating;
