import React, { useState } from 'react';
import axios from '../api/axios';
import { useNavigate, Link } from 'react-router-dom';
import { FiFilm, FiLock, FiUser, FiMail, FiArrowRight, FiAlertCircle, } from 'react-icons/fi';
import { motion } from 'framer-motion';

const Register = () => {
  const [form, setForm] = useState({ username: '', email: '', password: '', password2: '', role: 'USER' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.password2) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await axios.post('/accounts/register/', form);
      navigate('/login');
    } catch (err) {
      setError(
        typeof err.response?.data === 'string'
          ? err.response.data
          : JSON.stringify(err.response?.data || 'Registration failed')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden selection:bg-rose-500 selection:text-white">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 right-1/2 translate-x-1/2 w-96 h-96 bg-rose-600/15 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-amber-500/10 blur-3xl pointer-events-none rounded-full" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md glass-panel p-8 sm:p-10 rounded-3xl border border-slate-800 shadow-2xl relative z-10 my-8"
      >
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-600/30 mx-auto mb-4">
            <FiFilm className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-3xl font-black font-display text-white tracking-tight">
            Create Account
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Join thousands of movie fans today
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center space-x-2.5">
            <FiAlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Username</label>
            <div className="relative">
              <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Choose a username"
                className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white pl-12 pr-4 py-3 rounded-2xl text-sm outline-none transition-all placeholder-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Email Address</label>
            <div className="relative">
              <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white pl-12 pr-4 py-3 rounded-2xl text-sm outline-none transition-all placeholder-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Password</label>
            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white pl-12 pr-4 py-3 rounded-2xl text-sm outline-none transition-all placeholder-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Confirm Password</label>
            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="password"
                required
                value={form.password2}
                onChange={(e) => setForm({ ...form, password2: e.target.value })}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white pl-12 pr-4 py-3 rounded-2xl text-sm outline-none transition-all placeholder-slate-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-4 mt-2 rounded-2xl font-extrabold text-sm text-white bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 shadow-xl shadow-rose-600/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <span>{busy ? 'Creating Account...' : 'Register Account'}</span>
            <FiArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-8 text-center pt-6 border-t border-slate-800/80">
          <p className="text-xs text-slate-400 font-medium">
            Already have an account?{' '}
            <Link to="/login" className="text-rose-400 font-bold hover:text-rose-300 hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Register;
