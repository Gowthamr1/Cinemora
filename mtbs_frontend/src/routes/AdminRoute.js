import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

const AdminRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  // Same reason as ProtectedRoute: `user` is null until the session check
  // returns, so deciding early would bounce admins to /dashboard on refresh.
  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;

  return user?.role === 'ADMIN' ? children : <Navigate to="/dashboard" replace />;
};

export default AdminRoute;
