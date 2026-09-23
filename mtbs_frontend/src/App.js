import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { WatchlistProvider } from './contexts/WatchlistContext';
import { WalletProvider } from './contexts/WalletContext';

import Home from './pages/Home';
import Movies from './pages/Movies';
import MovieDetail from './pages/MovieDetail';
import Booking from './pages/Booking';
import Dashboard from './pages/Dashboard';
import Watchlist from './pages/Watchlist';
import Wallet from './pages/Wallet';
import GiftCardCheckout from './pages/GiftCardCheckout';
import AdminPanel from './pages/AdminPanel';
import Analytics from './pages/Analytics';
import Login from './pages/Login';
import Register from './pages/Register';
import Payment from './pages/Payment';
import Profile from './pages/Profile';
import Ticket from './pages/Ticket';

import ProtectedRoute from './routes/ProtectedRoute';
import AdminRoute from './routes/AdminRoute';
import StaffRoute from './routes/StaffRoute';
import CustomerRoute from './routes/CustomerRoute';
import Navbar from './components/Navbar';

const VerifyTicket = lazy(() => import('./pages/VerifyTicket'));

const App = () => {
  return (
    <AuthProvider>
      <WatchlistProvider>
      <WalletProvider>
      <Router>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movies" element={<Movies />} />
          <Route path="/movies/:slug" element={<MovieDetail />} />
          <Route path="/payment/:bookingId" element={<Payment />} />

          <Route path="/book/:id" element={
            <CustomerRoute>
              <Booking />
            </CustomerRoute>
          } />
          <Route path="/dashboard" element={
            <CustomerRoute>
              <Dashboard />
            </CustomerRoute>
          } />
          <Route path="/watchlist" element={
            <CustomerRoute>
              <Watchlist />
            </CustomerRoute>
          } />
          <Route path="/wallet" element={
            <CustomerRoute>
              <Wallet />
            </CustomerRoute>
          } />
          <Route path="/gift-cards/:cardId/payment" element={
            <CustomerRoute>
              <GiftCardCheckout />
            </CustomerRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="/ticket/:bookingId" element={
            <CustomerRoute>
              <Ticket />
            </CustomerRoute>
          } />
          <Route path="/verify" element={
            <StaffRoute>
              <Suspense fallback={
                <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-20">
                  <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4" />
                  <p className="text-slate-400 text-sm font-semibold">Initializing Gate Scanner...</p>
                </div>
              }>
                <VerifyTicket />
              </Suspense>
            </StaffRoute>
          } />
          <Route path="/admin" element={
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          } />
          <Route path="/admin/analytics" element={
            <AdminRoute>
              <Analytics />
            </AdminRoute>
          } />
          <Route path="/admin/verify" element={<Navigate to="/verify" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </Router>
      </WalletProvider>
      </WatchlistProvider>
    </AuthProvider>
  );
};

export default App;
