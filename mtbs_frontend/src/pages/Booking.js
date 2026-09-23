import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { useShowtimeSeats } from '../hooks/useShowtimeSeats';
import { FiTv, FiClock, FiMapPin, FiCheck, FiAlertCircle, FiArrowRight, FiShield } from 'react-icons/fi';
import { motion } from 'framer-motion';

const Booking = () => {
  const { id } = useParams();
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showtime, setShowtime] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { bookedSeats, seatsAvailable, live } = useShowtimeSeats(id);

  useEffect(() => {
    axios.get(`/showtimes/${id}/`)
      .then(res => setShowtime(res.data))
      .catch(() => setError('Failed to load showtime info.'));
  }, [id]);

  const takenSeats = useMemo(
    () => new Set(bookedSeats ?? showtime?.booked_seats ?? []),
    [bookedSeats, showtime]
  );

  const layout = showtime?.seat_layout || { rows: 0, seats_per_row: 0, row_labels: [] };
  const hasLayout = layout.rows > 0 && layout.seats_per_row > 0;
  
  const seatLabel = useCallback((index) => {
    if (!hasLayout) return index;
    const row = Math.floor((index - 1) / layout.seats_per_row);
    const col = ((index - 1) % layout.seats_per_row) + 1;
    return layout.row_labels[row] ? `${layout.row_labels[row]}${col}` : index;
  }, [hasLayout, layout.seats_per_row, layout.row_labels]);

  useEffect(() => {
    const lost = selectedSeats.filter((s) => takenSeats.has(s));
    if (lost.length === 0) return;
    setSelectedSeats((prev) => prev.filter((s) => !takenSeats.has(s)));
    setNotice(
      `Seat${lost.length > 1 ? 's' : ''} ${lost.map(seatLabel).join(', ')} ${
        lost.length > 1 ? 'were' : 'was'} just booked by someone else.`
    );
  }, [takenSeats, selectedSeats, seatLabel]);

  const toggleSeat = (seatNumber) => {
    setNotice('');
    setSelectedSeats(prev =>
      prev.includes(seatNumber)
        ? prev.filter(s => s !== seatNumber)
        : [...prev, seatNumber]
    );
  };

  const handleBooking = async () => {
    if (selectedSeats.length === 0) {
      setError('Please select at least one seat.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await axios.post('/bookings/', {
        showtime: parseInt(id),
        seats: selectedSeats,
      });

      if (response.status === 201) {
        navigate(`/payment/${response.data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  if (!showtime) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-semibold">Loading interactive seat layout...</p>
      </div>
    );
  }

  const totalSeats = showtime.total_seats || showtime.seats_available;
  const availableCount = seatsAvailable ?? showtime.seats_available;
  const pricePerSeat = Number(showtime.price ?? 10);
  const totalPrice = selectedSeats.length * pricePerSeat;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-4xl mx-auto">
        
        {/* Header Bar */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs font-bold border border-rose-500/20 uppercase tracking-wider">
                  Real-time Booking
                </span>
                <span
                  title={live ? 'Live socket connected' : 'Reconnecting...'}
                  className={`inline-flex items-center space-x-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${
                    live
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{live ? 'Live Sync' : 'Reconnecting'}</span>
                </span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-black font-display text-white tracking-tight">
                {showtime.movie.title}
              </h1>
              
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2 font-medium">
                {showtime.theatre && (
                  <span className="flex items-center space-x-1">
                    <FiMapPin className="w-3.5 h-3.5 text-rose-500" />
                    <span>{showtime.theatre.name}, {showtime.theatre.city}</span>
                  </span>
                )}
                {showtime.screen_number && (
                  <span>Screen {showtime.screen_number}</span>
                )}
                <span className="flex items-center space-x-1">
                  <FiClock className="w-3.5 h-3.5 text-amber-400" />
                  <span>{new Date(showtime.start_time).toLocaleString()}</span>
                </span>
              </div>
            </div>

            <div className="text-right sm:border-l sm:border-slate-800 sm:pl-6">
              <p className="text-xs text-slate-400 uppercase font-semibold">Ticket Price</p>
              <p className="text-2xl font-black text-emerald-400 font-display">${pricePerSeat.toFixed(2)}</p>
              <p className="text-xs text-slate-500">{availableCount} seats left</p>
            </div>
          </div>
        </div>

        {/* Notices & Errors */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl glass-panel border border-rose-500/40 text-rose-400 text-sm flex items-center space-x-3">
            <FiAlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="mb-6 p-4 rounded-2xl glass-panel border border-amber-500/40 text-amber-300 text-sm flex items-center space-x-3">
            <FiAlertCircle className="w-5 h-5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* 🎬 Theater Layout & Seats */}
        <div className="glass-panel p-6 sm:p-10 rounded-3xl border border-slate-800 shadow-2xl mb-8 relative overflow-hidden">
          
          {/* Curved Theater Screen Header */}
          <div className="mb-12 text-center relative">
            <div className="theater-screen-curve mb-3" />
            <span className="text-[11px] font-extrabold uppercase tracking-[0.3em] text-slate-400">
              SCREEN THIS WAY
            </span>
          </div>

          {/* Seat Grid */}
          {hasLayout ? (
            <div className="my-8 overflow-x-auto pb-4">
              <div className="inline-block min-w-full text-center">
                {layout.row_labels.map((rowLetter, rowIndex) => (
                  <div key={rowLetter} className="flex items-center justify-center gap-2 sm:gap-3 mb-3">
                    <span className="w-6 text-xs font-bold text-slate-400 text-right">{rowLetter}</span>
                    <div className="flex gap-2">
                      {Array.from({ length: layout.seats_per_row }).map((_, colIndex) => {
                        const seatNumber = rowIndex * layout.seats_per_row + colIndex + 1;
                        if (seatNumber > totalSeats) return null;
                        const isTaken = takenSeats.has(seatNumber);
                        const isSelected = selectedSeats.includes(seatNumber);
                        return (
                          <button
                            key={seatNumber}
                            type="button"
                            title={`Seat ${rowLetter}${colIndex + 1}`}
                            disabled={isTaken}
                            onClick={() => toggleSeat(seatNumber)}
                            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-t-xl text-xs font-bold transition-all duration-200 flex items-center justify-center ${
                              isTaken
                                ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                                : isSelected
                                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40 border border-rose-400 scale-105'
                                  : 'bg-slate-900 text-slate-300 border border-slate-700/80 hover:border-rose-500 hover:text-white hover:scale-105'
                            }`}
                          >
                            {colIndex + 1}
                          </button>
                        );
                      })}
                    </div>
                    <span className="w-6 text-xs font-bold text-slate-400 text-left">{rowLetter}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 my-8">
              {Array.from({ length: totalSeats }).map((_, i) => {
                const seatNumber = i + 1;
                const isTaken = takenSeats.has(seatNumber);
                const isSelected = selectedSeats.includes(seatNumber);
                return (
                  <button
                    key={seatNumber}
                    type="button"
                    disabled={isTaken}
                    onClick={() => toggleSeat(seatNumber)}
                    className={`w-10 h-10 rounded-t-xl text-xs font-bold transition-all duration-200 flex items-center justify-center ${
                      isTaken
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                        : isSelected
                          ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40 border border-rose-400 scale-105'
                          : 'bg-slate-900 text-slate-300 border border-slate-700/80 hover:border-rose-500 hover:text-white hover:scale-105'
                    }`}
                  >
                    {seatNumber}
                  </button>
                );
              })}
            </div>
          )}

          {/* Seat Map Legend */}
          <div className="flex justify-center flex-wrap gap-6 text-xs font-semibold text-slate-400 pt-6 border-t border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="w-4 h-4 rounded-t-md bg-slate-900 border border-slate-700 inline-block" />
              <span>Available</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-4 h-4 rounded-t-md bg-rose-600 border border-rose-400 inline-block" />
              <span>Selected</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-4 h-4 rounded-t-md bg-slate-800 border border-slate-800 inline-block" />
              <span>Booked</span>
            </div>
          </div>

        </div>

        {/* 💳 Checkout & Summary Footer Bar */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold">Selection Summary</p>
            <p className="text-xl font-bold text-white">
              {selectedSeats.length > 0 ? (
                <>
                  <span className="text-rose-400">{selectedSeats.length}</span> Seat(s) Selected: {' '}
                  <span className="text-slate-300 font-mono text-sm">
                    {[...selectedSeats].sort((a, b) => a - b).map(seatLabel).join(', ')}
                  </span>
                </>
              ) : (
                <span className="text-slate-500 font-normal text-sm">No seats selected yet</span>
              )}
            </p>
          </div>

          <div className="flex items-center space-x-6 w-full sm:w-auto justify-between sm:justify-end">
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase font-semibold">Total Amount</p>
              <p className="text-2xl font-black text-emerald-400 font-display">${totalPrice.toFixed(2)}</p>
            </div>

            <button
              onClick={handleBooking}
              disabled={loading || selectedSeats.length === 0}
              className={`px-8 py-4 rounded-2xl font-extrabold text-sm flex items-center space-x-3 transition-all ${
                loading || selectedSeats.length === 0
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 text-white shadow-xl shadow-rose-600/30 hover:shadow-rose-600/50 hover:scale-105'
              }`}
            >
              <span>{loading ? 'Securing Seats...' : 'Proceed to Checkout'}</span>
              <FiArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Booking;
