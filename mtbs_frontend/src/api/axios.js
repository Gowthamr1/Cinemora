import axios from 'axios';

// The REST API is reached through a SAME-ORIGIN `/api/` path by default, never
// a hardcoded backend host. In production a Vercel rewrite (see vercel.json)
// proxies /api/* to the Render backend server-side, so the browser only ever
// makes first-party requests to its own origin — which is what keeps the
// auth cookies first-party and prevents privacy-centric browsers (Helium, Brave,
// Safari) from blocking Set-Cookie headers as "third-party cookies".
const deriveApiRoot = () => {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  // When running on Vercel (*.vercel.app) or local development, always route through
  // the first-party /api/ proxy. This completely eliminates third-party cookie blocking.
  if (host.endsWith('vercel.app') || host === 'localhost' || host === '127.0.0.1') {
    return '/api/';
  }
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
// always needs an absolute backend origin of its own.
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

// Token storage fallback for environments where third-party cookies are blocked
const TOKEN_KEY = 'cinemora_access_token';
const REFRESH_KEY = 'cinemora_refresh_token';

export const getStoredAccessToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const getStoredRefreshToken = () => {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
};

export const storeAuthTokens = (access, refresh) => {
  try {
    if (access) localStorage.setItem(TOKEN_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // Ignore storage quota/permission errors
  }
};

export const clearAuthTokens = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Ignore storage quota/permission errors
  }
};

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

// Request interceptor: attach Authorization header (token fallback) and CSRF token
api.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
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
    const refreshToken = getStoredRefreshToken();
    const payload = refreshToken ? { refresh: refreshToken } : null;
    refreshing = axios
      .post(`${API_ROOT}token/refresh/`, payload, {
        withCredentials: true,
        headers: currentCsrfToken ? { 'X-CSRFToken': currentCsrfToken } : {},
      })
      .then((res) => {
        if (res.data?.access) {
          storeAuthTokens(res.data.access);
        }
        return res;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

api.interceptors.response.use(
  (response) => {
    if (response.data?.access) {
      storeAuthTokens(response.data.access, response.data.refresh);
    }
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
      if (refreshRes?.data?.access) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${refreshRes.data.access}`;
      }
      if (currentCsrfToken) {
        config.headers = config.headers || {};
        config.headers['X-CSRFToken'] = currentCsrfToken;
      }
      return await api(config);
    } catch (refreshError) {
      clearAuthTokens();
      if (onUnauthorized) onUnauthorized();
      return Promise.reject(refreshError);
    }
  },
);

export default api;
