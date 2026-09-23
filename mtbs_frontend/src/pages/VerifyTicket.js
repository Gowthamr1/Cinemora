import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import axios from '../api/axios';
import { FiCheckCircle, FiXCircle, FiCamera,FiShield } from 'react-icons/fi';
import { motion } from 'framer-motion';

const READER_ID = 'ticket-qr-reader';

const VerifyTicket = () => {
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [busy, setBusy] = useState(false);

  const scannerRef = useRef(null);
  const busyRef = useRef(false);

  const check = useCallback(async (reference) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await axios.post('/bookings/verify/', { reference });
      setResult(res.data);
    } catch (err) {
      setResult({
        valid: false,
        code: 'ERROR',
        message: err.response?.status === 429
          ? 'Too many scans in a row. Wait a moment and try again.'
          : 'Could not reach the server.',
      });
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          if (scanner.getState() === Html5QrcodeScannerState.SCANNING) scanner.pause(true);
          check(decoded);
        },
        () => {},
      )
      .catch(() => {
        setCameraError(
          'Camera access unavailable or blocked. You can manually enter the booking reference code below.',
        );
      });

    return () => {
      if (scanner.getState && scanner.getState() !== Html5QrcodeScannerState.NOT_STARTED) {
        scanner.stop().catch(() => {}).finally(() => scanner.clear());
      }
    };
  }, [check]);

  const dismiss = () => {
    setResult(null);
    const scanner = scannerRef.current;
    if (scanner && scanner.getState() === Html5QrcodeScannerState.PAUSED) scanner.resume();
  };

  const submitManual = (e) => {
    e.preventDefault();
    if (manual.trim()) check(manual.trim());
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="glass-panel p-8 rounded-3xl border border-cyan-500/30 shadow-2xl relative overflow-hidden">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">
            <FiShield className="w-4 h-4" />
            <span>Gate Staff Scanner</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black font-display text-white tracking-tight">
            TICKET VERIFICATION
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Scan attendee QR passes or manually input reference codes for entry.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Live Camera Scanner */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold font-display text-white mb-4 flex items-center space-x-2">
                <FiCamera className="w-5 h-5 text-cyan-400" />
                <span>Live Camera Scanner</span>
              </h3>
              <div id={READER_ID} className="w-full aspect-square rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-inner" />
              {cameraError && (
                <p className="mt-3 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
                  {cameraError}
                </p>
              )}
            </div>
          </div>

          {/* Manual Entry & Result Box */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-6">
            <div>
              <h3 className="text-xl font-bold font-display text-white mb-4">
                Manual Code Entry
              </h3>

              <form onSubmit={submitManual} className="flex gap-2 mb-3">
                <input
                  value={manual}
                  onChange={(e) => setManual(e.target.value.toUpperCase())}
                  placeholder="BK1A2B3C4D5E"
                  className="flex-1 bg-slate-900 border border-slate-800 focus:border-cyan-400 text-white px-4 py-3 rounded-2xl text-sm font-mono uppercase tracking-wider outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || !manual.trim()}
                  className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm rounded-2xl shadow-lg shadow-cyan-600/30 transition-all disabled:opacity-50"
                >
                  {busy ? 'Verifying...' : 'Check'}
                </button>
              </form>

              <p className="text-[11px] text-slate-500">
                Codes are case-insensitive reference IDs printed on the pass.
              </p>

              {result && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`mt-6 p-6 rounded-2xl border ${
                    result.valid
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    {result.valid ? (
                      <FiCheckCircle className="w-8 h-8 text-emerald-400 shrink-0" />
                    ) : (
                      <FiXCircle className="w-8 h-8 text-rose-400 shrink-0" />
                    )}
                    <div>
                      <p className="text-xl font-extrabold font-display">
                        {result.valid ? 'VALID TICKET — ADMIT' : 'INVALID / REJECTED'}
                      </p>
                      <p className="text-xs font-semibold">{result.message}</p>
                    </div>
                  </div>

                  {result.booking && (
                    <div className="mt-4 pt-3 border-t border-slate-700/80 text-xs text-slate-300 space-y-1">
                      <p className="font-bold text-white text-sm">{result.booking.showtime_title}</p>
                      {result.booking.theatre_name && (
                        <p>{result.booking.theatre_name}{result.booking.screen_number ? ` · Screen ${result.booking.screen_number}` : ''}</p>
                      )}
                      <p>{new Date(result.booking.start_time).toLocaleString()}</p>
                      <p className="font-semibold text-rose-400">
                        Seats: {(result.booking.seat_labels?.length ? result.booking.seat_labels : result.booking.seats || []).join(', ')}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={dismiss}
                    className="mt-5 w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow border border-slate-700"
                  >
                    Scan Next Pass
                  </button>
                </motion.div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default VerifyTicket;
