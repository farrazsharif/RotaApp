import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  // Render's free tier can take 30-60s to wake from sleep on the first
  // request after idle. Without a timeout, a slow/cold backend (or a
  // platform proxy that hangs waiting on it) leaves requests pending
  // forever with no error ever firing — buttons stuck on "Signing in…"
  // with no way to recover. 45s comfortably covers a cold start while
  // still eventually surfacing a retryable error.
  timeout: 45000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let redirectingToLogin = false;

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      // Several requests can fail with 401 at once (e.g. on page load); only
      // redirect once, and skip it entirely if already on the login page —
      // otherwise repeated location.href assignments can leave the page in a
      // half-navigated, blank state.
      if (!redirectingToLogin && window.location.pathname !== '/login') {
        redirectingToLogin = true;
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
