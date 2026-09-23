import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  // Wait for the session check before judging. The token used to be readable
  // from localStorage on the very first render; it's an httpOnly cookie now,
  // so `user` is always null for the first moment of a page load. Deciding
  // here would bounce every logged-in user to /login on a hard refresh.
  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;

  return user ? children : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
