import axios from 'axios';

// The REST API is reached through a SAME-ORIGIN `/api/` path by default, never
// a hardcoded backend host. In production a Vercel rewrite (see vercel.json)
// proxies /api/* to the Render backend server-side, so the browser only ever
// makes first-party requests to its own origin — which is what keeps the
// auth cookies first-party and lets SameSite=None / Lax work smoothly. In
// local dev the CRA dev-server proxy (the "proxy" field in package.json)
// forwards /api/* to the Django dev server on :8000.
//
// REACT_APP_API_ROOT is an optional escape hatch (CRA inlines REACT_APP_*
// vars at BUILD time): set it to an absolute origin to bypass the
// proxy and call a backend directly. A trailing slash is normalised in so every
// relative path below stays correct whether or not the value ends in one.
const deriveApiRoot = () => {
  if (process.env.REACT_APP_API_ROOT) {
    return process.env.REACT_APP_API_ROOT.replace(/\/?$/, '/');
  }
  return '/api/';
};

const API_ROOT = deriveApiRoot();

const isCrossDomainTarget = typeof window !== 'undefined' &&
  /^https?:\/\//i.test(API_ROOT) &&
  !API_ROOT.startsWith(window.location.origin);

// WebSockets cannot travel through the Vercel HTTP rewrite, so the seat socket
// always needs an absolute backend origin of its own. Preference order:
//   1. REACT_APP_WS_ROOT — optional override; set it to point the socket at a
//      different backend without touching code. Not required in production.
//   2. Derive from an absolute REACT_APP_API_ROOT (http->ws, /api/ -> /ws/),
//      for anyone who bypasses the proxy via that escape hatch.
//   3. No override set: local dev (localhost/127.0.0.1) talks to the Django dev
//      server on :8000; any deployed build talks to the Render backend.
const PROD_WS_ROOT = 'wss://cinemora-6r4q.onrender.com/ws/';

const deriveWsRoot = () => {
  if (process.env.REACT_APP_WS_ROOT) {
    return process.env.REACT_APP_WS_ROOT.replace(/\/?$/, '/');
  }
  if (/^https?:/i.test(API_ROOT)) {
    return API_ROOT.replace(/^http/, 'ws').replace(/\/api\/$/, '/ws/');
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'ws://localhost:8000/ws/';
  }
  return PROD_WS_ROOT;
};

export const WS_ROOT = deriveWsRoot();

// Clean up any stale csrftoken cookie left on the frontend origin from older sessions
// when calling a cross-domain backend directly.
if (isCrossDomainTarget && typeof document !== 'undefined') {
  try {
    document.cookie = 'csrftoken=; Max-Age=0; path=/;';
    document.cookie = `csrftoken=; Max-Age=0; path=/; domain=${window.location.hostname};`;
  } catch {
    // Ignore in non-browser contexts
  }
}

let currentCsrfToken = null;

export const setCsrfToken = (token) => {
  if (token) {
    currentCsrfToken = token;
  }
};

export const getCsrfToken = () => currentCsrfToken;

// Proactively acquire a fresh CSRF token from the backend
export const fetchCsrfToken = async () => {
  try {
    const res = await axios.get(`${API_ROOT}csrf/`, { withCredentials: true });
    const token = res.headers?.['x-csrftoken'] || res.data?.csrfToken || res.data?.csrf_token;
    if (token) {
      setCsrfToken(token);
    }
    return token;
  } catch {
    return null;
  }
};

// Initialize CSRF token eagerly
if (typeof window !== 'undefined') {
  fetchCsrfToken();
}

const api = axios.create({
  baseURL: API_ROOT,
  // The JWTs and CSRF tokens travel as cookies — withCredentials keeps Set-Cookie
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
  withXSRFToken: !isCrossDomainTarget,
});

// Request interceptor: attach CSRF token if managed in-memory (cross-domain)
api.interceptors.request.use((config) => {
  if (currentCsrfToken) {
    config.headers = config.headers || {};
    config.headers['X-CSRFToken'] = currentCsrfToken;
  }
  return config;
});

// Called when the session is gone for good, so AuthContext can drop the user
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

let refreshing = null;

const refreshSession = () => {
  if (!refreshing) {
    refreshing = axios
      .post(`${API_ROOT}token/refresh/`, null, {
        withCredentials: true,
        headers: currentCsrfToken ? { 'X-CSRFToken': currentCsrfToken } : {},
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

api.interceptors.response.use(
  (response) => {
    const token = response.headers?.['x-csrftoken'] || response.data?.csrf_token || response.data?.csrfToken;
    if (token) {
      setCsrfToken(token);
    }
    return response;
  },
  async (error) => {
    const { response, config } = error;

    if (response?.status !== 401 || !config || config._retried) {
      return Promise.reject(error);
    }

    config._retried = true;
    try {
      const refreshRes = await refreshSession();
      const token = refreshRes?.headers?.['x-csrftoken'] || refreshRes?.data?.csrf_token;
      if (token) {
        setCsrfToken(token);
      }
      if (currentCsrfToken) {
        config.headers = config.headers || {};
        config.headers['X-CSRFToken'] = currentCsrfToken;
      }
      return await api(config);
    } catch (refreshError) {
      if (onUnauthorized) onUnauthorized();
      return Promise.reject(refreshError);
    }
  },
);

export default api;
