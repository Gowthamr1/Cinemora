import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { asList } from '../utils/list';
import { useWallet } from '../contexts/WalletContext';
import { FiCreditCard, FiGift, FiPlusCircle, FiClock, FiAlertCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const DENOMINATIONS = [10, 25, 50, 100];

const KIND_LABELS = {
  REDEEM: 'Gift Card Redeemed',
  BOOKING_SPEND: 'Booking Payment',
  BOOKING_REFUND: 'Booking Refund',
  ADJUSTMENT: 'Balance Adjustment',
};

const Wallet = () => {
  const { balance, setBalance } = useWallet();
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState(null);

  const [buyAmount, setBuyAmount] = useState(25);
  const [buying, setBuying] = useState(false);
  const [buyMsg, setBuyMsg] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [cardsRes, txnRes] = await Promise.all([
        api.get('/wallet/gift-cards/'),
        api.get('/wallet/transactions/'),
      ]);
      setCards(asList(cardsRes.data));
      setTransactions(asList(txnRes.data));
    } catch {
      // Keep lists empty on fetch fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!code.trim() || redeeming) return;
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      const res = await api.post('/wallet/redeem/', { code: code.trim() });
      if (res.data?.new_balance != null) setBalance(String(res.data.new_balance));
      setRedeemMsg({ type: 'success', text: res.data?.message || 'Code successfully redeemed!' });
      setCode('');
      loadData();
    } catch (err) {
      const text = err.response?.data?.detail
        || err.response?.data?.code?.[0]
        || 'Could not redeem that gift card code.';
      setRedeemMsg({ type: 'error', text });
    } finally {
      setRedeeming(false);
    }
  };

  const handleBuy = async (e) => {
    e.preventDefault();
    if (buying) return;
    setBuying(true);
    setBuyMsg(null);
    try {
      const res = await api.post('/wallet/gift-cards/purchase/', {
        amount: Number(buyAmount).toFixed(2),
      });
      navigate(`/gift-cards/${res.data.id}/payment`);
    } catch (err) {
      const text = err.response?.data?.amount?.[0]
        || err.response?.data?.detail
        || 'Could not start gift card checkout.';
      setBuyMsg({ type: 'error', text });
      setBuying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header & Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 rounded-3xl border border-rose-500/30 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-rose-400 mb-2">
                <FiCreditCard className="w-4 h-4 text-emerald-400" />
                <span>Digital Wallet</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black font-display text-white tracking-tight">
                WALLET & GIFT CARDS
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Seamless 1-click checkout for cinema tickets & instant refunds.
              </p>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl text-right shrink-0">
              <p className="text-xs text-slate-400 uppercase font-semibold">Available Balance</p>
              <p className="text-3xl sm:text-4xl font-black text-emerald-400 font-display mt-0.5">
                {money(balance)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Redeem & Buy Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Redeem Card */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold font-display text-white mb-2 flex items-center space-x-2">
                <FiGift className="w-5 h-5 text-rose-500" />
                <span>Redeem Gift Card</span>
              </h3>
              <p className="text-slate-400 text-xs mb-6">
                Enter your 16-character gift voucher code to credit your balance.
              </p>

              <form onSubmit={handleRedeem} className="space-y-4">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="GC-XXXX-XXXX-XXXX"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white p-3.5 rounded-2xl text-sm font-mono uppercase tracking-wider outline-none transition-all placeholder-slate-600"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={redeeming || !code.trim()}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
                >
                  {redeeming ? 'Redeeming Voucher...' : 'Redeem Code'}
                </button>
              </form>

              {redeemMsg && (
                <div className={`mt-4 p-3 rounded-xl text-xs font-semibold flex items-center space-x-2 ${
                  redeemMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}>
                  <FiAlertCircle className="w-4 h-4 shrink-0" />
                  <span>{redeemMsg.text}</span>
                </div>
              )}
            </div>
          </div>

          {/* Buy Card */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold font-display text-white mb-2 flex items-center space-x-2">
                <FiPlusCircle className="w-5 h-5 text-amber-400" />
                <span>Buy Gift Card</span>
              </h3>
              <p className="text-slate-400 text-xs mb-4">
                Select a denomination below to issue a new digital card.
              </p>

              <form onSubmit={handleBuy} className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {DENOMINATIONS.map((d) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => setBuyAmount(d)}
                      className={`py-2.5 rounded-xl border text-sm font-bold transition-all ${
                        Number(buyAmount) === d
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-md'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {money(d)}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={buying}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                >
                  {buying ? 'Starting Checkout...' : `Purchase ${money(buyAmount)} Card`}
                </button>
              </form>

              {buyMsg && (
                <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
                  {buyMsg.text}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* My Gift Cards List */}
        <section className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl">
          <h3 className="text-xl font-bold font-display text-white mb-4 flex items-center space-x-2">
            <FiGift className="w-5 h-5 text-amber-400" />
            <span>My Issued Gift Cards</span>
          </h3>

          {loading ? (
            <p className="text-xs text-slate-400 animate-pulse">Loading cards...</p>
          ) : cards.length === 0 ? (
            <p className="text-xs text-slate-400">You have not purchased any digital gift cards yet.</p>
          ) : (
            <div className="space-y-3">
              {cards.map((card) => {
                const pending = card.status === 'PENDING';
                return (
                  <div
                    key={card.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div>
                      <span className={`font-mono text-sm font-bold tracking-wider ${pending ? 'text-slate-500' : 'text-amber-300'}`}>
                        {pending ? '••••-••••-••••' : card.code}
                      </span>
                      <span className="text-xs font-semibold text-slate-400 ml-3">
                        Value: {money(card.amount)}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3">
                      {pending && (
                        <Link
                          to={`/gift-cards/${card.id}/payment`}
                          className="text-xs font-bold text-rose-400 hover:underline"
                        >
                          Complete Payment
                        </Link>
                      )}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                        card.status === 'ACTIVE'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : pending
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {card.status === 'ACTIVE' ? 'Active' : pending ? 'Pending' : 'Redeemed'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Transaction History Ledger */}
        <section className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl">
          <h3 className="text-xl font-bold font-display text-white mb-4 flex items-center space-x-2">
            <FiClock className="w-5 h-5 text-rose-500" />
            <span>Transaction Ledger</span>
          </h3>

          {loading ? (
            <p className="text-xs text-slate-400 animate-pulse">Loading ledger...</p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-slate-400">No transaction records found.</p>
          ) : (
            <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-2xl bg-slate-900/60 overflow-hidden">
              {transactions.map((txn) => {
                const credit = Number(txn.amount) >= 0;
                return (
                  <div key={txn.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm text-white">{KIND_LABELS[txn.kind] || txn.kind}</p>
                      {txn.description && (
                        <p className="text-xs text-slate-400">{txn.description}</p>
                      )}
                      <p className="text-[10px] text-slate-500">
                        {new Date(txn.created_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className={`font-extrabold text-sm ${credit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {credit ? '+' : '−'}{money(Math.abs(Number(txn.amount)))}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">bal {money(txn.balance_after)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default Wallet;
