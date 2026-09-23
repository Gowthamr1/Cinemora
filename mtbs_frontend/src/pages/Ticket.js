import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import axios from '../api/axios';
import { FiArrowLeft, FiMapPin,FiAlertCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';

const SCANNABLE = ['CONFIRMED', 'COMPLETED'];

const STATUS_STYLES = {
  CONFIRMED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  PENDING: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  COMPLETED: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  CANCELLED: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  EXPIRED: 'bg-slate-800 text-slate-400 border-slate-700',
};

const dateOf = (iso) => new Date(iso).toLocaleDateString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
});

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-US', {
  hour: 'numeric', minute: '2-digit', hour12: true,
});

const Ticket = () => {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    axios.get(`/bookings/${bookingId}/`)
      .then((res) => { if (!cancelled) setBooking(res.data); })
      .catch(() => {
        if (!cancelled) setError('Ticket not found.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookingId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-semibold">Generating digital pass...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-3xl max-w-md text-center border border-rose-500/30">
          <FiAlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <p className="text-rose-400 font-bold mb-4">{error || 'Ticket not found.'}</p>
          <Link to="/dashboard" className="px-6 py-2.5 bg-slate-800 text-white font-bold text-xs rounded-xl inline-block">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const scannable = SCANNABLE.includes(booking.status);
  const seats = booking.seat_labels?.length ? booking.seat_labels : (booking.seats || []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-md mx-auto space-y-6">
        
        <Link
          to="/dashboard"
          className="inline-flex items-center space-x-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <FiArrowLeft className="w-4 h-4" />
          <span>Back to My Bookings</span>
        </Link>

        {/* Cinematic Ticket Stub */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-3xl border border-slate-800 shadow-2xl overflow-hidden relative"
        >
          {/* Ticket Header */}
          <div className="p-6 sm:p-8 border-b border-dashed border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-extrabold uppercase tracking-widest border border-rose-500/20">
                Digital Entry Pass
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                STATUS_STYLES[booking.status] || 'bg-slate-800 text-slate-400'
              }`}>
                {booking.status_display || booking.status}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight">
              {booking.showtime_title}
            </h1>

            {booking.theatre_name && (
              <p className="text-xs font-semibold text-slate-400 flex items-center space-x-1.5">
                <FiMapPin className="w-3.5 h-3.5 text-rose-500" />
                <span>{booking.theatre_name}{booking.screen_number ? ` · Screen ${booking.screen_number}` : ''}</span>
              </p>
            )}

            {/* Stub Details Grid */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/80">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">Date</p>
                <p className="text-sm font-bold text-white mt-0.5">{dateOf(booking.start_time)}</p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">Show Time</p>
                <p className="text-sm font-bold text-white mt-0.5">{timeOf(booking.start_time)}</p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">Seats</p>
                <p className="text-sm font-bold text-rose-400 mt-0.5">
                  {seats.length ? seats.join(', ') : `${booking.num_seats} seat(s)`}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">Reference</p>
                <p className="text-sm font-mono font-bold text-amber-400 mt-0.5">{booking.reference}</p>
              </div>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="p-8 text-center bg-slate-900/90 flex flex-col items-center justify-center">
            {scannable ? (
              <>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-4">
                  Present QR code at gate scanner
                </p>

                <div className="p-4 bg-white rounded-2xl shadow-xl inline-block">
                  <QRCodeSVG
                    value={`BOOKING:${booking.reference}`}
                    size={160}
                    bgColor="#FFFFFF"
                    fgColor="#070A11"
                  />
                </div>

                <p className="mt-4 font-mono text-xs font-bold text-slate-400">
                  REF: {booking.reference}
                </p>
              </>
            ) : (
              <div className="py-4 text-center space-y-2">
                <FiAlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-xs text-slate-400 font-semibold max-w-xs mx-auto">
                  No gate QR entry code available for this booking status.
                </p>
              </div>
            )}
          </div>
        </motion.div>

      </div>
    </div>
  );
};

export default Ticket;
