import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

// Pages that only make sense for someone who buys tickets. Door staff have no
// bookings and the API refuses to create them one, so sending them here would
// only ever show an empty list or a 403 — /verify is their whole app.
const CustomerRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'STAFF') return <Navigate to="/verify" replace />;
  return children;
};

export default CustomerRoute;
