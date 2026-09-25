import axios from 'axios';

// The API origin is configured per environment (CRA inlines REACT_APP_* at
// build time). The localhost default keeps `npm start` working with no .env;
// production sets REACT_APP_API_ROOT to the deployed backend. A trailing slash
// is normalised in so WS_ROOT and every relative path below stay correct
// whether or not the env value ends in one.
const API_ROOT = (process.env.APP_API_ROOT || 'http://localhost:8000/api/')
  .replace(/\/?$/, '/');

// Same server, other protocol: http://host/api/ -> ws://host/ws/. Exported so
// the seat socket can't drift onto a different host than the REST calls.
export const WS_ROOT = API_ROOT.replace(/^http/, 'ws').replace(/\/api\/$/, '/ws/');

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
