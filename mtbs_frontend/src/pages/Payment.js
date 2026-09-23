import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { useWallet } from '../contexts/WalletContext';
import { FiLock, FiCreditCard, FiSmartphone, FiShield, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const Payment = () => {
  const { bookingId } = useParams();
  const { balanceNumber, enabled: walletEnabled, refresh: refreshWallet } = useWallet();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [method, setMethod] = useState('');
  const [progress, setProgress] = useState(0);
  const [amount, setAmount] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    axios.get(`/bookings/${bookingId}/`)
      .then((res) => { if (!cancelled) setAmount(res.data?.amount ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bookingId]);

  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => {
        setProgress(prev => Math.min(prev + 1, 100));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const walletShort = amount != null && balanceNumber < amount;

  const handleMockPayment = async () => {
    if (!method) {
      setStatus('Please select a payment method.');
      return;
    }
    if (method === 'wallet' && walletShort) {
      setStatus('Your wallet balance is too low for this booking.');
      return;
    }

    setLoading(true);
    setStatus(null);
    setProgress(0);

    try {
      if (method === 'wallet') {
        await axios.post('/payments/wallet/', {
          booking_id: parseInt(bookingId),
        });
        await refreshWallet();
      } else {
        await new Promise(resolve => setTimeout(resolve, 8000));
        await axios.post('/payments/mock/', {
          booking_id: parseInt(bookingId),
          method: method,
        });
      }

      setStatus('success');
      setTimeout(() => {
        navigate('/dashboard', { state: { paid: true } });
      }, 2000);
    } catch (err) {
      const detail = err.response?.data?.error;
      setStatus(detail ? { kind: 'failed', detail } : 'failed');
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const isFailed = status === 'failed' || (status && status.kind === 'failed');
  const failMessage = status && status.kind === 'failed'
    ? status.detail
    : 'Payment Failed. Please try again.';
  const inlineHint = typeof status === 'string' && status !== 'success' && status !== 'failed'
    ? status
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative selection:bg-rose-500 selection:text-white">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-rose-600/15 blur-3xl pointer-events-none rounded-full" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md glass-panel p-8 sm:p-10 rounded-3xl border border-slate-800 shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-600/30 mx-auto mb-4">
            <FiLock className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-black font-display text-white tracking-tight">
            SECURE CHECKOUT
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Encrypted 256-bit payment gateway
          </p>
        </div>

        {status === 'success' ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <FiCheckCircle className="w-10 h-10 animate-bounce" />
            </div>
            <h3 className="text-2xl font-bold font-display text-white">Payment Successful!</h3>
            <p className="text-slate-400 text-xs">Redirecting to your dashboard tickets...</p>
          </div>
        ) : isFailed ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/20">
              <FiAlertCircle className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold font-display text-white">{failMessage}</h3>
            <button
              onClick={() => setStatus(null)}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl shadow"
            >
              Retry Payment
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-center space-y-1">
              <p className="text-xs text-slate-400">Booking Reference: #{bookingId}</p>
              {amount != null && (
                <p className="text-2xl font-black text-emerald-400 font-display">
                  Amount Due: {money(amount)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase text-slate-400">Select Payment Gateway</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white p-4 rounded-2xl text-sm font-semibold outline-none transition-all"
              >
                <option value="">Choose payment method</option>
                <option value="card">💳 Credit / Debit Card</option>
                <option value="upi">📱 UPI Instant Pay</option>
                {walletEnabled && (
                  <option value="wallet" disabled={walletShort}>
                    👛 Wallet ({money(balanceNumber)}){walletShort ? ' — insufficient funds' : ''}
                  </option>
                )}
              </select>
            </div>

            {inlineHint && (
              <p className="text-xs font-semibold text-rose-400 text-center">{inlineHint}</p>
            )}

            <button
              onClick={handleMockPayment}
              disabled={loading || !method || (method === 'wallet' && walletShort)}
              className="w-full py-4 rounded-2xl font-extrabold text-sm text-white bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 shadow-xl shadow-rose-600/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 relative overflow-hidden"
            >
              {loading ? (
                <>
                  <div
                    className="absolute top-0 left-0 h-full bg-rose-700/40 transition-all duration-100"
                    style={{ width: `${progress}%` }}
                  />
                  <span className="relative z-10 font-bold">
                    {method === 'wallet' ? 'Verifying Wallet...' : `Processing (${progress}%)`}
                  </span>
                </>
              ) : (
                <span>{method === 'wallet' ? 'Pay via Wallet' : 'Confirm & Complete Payment'}</span>
              )}
            </button>

            <div className="text-xs text-slate-500 text-center flex items-center justify-center space-x-1.5">
              <FiShield className="w-3.5 h-3.5 text-slate-400" />
              <span>256-bit End-to-End SSL Encryption</span>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Payment;
