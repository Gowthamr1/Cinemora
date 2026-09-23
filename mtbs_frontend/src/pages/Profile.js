import React, { useEffect, useState } from 'react';
import axios from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { countOf } from '../utils/list';
import {FiMail,FiShield, FiAlertCircle, FiStar, FiClock } from 'react-icons/fi';
import { motion } from 'framer-motion';

const Profile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ total: 0, confirmed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes, allRes, confirmedRes] = await Promise.all([
          axios.get('/accounts/profile/'),
          axios.get('/bookings/', { params: { page_size: 1 } }),
          axios.get('/bookings/', { params: { page_size: 1, status: 'CONFIRMED' } }),
        ]);
        setProfile(profileRes.data);
        setStats({
          total: countOf(allRes.data),
          confirmed: countOf(confirmedRes.data),
        });
      } catch (err) {
        console.error(err);
        setError('Failed to load profile details.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-semibold">Loading profile information...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-panel p-8 rounded-3xl max-w-md text-center border border-rose-500/30">
          <FiAlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <p className="text-rose-400 font-bold mb-4">{error}</p>
        </div>
      </div>
    );
  }

  const initial = (profile?.username || user?.username || 'U').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8 selection:bg-rose-500 selection:text-white">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Profile Card Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 sm:p-10 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden"
        >
          {/* Ambient Lighting Glows */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-8">
            
            {/* Avatar Badge */}
            <div className="relative shrink-0">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 p-1 shadow-2xl shadow-rose-600/20">
                <div className="w-full h-full rounded-[22px] bg-slate-950 flex items-center justify-center text-white font-black text-4xl sm:text-5xl font-display">
                  {initial}
                </div>
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg border-2 border-slate-950">
                <FiStar className="w-4 h-4 fill-slate-950" />
              </div>
            </div>

            {/* Profile Info Details */}
            <div className="flex-1 text-center sm:text-left space-y-3">
              <div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-2">
                  <span className="px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 text-xs font-extrabold uppercase tracking-wider border border-rose-500/30 flex items-center space-x-1.5">
                    <FiShield className="w-3.5 h-3.5" />
                    <span>{profile?.role || user?.role}</span>
                  </span>
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    Member Account #{profile?.id}
                  </span>
                </div>

                <h1 className="text-3xl sm:text-5xl font-black font-display text-white tracking-tight">
                  {profile?.username}
                </h1>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-6 text-sm text-slate-300 pt-1">
                <div className="flex items-center space-x-2">
                  <FiMail className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="font-semibold text-slate-200">{profile?.email || 'No email attached'}</span>
                </div>
                <div className="flex items-center space-x-2 text-slate-400">
                  <FiClock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>CINEPASS Verified Account</span>
                </div>
              </div>
            </div>

          </div>

          {/* Statistics Tiles Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-10 pt-8 border-t border-slate-800/80 relative z-10">
            
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 text-center sm:text-left">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold">Account ID</p>
              <p className="text-xl sm:text-2xl font-black text-white font-display mt-1">#{profile?.id}</p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 text-center sm:text-left">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold">Access Role</p>
              <p className="text-xl sm:text-2xl font-black text-rose-400 font-display mt-1">{profile?.role || user?.role}</p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 text-center sm:text-left">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold">Total Bookings</p>
              <p className="text-xl sm:text-2xl font-black text-amber-400 font-display mt-1">{stats.total}</p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 text-center sm:text-left">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold">Confirmed Shows</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-400 font-display mt-1">{stats.confirmed}</p>
            </div>

          </div>
        </motion.div>

      </div>
    </div>
  );
};

export default Profile;
