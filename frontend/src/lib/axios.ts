import axios from 'axios';

const api = axios.create({
  // Call the Render API directly in production instead of routing every request
  // through Vercel's /api rewrite — proxied REST (the carer/portal polling)
  // counted as a Vercel Edge Request each and was burning the free-tier quota.
  // Sockets already connect straight to Render; this matches that. Dev keeps
  // '/api' so the Vite proxy → localhost:4000 still works.
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://api.caremid.co.uk/api' : '/api'),
  headers: { 'Content-Type': 'application/json' },
  // Render's free tier can take 30-60s to wake from sleep on the first
  // request after idle. Without a timeout, a slow/cold backend (or a
  // platform proxy that hangs waiting on it) leaves requests pending
  // forever with no error ever firing — buttons stuck on "Signing in…"
  // with no way to recover. 120s covers a full cold start PLUS a large
  // series save (e.g. assigning a carer across a 12-month permanent rota);
  // aborting those early rolled the optimistic UI back and looked like lost
  // work. Keeping the instance warm (UptimeRobot pinging /health) avoids the
  // cold-start wait entirely.
  timeout: 120000,
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
    // 402 = subscription inactive / trial ended. Send the user to the billing
    // page so they can subscribe; leave them there if already on it.
    if (err.response?.status === 402 && window.location.pathname !== '/settings/billing') {
      window.location.href = '/settings/billing';
    }
    return Promise.reject(err);
  }
);

export default api;
