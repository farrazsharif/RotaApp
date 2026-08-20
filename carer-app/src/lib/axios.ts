import axios from 'axios';

const api = axios.create({
  // Call the Render API directly in production instead of routing every request
  // through Vercel's /api rewrite — proxied REST (the carer app polls every
  // ~15s) counted as a Vercel Edge Request each and was burning the free-tier
  // quota. Sockets already connect straight to Render; this matches that. Dev
  // keeps '/api' so the Vite proxy → localhost:4000 still works.
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://api.caremid.co.uk/api' : '/api'),
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('carer_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('carer_token');
      localStorage.removeItem('carer_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;
