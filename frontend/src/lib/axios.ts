import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
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
