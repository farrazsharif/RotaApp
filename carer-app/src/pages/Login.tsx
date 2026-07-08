import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Single sign-on handoff: the manager portal redirects carers here with a
  // ?sso=<token> param. Adopt that session so they don't log in twice.
  useEffect(() => {
    const sso = new URLSearchParams(window.location.search).get('sso');
    if (!sso) return;
    setLoading(true);
    localStorage.setItem('carer_token', sso);
    authApi.me()
      .then((u) => {
        localStorage.setItem('carer_user', JSON.stringify(u));
        window.location.replace('/'); // reload so AuthProvider picks up the session
      })
      .catch(() => {
        localStorage.removeItem('carer_token');
        setError('Sign-in link expired — please log in.');
        setLoading(false);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Check your email and password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-600 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Caremid" className="mx-auto mb-3 w-44 rounded-2xl bg-white p-3 shadow-lg" />
          <h1 className="text-lg font-bold text-white">Caremid Carer</h1>
          <p className="text-blue-100 text-sm mt-1">Clock in, log calls, record medication</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 shadow-xl space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold text-base disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
