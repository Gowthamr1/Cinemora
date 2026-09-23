/**
 * Hand-rolled chart primitives with Cinematic Dark Glass theme integration.
 */
import React, { useState } from 'react';

/* One hue per measure, tailored for vibrant cinematic contrast on dark surfaces. */
export const VIZ = {
  revenue: '#F59E0B',    // Amber Gold
  bookings: '#E11D48',   // Crimson Rose
  seats: '#10B981',      // Emerald Green
  occupancy: '#8B5CF6',  // Purple Indigo
  // Chrome & ink for dark theme.
  surface: '#0F172A',
  grid: '#1E293B',
  axis: '#334155',
  muted: '#94A3B8',
  ink: '#F8FAFC',
  inkSoft: '#CBD5E1',
  track: '#1E293B',
};

export const STATUS_COLORS = {
  CONFIRMED: '#10B981',
  PENDING: '#F59E0B',
  COMPLETED: '#3B82F6',
  CANCELLED: '#E11D48',
  EXPIRED: '#64748B',
};

export const money = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const compact = (n) => {
  const v = Number(n) || 0;
  const trim = (x) => `${x.toFixed(1).replace(/\.0$/, '')}`;
  if (Math.abs(v) >= 1e6) return `${trim(v / 1e6)}M`;
  if (Math.abs(v) >= 1e3) return `${trim(v / 1e3)}k`;
  return `${Math.round(v * 100) / 100}`;
};

export const moneyCompact = (n) => `$${compact(n)}`;

export const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const niceMax = (max) => {
  if (!(max > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  const n = max / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
};

/* Table View Component */
const DataTable = ({ head, rows }) => (
  <div className="overflow-x-auto -mx-1">
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-400 border-b border-slate-800">
          {head.map((h, i) => (
            <th key={h} className={`py-2.5 px-2 font-bold uppercase tracking-wider ${i ? 'text-right' : ''}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums divide-y divide-slate-800/60">
        {rows.length === 0 ? (
          <tr><td colSpan={head.length} className="py-4 px-2 text-slate-500">No data recorded yet.</td></tr>
        ) : rows.map((row, r) => (
          <tr key={r} className="hover:bg-slate-800/40 transition-colors">
            {row.map((cell, c) => (
              <td key={c} className={`py-2.5 px-2 ${c ? 'text-right font-medium text-slate-300' : 'text-white font-semibold'}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const ChartCard = ({ title, subtitle, table, aside, children, className = '' }) => {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`glass-card p-6 sm:p-7 rounded-3xl border border-slate-800 shadow-2xl ${className}`}>
      <div className="flex justify-between items-start gap-3 mb-6">
        <div className="min-w-0">
          <h3 className="text-xl font-bold font-display text-white tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-1 font-medium">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {aside}
          {table && (
            <button
              type="button"
              onClick={() => setAsTable((v) => !v)}
              aria-pressed={asTable}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 transition-all font-bold"
            >
              {asTable ? 'Visual Chart' : 'Data Table'}
            </button>
          )}
        </div>
      </div>
      {asTable && table ? <DataTable {...table} /> : children}
    </section>
  );
};

/* Time Series SVG Chart */
const W = 760;
const PAD = { l: 52, r: 18, t: 18, b: 26 };

export const TimeSeriesChart = ({
  series, valueKey, color, height = 230, format = compact, tip, variant = 'area',
}) => {
  const [hover, setHover] = useState(null);

  if (!series || series.length === 0) {
    return <p className="text-xs text-slate-500 py-8 text-center">No dataset recorded in this range.</p>;
  }

  const H = height;
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const max = niceMax(Math.max(...series.map((d) => Number(d[valueKey]) || 0)));

  const isColumn = variant === 'column';
  const band = innerW / series.length;
  const step = innerW / Math.max(series.length - 1, 1);
  const x = (i) => (isColumn ? PAD.l + band * (i + 0.5) : PAD.l + i * step);
  const y = (v) => PAD.t + innerH - ((Number(v) || 0) / max) * innerH;
  const base = PAD.t + innerH;

  const barW = Math.max(3, Math.min(24, band - 2));
  const labelEvery = Math.max(1, Math.ceil(series.length / 6));

  const line = series
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(d[valueKey]).toFixed(2)}`)
    .join(' ');
  const area = `${line} L ${x(series.length - 1).toFixed(2)} ${base} L ${x(0).toFixed(2)} ${base} Z`;

  const last = series[series.length - 1];
  const hovered = hover === null ? null : series[hover];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H + 30 }} role="img">
        <defs>
          <linearGradient id={`wash-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Hairline Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * t)} y2={y(max * t)}
              stroke={t === 0 ? '#334155' : '#1E293B'} strokeWidth="1" strokeDasharray={t === 0 ? '' : '3 3'} />
            <text x={PAD.l - 8} y={y(max * t) + 4} textAnchor="end" fontSize="11"
              fill="#94A3B8" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              {format(max * t)}
            </text>
          </g>
        ))}

        {isColumn ? (
          series.map((d, i) => {
            const v = Number(d[valueKey]) || 0;
            const h = base - y(v);
            return v > 0 ? (
              <rect key={d.date} x={x(i) - barW / 2} y={y(v)} width={barW}
                height={Math.max(h, 2)} rx="4" ry="4" fill={color}
                opacity={hover === null || hover === i ? 1 : 0.4} />
            ) : null;
          })
        ) : (
          <>
            <path d={area} fill={`url(#wash-${valueKey})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="3"
              strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}

        {/* Hover pointer line */}
        {hovered && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={base}
            stroke="#64748B" strokeWidth="1.5" strokeDasharray="3 3" />
        )}
        {!isColumn && (
          <circle cx={x(series.length - 1)} cy={y(last[valueKey])} r="5"
            fill={color} stroke="#0F172A" strokeWidth="2" />
        )}
        {hovered && !isColumn && (
          <circle cx={x(hover)} cy={y(hovered[valueKey])} r="6"
            fill={color} stroke="#FFFFFF" strokeWidth="2" />
        )}
        {!isColumn && Number(last[valueKey]) > 0 && (
          <text x={W - PAD.r} y={Math.max(PAD.t + 10, y(last[valueKey]) - 10)}
            textAnchor="end" fontSize="12" fontWeight="700" fill="#F8FAFC">
            {format(last[valueKey])}
          </text>
        )}

        {/* Hit areas */}
        {series.map((d, i) => (
          <g key={`hit-${d.date}`}>
            <rect x={PAD.l + (isColumn ? band * i : step * i - step / 2)} y={PAD.t}
              width={isColumn ? band : step} height={innerH} fill="transparent"
              tabIndex={0} role="button" aria-label={`${d.date}: ${format(d[valueKey])}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#94A3B8" fontWeight="600">
                {shortDate(d.date)}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute -top-1 bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 shadow-2xl whitespace-nowrap z-20"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(${hover > series.length / 2 ? '-100%' : '0'})`,
          }}
        >
          <div className="font-bold text-amber-300">{shortDate(hovered.date)}</div>
          <div className="text-slate-200 font-semibold">{tip ? tip(hovered) : format(hovered[valueKey])}</div>
        </div>
      )}
    </div>
  );
};

/* Ranked Horizontal Bars */
export const BarList = ({ items, max, emptyText = 'Nothing to show yet.' }) => {
  const [hover, setHover] = useState(null);
  if (!items || items.length === 0) {
    return <p className="text-xs text-slate-500 py-4 text-center">{emptyText}</p>;
  }
  const top = max || Math.max(...items.map((i) => Number(i.value) || 0), 1);

  return (
    <ul className="space-y-4">
      {items.map((item, i) => (
        <li
          key={item.key}
          className="relative"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          <div className="flex items-center gap-3">
            {item.media}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline gap-3 mb-1.5">
                <span className="text-sm font-bold text-white truncate">
                  {item.rank && <span className="text-slate-400 font-semibold mr-1.5">{item.rank}</span>}
                  {item.label}
                </span>
                <span className="text-xs font-black text-amber-400 whitespace-nowrap tabular-nums">
                  {item.display}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(((Number(item.value) || 0) / top) * 100, item.value > 0 ? 2 : 0)}%`,
                    backgroundColor: item.color,
                    opacity: hover === null || hover === i ? 1 : 0.5,
                  }}
                />
              </div>
              {item.sublabel && (
                <p className="text-[11px] text-slate-400 mt-1 truncate">{item.sublabel}</p>
              )}
            </div>
          </div>

          {hover === i && item.tip && (
            <div className="pointer-events-none absolute right-0 -top-1 z-20 bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 shadow-2xl whitespace-nowrap">
              {item.tip}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};

/* Figures */
export const HeroFigure = ({ label, value, sub }) => (
  <div>
    <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">{label}</p>
    <p className="text-4xl sm:text-5xl font-black text-white leading-tight font-display mt-1 bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">{value}</p>
    {sub && <p className="text-xs font-semibold text-slate-400 mt-1.5">{sub}</p>}
  </div>
);

export const StatTile = ({ label, value, sub, meter, color = VIZ.revenue }) => (
  <div className="glass-panel p-5 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between">
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold">{label}</p>
      <p className="text-2xl sm:text-3xl font-black text-white font-display mt-1">{value}</p>
    </div>
    <div>
      {typeof meter === 'number' && (
        <div className="h-2 w-full rounded-full mt-3 overflow-hidden bg-slate-900 border border-slate-800">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, meter))}%`, backgroundColor: color }} />
        </div>
      )}
      {sub && <p className="text-[11px] text-slate-400 font-medium mt-2">{sub}</p>}
    </div>
  </div>
);

/* Heatmap Grid Component */
export const hourLabel = (h) => {
  const suffix = h < 12 ? 'a' : 'p';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
};

export const Heatmap = ({ cells, color = VIZ.revenue, format = compact, emptyText }) => {
  const [hover, setHover] = useState(null);
  if (!cells || cells.length === 0) {
    return <p className="text-xs text-slate-500 py-6 text-center">{emptyText || 'No data available.'}</p>;
  }

  const hours = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
  const max = Math.max(...cells.map((c) => Number(c.value) || 0), 1);
  const byCell = new Map(cells.map((c) => [`${c.weekday}-${c.hour}`, c]));

  return (
    <div className="overflow-x-auto py-2">
      <div className="inline-block min-w-full">
        <div className="flex gap-1.5 mb-2 pl-12">
          {hours.map((h) => (
            <div key={h} className="w-8 text-center text-[10px] font-bold text-slate-400 tabular-nums">
              {hourLabel(h)}
            </div>
          ))}
        </div>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, row) => {
          const weekday = row + 1;
          return (
            <div key={label} className="flex gap-1.5 mb-1.5 items-center">
              <div className="w-10 text-xs font-bold text-slate-400 text-right pr-2">{label}</div>
              {hours.map((h) => {
                const cell = byCell.get(`${weekday}-${h}`);
                const value = Number(cell?.value) || 0;
                const key = `${weekday}-${h}`;
                const intensity = value > 0 ? 0.2 + 0.8 * (value / max) : 0;
                return (
                  <div
                    key={h}
                    className="w-8 h-8 rounded-lg flex items-center justify-center relative transition-all border border-slate-800/50"
                    style={{
                      backgroundColor: value > 0 ? color : '#0F172A',
                      opacity: value > 0 ? intensity : 0.6,
                    }}
                    onMouseEnter={() => setHover(key)}
                    onMouseLeave={() => setHover(null)}
                    tabIndex={cell ? 0 : -1}
                    role={cell ? 'button' : undefined}
                  >
                    {hover === key && cell && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 shadow-2xl whitespace-nowrap">
                        {cell.tip || `${label} ${hourLabel(h)} · ${format(value)}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="flex items-center gap-3 mt-4 pl-12 text-[11px] font-bold text-slate-400">
          <span>Low Revenue</span>
          {[0.2, 0.4, 0.6, 0.8, 1].map((t) => (
            <span key={t} className="w-5 h-3 rounded-md"
              style={{ backgroundColor: color, opacity: 0.2 + 0.8 * t }} />
          ))}
          <span>Peak Slot</span>
        </div>
      </div>
    </div>
  );
};
