import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

// The ticket scanner, open to door staff and to admins covering a shift.
// Deliberately not AdminRoute: this is the one page STAFF can reach, and
// widening AdminRoute to admit them would have opened the whole panel.
const StaffRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  // Same reason as ProtectedRoute: `user` is null until the session check
  // returns, so deciding early would bounce staff out on every refresh.
  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'STAFF' && user.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

export default StaffRoute;
