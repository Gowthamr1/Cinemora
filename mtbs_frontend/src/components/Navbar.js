import React, { useContext, useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { useWatchlist } from '../contexts/WatchlistContext';
import { useWallet } from '../contexts/WalletContext';
import { 
  FiFilm, 
  FiHeart, 
  FiCreditCard, 
  FiUser, 
  FiShield, 
  FiPieChart, 
  FiCheckCircle, 
  FiLogOut, 
  FiMenu, 
  FiX, 
  FiChevronDown,
  FiGrid,
  FiSliders,
  FiActivity
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const { count: watchlistCount } = useWatchlist();
  const { balance: walletBalance, enabled: walletEnabled } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);

  const profileRef = useRef(null);
  const adminRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
      if (adminRef.current && !adminRef.current.contains(event.target)) {
        setAdminDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
    setAdminDropdownOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;
  const isAdminActive = location.pathname.startsWith('/admin') || location.pathname === '/verify';

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80 shadow-2xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Brand & Main Links */}
          <div className="flex items-center space-x-8">
            <Link to="/" className="group flex items-center space-x-3 focus:outline-none">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-600/30 group-hover:scale-105 transition-transform duration-300">
                <FiFilm className="w-5 h-5 text-white transform -rotate-6 group-hover:rotate-0 transition-transform" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-2xl tracking-wider text-white font-display flex items-center gap-1.5">
                  CINE<span className="bg-gradient-to-r from-rose-500 via-amber-400 to-amber-200 bg-clip-text text-transparent">PASS</span>
                </span>
                <span className="text-[9px] tracking-widest uppercase text-slate-400 font-semibold -mt-1">
                  Cinematic Experience
                </span>
              </div>
            </Link>

            {/* Desktop Customer Nav Links */}
            <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 pl-4 border-l border-slate-800/80">
              <Link
                to="/movies"
                className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center space-x-2 ${
                  isActive('/movies')
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <FiFilm className="w-4 h-4 text-rose-500" />
                <span>Explore Movies</span>
              </Link>

              {/* Customer Dashboard Link */}
              {user && user.role !== 'STAFF' && (
                <Link
                  to="/dashboard"
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center space-x-2 ${
                    isActive('/dashboard')
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <FiGrid className="w-4 h-4 text-amber-400" />
                  <span>My Bookings</span>
                </Link>
              )}

              {/* Customer Watchlist Link */}
              {user && user.role !== 'STAFF' && (
                <Link
                  to="/watchlist"
                  className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center space-x-2 relative ${
                    isActive('/watchlist')
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <FiHeart className="w-4 h-4 text-rose-500" />
                  <span>Watchlist</span>
                  {watchlistCount > 0 && (
                    <span className="ml-1.5 px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-600 text-white shadow-sm">
                      {watchlistCount}
                    </span>
                  )}
                </Link>
              )}

              {/* Customer Wallet Chip */}
              {walletEnabled && user?.role !== 'STAFF' && (
                <Link
                  to="/wallet"
                  className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center space-x-2 border ${
                    isActive('/wallet')
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-sm'
                      : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:border-emerald-500/40 hover:text-white'
                  }`}
                >
                  <FiCreditCard className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-400 text-xs">Wallet:</span>
                  <span className="font-bold text-emerald-400">
                    ${(Number(walletBalance) || 0).toFixed(2)}
                  </span>
                </Link>
              )}
            </nav>
          </div>

          {/* Desktop Right Action Area & Admin Suite */}
          <div className="hidden md:flex items-center space-x-4">
            
            {/* 👑 Dedicated Admin / Staff Console Dropdown */}
            {(user?.role === 'ADMIN' || user?.role === 'STAFF') && (
              <div className="relative" ref={adminRef}>
                <button
                  onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border transition-all ${
                    isAdminActive
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-900/90 text-amber-400 border-amber-500/20 hover:border-amber-500/50 hover:bg-slate-800'
                  }`}
                >
                  <FiShield className="w-4 h-4 text-amber-400" />
                  <span>{user.role === 'ADMIN' ? 'Admin Console' : 'Staff Suite'}</span>
                  <FiChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${adminDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {adminDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-3 w-64 rounded-2xl glass-panel border border-amber-500/30 shadow-2xl py-2 z-50 overflow-hidden"
                    >
                      <div className="px-4 py-2.5 border-b border-slate-800 bg-amber-500/10">
                        <p className="text-[10px] text-amber-300 uppercase tracking-widest font-extrabold">Control Panel</p>
                        <p className="text-xs font-bold text-white">Management Options</p>
                      </div>

                      <div className="py-1">
                        {user?.role === 'ADMIN' && (
                          <>
                            <Link
                              to="/admin"
                              className="flex items-center space-x-3 px-4 py-2.5 text-sm text-slate-200 hover:text-white hover:bg-slate-800/80 transition-colors"
                            >
                              <FiSliders className="w-4 h-4 text-amber-400" />
                              <div className="flex flex-col">
                                <span className="font-bold">Admin Management</span>
                                <span className="text-[11px] text-slate-400">Movies, Theatres & Showtimes</span>
                              </div>
                            </Link>

                            <Link
                              to="/admin/analytics"
                              className="flex items-center space-x-3 px-4 py-2.5 text-sm text-slate-200 hover:text-white hover:bg-slate-800/80 transition-colors"
                            >
                              <FiPieChart className="w-4 h-4 text-purple-400" />
                              <div className="flex flex-col">
                                <span className="font-bold">Analytics & Revenue</span>
                                <span className="text-[11px] text-slate-400">Financial Reports & Charts</span>
                              </div>
                            </Link>
                          </>
                        )}

                        <Link
                          to="/verify"
                          className="flex items-center space-x-3 px-4 py-2.5 text-sm text-slate-200 hover:text-white hover:bg-slate-800/80 transition-colors"
                        >
                          <FiCheckCircle className="w-4 h-4 text-cyan-400" />
                          <div className="flex flex-col">
                            <span className="font-bold">Gate Ticket Verification</span>
                            <span className="text-[11px] text-slate-400">Scan QR Passes at Entry</span>
                          </div>
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Authenticated Profile Dropdown OR Sign In / Get Started */}
            {user ? (
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center space-x-3 p-1.5 pr-3 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 via-rose-600 to-amber-500 flex items-center justify-center text-white font-bold text-sm shadow-inner">
                    {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <span className="text-sm font-semibold text-slate-200 max-w-[120px] truncate">
                    {user.username}
                  </span>
                  <FiChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Profile Dropdown */}
                <AnimatePresence>
                  {profileDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-3 w-56 rounded-2xl glass-panel border border-slate-800 shadow-2xl py-2 z-50"
                    >
                      <div className="px-4 py-3 border-b border-slate-800/80">
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Account</p>
                        <p className="text-sm font-bold text-white truncate">{user.username}</p>
                        <span className="inline-block mt-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          {user.role}
                        </span>
                      </div>

                      <div className="py-1">
                        <Link
                          to="/profile"
                          className="flex items-center space-x-2.5 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors font-medium"
                        >
                          <FiUser className="w-4 h-4 text-rose-400" />
                          <span>My Profile</span>
                        </Link>

                        {user.role !== 'STAFF' && (
                          <Link
                            to="/dashboard"
                            className="flex items-center space-x-2.5 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors font-medium"
                          >
                            <FiGrid className="w-4 h-4 text-amber-400" />
                            <span>My Bookings</span>
                          </Link>
                        )}
                      </div>

                      <div className="pt-1 border-t border-slate-800/80">
                        <button
                          onClick={handleLogout}
                          className="w-full text-left flex items-center space-x-2.5 px-4 py-2.5 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors font-semibold"
                        >
                          <FiLogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 shadow-lg shadow-rose-600/30 transition-all transform hover:-translate-y-0.5"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Hamburger Toggle Button */}
          <div className="flex md:hidden items-center space-x-3">
            {user && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white font-bold text-xs">
                {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
            >
              {mobileMenuOpen ? <FiX className="w-6 h-6" /> : <FiMenu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass-panel border-t border-slate-800/80 overflow-hidden"
          >
            <div className="px-4 pt-3 pb-6 space-y-2">
              <Link
                to="/movies"
                className="flex items-center space-x-3 px-3 py-2.5 rounded-xl text-base font-medium text-slate-200 hover:bg-slate-800"
              >
                <FiFilm className="w-5 h-5 text-rose-500" />
                <span>Explore Movies</span>
              </Link>

              {user && user.role !== 'STAFF' && (
                <Link
                  to="/dashboard"
                  className="flex items-center space-x-3 px-3 py-2.5 rounded-xl text-base font-medium text-slate-200 hover:bg-slate-800"
                >
                  <FiGrid className="w-5 h-5 text-amber-400" />
                  <span>My Bookings</span>
                </Link>
              )}

              {user && user.role !== 'STAFF' && (
                <Link
                  to="/watchlist"
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-base font-medium text-slate-200 hover:bg-slate-800"
                >
                  <div className="flex items-center space-x-3">
                    <FiHeart className="w-5 h-5 text-rose-500" />
                    <span>Watchlist</span>
                  </div>
                  {watchlistCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-600 text-white">
                      {watchlistCount}
                    </span>
                  )}
                </Link>
              )}

              {walletEnabled && user?.role !== 'STAFF' && (
                <Link
                  to="/wallet"
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-base font-medium text-slate-200 hover:bg-slate-800"
                >
                  <div className="flex items-center space-x-3">
                    <FiCreditCard className="w-5 h-5 text-emerald-400" />
                    <span>My Wallet</span>
                  </div>
                  <span className="font-bold text-emerald-400">
                    ${(Number(walletBalance) || 0).toFixed(2)}
                  </span>
                </Link>
              )}

              {user?.role === 'ADMIN' && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <p className="px-3 text-[10px] font-extrabold uppercase text-amber-400 tracking-wider">Admin Console</p>
                  <Link
                    to="/admin"
                    className="flex items-center space-x-3 px-3 py-2 rounded-xl text-sm font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <FiSliders className="w-4 h-4 text-amber-400" />
                    <span>Admin Panel</span>
                  </Link>
                  <Link
                    to="/admin/analytics"
                    className="flex items-center space-x-3 px-3 py-2 rounded-xl text-sm font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <FiPieChart className="w-4 h-4 text-purple-400" />
                    <span>Analytics</span>
                  </Link>
                </div>
              )}

              {(user?.role === 'STAFF' || user?.role === 'ADMIN') && (
                <Link
                  to="/verify"
                  className="flex items-center space-x-3 px-3 py-2 rounded-xl text-sm font-semibold text-cyan-400 hover:bg-slate-800"
                >
                  <FiCheckCircle className="w-4 h-4" />
                  <span>Gate Ticket Scanner</span>
                </Link>
              )}

              {user ? (
                <div className="pt-4 mt-2 border-t border-slate-800 space-y-2">
                  <div className="px-3 py-2">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Signed in as</p>
                    <p className="text-sm font-bold text-white">{user.username}</p>
                  </div>
                  <Link
                    to="/profile"
                    className="flex items-center space-x-3 px-3 py-2.5 rounded-xl text-base font-medium text-slate-200 hover:bg-slate-800"
                  >
                    <FiUser className="w-5 h-5 text-rose-400" />
                    <span>Profile</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left flex items-center space-x-3 px-3 py-2.5 rounded-xl text-base font-medium text-rose-400 hover:bg-rose-500/10"
                  >
                    <FiLogOut className="w-5 h-5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div className="pt-4 mt-2 border-t border-slate-800 flex flex-col space-y-2">
                  <Link
                    to="/login"
                    className="w-full py-2.5 text-center font-semibold text-slate-200 hover:text-white bg-slate-800 rounded-xl"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    className="w-full py-2.5 text-center font-bold text-white bg-gradient-to-r from-rose-600 to-amber-500 rounded-xl shadow-lg"
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
