import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from '../api/axios';
import { FiGift, FiLock, FiCheckCircle, FiAlertCircle, FiShield } from 'react-icons/fi';
import { motion } from 'framer-motion';

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

const GiftCardCheckout = () => {
  const { cardId } = useParams();
  const navigate = useNavigate();

  const [card, setCard] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [method, setMethod] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(null);
  const [paidCode, setPaidCode] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`/wallet/gift-cards/${cardId}/`)
      .then((res) => { if (!cancelled) setCard(res.data); })
      .catch(() => {
        if (!cancelled) setLoadError('That gift card could not be found.');
      });
    return () => { cancelled = true; };
  }, [cardId]);

  useEffect(() => {
    let interval;
    if (loading) {
      interval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 1, 100));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handlePay = async () => {
    if (!method) {
      setStatus({ kind: 'hint', text: 'Please select a payment method.' });
      return;
    }

    setLoading(true);
    setStatus(null);
    setProgress(0);

    try {
      await new Promise((resolve) => setTimeout(resolve, 8000));
      const res = await axios.post(`/wallet/gift-cards/${cardId}/pay/`, {
        method: method === 'upi' ? 'UPI' : 'CARD',
      });
      setPaidCode(res.data?.gift_card?.code || null);
      setStatus({ kind: 'success' });
    } catch (err) {
      setStatus({
        kind: 'failed',
        text: err.response?.data?.error || 'Payment Failed. Try again.',
      });
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-3xl max-w-md text-center border border-rose-500/30">
          <FiAlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <p className="text-rose-400 font-bold mb-4">{loadError}</p>
          <Link to="/wallet" className="px-6 py-2.5 bg-slate-800 text-white font-bold text-xs rounded-xl inline-block">
            Back to Wallet
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative selection:bg-rose-500 selection:text-white">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-purple-600/15 blur-3xl pointer-events-none rounded-full" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md glass-panel p-8 sm:p-10 rounded-3xl border border-slate-800 shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-purple-600/30 mx-auto mb-4">
            <FiGift className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-black font-display text-white tracking-tight">
            GIFT CARD CHECKOUT
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Complete purchase to generate your redeemable voucher code
          </p>
        </div>

        {status?.kind === 'success' ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <FiCheckCircle className="w-10 h-10 animate-bounce" />
            </div>
            <h3 className="text-2xl font-bold font-display text-white">Payment Successful!</h3>
            
            {paidCode && (
              <div className="p-4 bg-slate-900 border border-purple-500/40 rounded-2xl">
                <p className="text-[10px] uppercase font-extrabold tracking-widest text-purple-400 mb-1">
                  Your Voucher Code
                </p>
                <p className="font-mono text-xl font-bold text-amber-300 tracking-wider">
                  {paidCode}
                </p>
              </div>
            )}

            <button
              onClick={() => navigate('/wallet')}
              className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white font-bold text-xs rounded-2xl shadow-lg"
            >
              Back to Wallet
            </button>
          </div>
        ) : status?.kind === 'failed' ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto shadow-lg">
              <FiAlertCircle className="w-10 h-10" />
            </div>
            <p className="text-rose-400 font-bold text-sm">{status.text}</p>
            <button
              onClick={() => setStatus(null)}
              className="px-6 py-2.5 bg-slate-800 text-white font-bold text-xs rounded-xl"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-center space-y-1">
              <p className="text-xs text-slate-400">Gift Card Reference: #{cardId}</p>
              {card && (
                <p className="text-2xl font-black text-emerald-400 font-display">
                  Amount Due: {money(card.amount)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase text-slate-400">Payment Option</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white p-4 rounded-2xl text-sm font-semibold outline-none transition-all"
              >
                <option value="">Select payment method</option>
                <option value="card">💳 Credit / Debit Card</option>
                <option value="upi">📱 UPI Instant Pay</option>
              </select>
            </div>

            {status?.kind === 'hint' && (
              <p className="text-xs font-semibold text-rose-400 text-center">{status.text}</p>
            )}

            <button
              onClick={handlePay}
              disabled={loading || !method}
              className="w-full py-4 rounded-2xl font-extrabold text-sm text-white bg-gradient-to-r from-purple-600 via-rose-500 to-amber-500 hover:from-purple-500 hover:to-amber-400 shadow-xl shadow-purple-600/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 relative overflow-hidden"
            >
              {loading ? (
                <>
                  <div
                    className="absolute top-0 left-0 h-full bg-purple-700/40 transition-all duration-100"
                    style={{ width: `${progress}%` }}
                  />
                  <span className="relative z-10 font-bold">
                    Processing ({progress}%)
                  </span>
                </>
              ) : (
                <span>{card ? `Pay ${money(card.amount)}` : 'Confirm Payment'}</span>
              )}
            </button>

            <div className="text-xs text-slate-500 text-center flex items-center justify-center space-x-1.5">
              <FiShield className="w-3.5 h-3.5 text-slate-400" />
              <span>SSL Encrypted Transaction</span>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default GiftCardCheckout;
