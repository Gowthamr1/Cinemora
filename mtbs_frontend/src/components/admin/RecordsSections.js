import React, { useMemo, useState } from 'react';
import { EmptyState, SectionHeader } from './ui';
import { FiSearch } from 'react-icons/fi';

const STATUS_STYLES = {
  CONFIRMED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  SUCCESS: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  REFUNDED: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  PENDING: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  COMPLETED: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  CANCELLED: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  FAILED: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  EXPIRED: 'bg-slate-800 text-slate-400 border-slate-700',
};

export const Pill = ({ value, label }) => (
  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase border tracking-wider ${STATUS_STYLES[value] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
    {label || value || '—'}
  </span>
);

const Th = ({ children }) => (
  <th className="px-4 py-3 text-left font-extrabold uppercase tracking-wider text-slate-400 text-[11px] whitespace-nowrap">{children}</th>
);
const Td = ({ children, className = '' }) => (
  <td className={`px-4 py-3 border-t border-slate-800/80 text-xs text-slate-300 ${className}`}>{children}</td>
);

export const BookingsSection = ({ bookings, onBack }) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');

  const shown = useMemo(() => bookings.filter((b) =>
    (search === '' || String(b.user || '').toLowerCase().includes(search.toLowerCase())
      || String(b.showtime_title || '').toLowerCase().includes(search.toLowerCase()))
    && (status === 'ALL' || b.status === status)
  ), [bookings, search, status]);

  const seatsSold = shown.reduce((n, b) => n + (b.seats?.length || b.num_seats || 0), 0);

  return (
    <div className="space-y-6">
      <SectionHeader title="Bookings Ledger"
        subtitle={`${shown.length} of ${bookings.length} shown · ${seatsSold} seats reserved`} onBack={onBack} />

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input placeholder="Search user or movie..." className="bg-slate-900 border border-slate-800 focus:border-rose-500 text-white pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="bg-slate-900 border border-slate-800 focus:border-rose-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold outline-none" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All booking statuses</option>
          <option value="PENDING">Pending Payment</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="🎟" title="No bookings to show"
          hint={bookings.length ? 'Try clearing search filters.' : 'Bookings appear here once users reserve seats.'} />
      ) : (
        <div className="overflow-x-auto glass-panel border border-slate-800 rounded-3xl shadow-xl">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800">
              <tr><Th>ID</Th><Th>User</Th><Th>Movie</Th><Th>Time</Th><Th>Seats</Th><Th>Status</Th><Th>Refund</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {shown.map((b) => (
                <tr key={b.id} className="hover:bg-slate-800/40 transition-colors">
                  <Td className="text-slate-500 font-mono">#{b.id}</Td>
                  <Td className="font-bold text-white">{b.user}</Td>
                  <Td className="font-semibold text-rose-400">{b.showtime_title}</Td>
                  <Td className="whitespace-nowrap">{b.start_time ? new Date(b.start_time).toLocaleString() : '—'}</Td>
                  <Td className="font-mono font-bold text-amber-400">
                    {b.seat_labels?.length ? b.seat_labels.join(', ')
                      : b.seats?.length ? b.seats.join(', ') : b.num_seats}
                  </Td>
                  <Td><Pill value={b.status} label={b.status_display} /></Td>
                  <Td className="whitespace-nowrap text-slate-400">
                    {b.refund && b.refund.status !== 'NONE'
                      ? `${b.refund.status_display} · $${Number(b.refund.amount || 0).toFixed(2)}`
                      : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const PaymentsSection = ({ payments, onBack }) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');

  const shown = useMemo(() => payments.filter((p) =>
    (search === '' || String(p.user || '').toLowerCase().includes(search.toLowerCase()))
    && (status === 'ALL' || p.status === status)
  ), [payments, search, status]);

  const successful = shown.filter((p) => p.status === 'SUCCESS');
  const total = successful.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const refunded = successful.reduce((sum, p) => sum + Number(p.refund_amount || 0), 0);
  const money = refunded
    ? `$${(total - refunded).toFixed(2)} net ($${total.toFixed(2)} collected − $${refunded.toFixed(2)} refunded)`
    : `$${total.toFixed(2)} collected`;

  return (
    <div className="space-y-6">
      <SectionHeader title="Payment Transactions"
        subtitle={`${shown.length} of ${payments.length} shown · ${money}`}
        onBack={onBack} />

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input placeholder="Search by user..." className="bg-slate-900 border border-slate-800 focus:border-rose-500 text-white pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="bg-slate-900 border border-slate-800 focus:border-rose-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold outline-none" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All payment statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="💳" title="No payments to show"
          hint={payments.length ? 'Try clearing search filters.' : 'Payments appear here once users check out.'} />
      ) : (
        <div className="overflow-x-auto glass-panel border border-slate-800 rounded-3xl shadow-xl">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800">
              <tr><Th>ID</Th><Th>User</Th><Th>Booking</Th><Th>Amount</Th><Th>Status</Th><Th>Refund</Th><Th>Net</Th><Th>Time</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {shown.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                  <Td className="text-slate-500 font-mono">#{p.id}</Td>
                  <Td className="font-bold text-white">{p.user}</Td>
                  <Td className="font-mono text-amber-400">#{p.booking_id}</Td>
                  <Td className="font-extrabold text-white">${Number(p.amount || 0).toFixed(2)}</Td>
                  <Td><Pill value={p.status} /></Td>
                  <Td className="whitespace-nowrap">
                    {p.refund_status && p.refund_status !== 'NONE' ? (
                      <span className="text-cyan-400 font-semibold">
                        {p.refund_status_display || p.refund_status} · ${Number(p.refund_amount || 0).toFixed(2)}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </Td>
                  <Td className="font-black text-emerald-400">
                    ${Number(p.net_amount ?? p.amount ?? 0).toFixed(2)}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-400">{p.timestamp ? new Date(p.timestamp).toLocaleString() : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
