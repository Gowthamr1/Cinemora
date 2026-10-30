import React, { createContext, useCallback, useEffect, useState, useContext } from 'react';
import api, { setUnauthorizedHandler, clearAuthTokens, storeAuthTokens } from '../api/axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // Starts true because on a fresh page load we genuinely don't know yet.
  // Route guards MUST wait on this — see ProtectedRoute.
  const [loading, setLoading] = useState(true);

  // Restore the session via cookie or stored token
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const res = await api.get('/accounts/profile/');
        if (!cancelled) setUser(res.data);
      } catch {
        // 401 with no usable refresh token/cookie — just not logged in.
        if (!cancelled) {
          clearAuthTokens();
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    restore();
    return () => { cancelled = true; };
  }, []);

  // Fired by the axios interceptor when a refresh finally fails, so an expired
  // session drops the user in place instead of hard-navigating the browser.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearAuthTokens();
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Credentials go straight to the API. Tokens arrive as both httpOnly cookies
  // and in the body (fallback for strict 3rd-party cookie blocking).
  const login = useCallback(async (username, password) => {
    const res = await api.post('/token/', { username, password });
    if (res.data?.access) {
      storeAuthTokens(res.data.access, res.data.refresh);
    }
    setUser(res.data);
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/accounts/logout/');
    } finally {
      clearAuthTokens();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
