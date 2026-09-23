import React from 'react';

const StarRating = ({ value = 0, size = 'base', onChange, label }) => {
  const rounded = Math.round(value);
  const sizes = { sm: 'text-sm', base: 'text-base', lg: 'text-2xl' };
  const cls = sizes[size] || sizes.base;

  if (!onChange) {
    return (
      <span className={`${cls} text-amber-400 leading-none inline-flex items-center gap-0.5`}
            role="img"
            aria-label={label || `${value} out of 5 stars`}>
        {'★'.repeat(rounded)}
        <span className="text-slate-700">{'★'.repeat(5 - rounded)}</span>
      </span>
    );
  }

  return (
    <span className={`${cls} leading-none inline-flex gap-1`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={n === value}
          className={`${n <= value ? 'text-amber-400' : 'text-slate-700'} hover:text-amber-300 transition-colors`}
        >
          ★
        </button>
      ))}
    </span>
  );
};

export default StarRating;
