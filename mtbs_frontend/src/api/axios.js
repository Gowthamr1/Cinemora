import axios from 'axios';

// The REST API is reached through a SAME-ORIGIN `/api/` path by default, never
// a hardcoded backend host. In production a Vercel rewrite (see vercel.json)
// proxies /api/* to the Render backend server-side, so the browser only ever
// makes first-party requests to its own origin — which is what keeps the
// httpOnly auth cookies first-party and lets SameSite=Lax keep working. In
// local dev the CRA dev-server proxy (the "proxy" field in package.json)
// forwards /api/* to the Django dev server on :8000.
//
// REACT_APP_API_ROOT is an optional escape hatch (CRA only inlines REACT_APP_*
// vars, and does so at BUILD time): set it to an absolute origin to bypass the
// proxy and call a backend directly. A trailing slash is normalised in so every
// relative path below stays correct whether or not the value ends in one.
const API_ROOT = (process.env.REACT_APP_API_ROOT || '/api/').replace(/\/?$/, '/');

// WebSockets cannot travel through the Vercel HTTP rewrite, so the seat socket
// always needs an absolute backend origin of its own. Preference order:
//   1. REACT_APP_WS_ROOT — optional override; set it to point the socket at a
//      different backend without touching code. Not required in production.
//   2. Derive from an absolute REACT_APP_API_ROOT (http->ws, /api/ -> /ws/),
//      for anyone who bypasses the proxy via that escape hatch.
//   3. No override set: local dev (localhost/127.0.0.1) talks to the Django dev
//      server on :8000; any deployed build talks to the Render backend, whose
//      host is hardcoded below so production needs no environment variable. The
//      frontend's own origin has no socket server and Vercel can't proxy WS, so
//      the Render host is the only correct target anyway.
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

// Exported so the seat socket can't drift onto a different host than the REST
// calls without it being a deliberate, visible configuration choice.
export const WS_ROOT = deriveWsRoot();

const api = axios.create({
  baseURL: API_ROOT,
  // The JWTs are httpOnly cookies now — this is what actually sends them, and
  // what lets the browser keep the Set-Cookie from a cross-origin login.
  withCredentials: true,
  // Cookies ride along on cross-site requests too, so writes have to prove
  // they came from our own page. axios copies the readable `csrftoken` cookie
  // into this header; Django's CSRF check compares the two.
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
  // Required, not redundant. Since axios 1.6 the XSRF header is attached only
  // when the request is same-origin *or* this flag is set — and :3000 -> :8000
  // is cross-origin. Without it axios silently sends no token and every write
  // comes back 403. (The API is still same-*site*, which is what lets the
  // cookie be read at all; see CSRF_COOKIE_DOMAIN in settings.py.)
  withXSRFToken: true,
});

// Called when the session is gone for good, so AuthContext can drop the user
// without a full page navigation (which would throw away SPA state).
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

// There is nothing left to inspect before a request: the access token is
// httpOnly, so JavaScript can't read its `exp` and refresh proactively the way
// the old interceptor did. Instead we let a call fail with 401, refresh once,
// and replay it.
//
// `refreshing` collapses concurrent failures into one refresh. A page that
// fires four requests at once would otherwise send four refreshes, and with
// rotation enabled later that becomes four different tokens racing.
let refreshing = null;

const refreshSession = () => {
  if (!refreshing) {
    // The raw `axios` library, not this instance, on purpose: `api.post` would
    // re-enter this same interceptor and a failing refresh would recurse.
    refreshing = axios
      .post(`${API_ROOT}token/refresh/`, null, { withCredentials: true })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    // `_retried` stops a request that 401s again *after* a successful refresh
    // from looping forever — that means genuinely forbidden, not stale.
    if (response?.status !== 401 || !config || config._retried) {
      return Promise.reject(error);
    }

    config._retried = true;
    try {
      await refreshSession();
      return await api(config);
    } catch (refreshError) {
      // The refresh cookie is expired or absent; the backend has already
      // cleared both cookies. Nothing left to retry with.
      if (onUnauthorized) onUnauthorized();
      return Promise.reject(refreshError);
    }
  },
);

export default api;
