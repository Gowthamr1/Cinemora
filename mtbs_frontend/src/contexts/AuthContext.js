import React, { createContext, useCallback, useEffect, useState, useContext } from 'react';
import api, { setUnauthorizedHandler } from '../api/axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // Starts true because on a fresh page load we genuinely don't know yet. The
  // token used to be readable from localStorage synchronously; it's an
  // httpOnly cookie now, so the only way to find out who we are is to ask.
  // Route guards MUST wait on this — see ProtectedRoute.
  const [loading, setLoading] = useState(true);

  // Restore the session. The cookie is already in the browser (if there is
  // one); this call is what turns it into a username and a role, which the app
  // used to get by decoding the JWT itself.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const res = await api.get('/accounts/profile/');
        if (!cancelled) setUser(res.data);
      } catch {
        // 401 with no usable refresh cookie — just not logged in.
        if (!cancelled) setUser(null);
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
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  // Credentials go straight to the API and the tokens come back as cookies we
  // never see. The response body carries the user instead.
  const login = useCallback(async (username, password) => {
    const res = await api.post('/token/', { username, password });
    setUser(res.data);
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      // Only the server can clear an httpOnly cookie.
      await api.post('/accounts/logout/');
    } finally {
      // Drop the user either way: if the call failed, staying "logged in" in
      // the UI is worse than a cookie that expires on its own.
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
