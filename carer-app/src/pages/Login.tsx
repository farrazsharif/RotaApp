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
  // "Forgot password?" flow — swaps the sign-in form for an email-entry form.
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetSent, setResetSent] = useState('');

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

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await authApi.forgotPassword(email);
      setResetSent(r.message || 'If that email is registered, a reset link has been sent.');
    } catch {
      // Endpoint is deliberately generic; show the same reassuring message.
      setResetSent('If that email is registered, a reset link has been sent.');
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
        {mode === 'login' ? (
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
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(''); setResetSent(''); }}
              className="w-full text-blue-600 text-sm font-medium pt-1"
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgot} className="bg-white rounded-2xl p-5 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Reset your password</h2>
              <p className="text-sm text-gray-500 mt-1">Enter your email and we'll send you a link to set a new password.</p>
            </div>
            {resetSent ? (
              <p className="text-green-700 text-sm bg-green-50 rounded-lg p-3">{resetSent}</p>
            ) : (
              <>
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
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold text-base disabled:opacity-50"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setResetSent(''); }}
              className="w-full text-blue-600 text-sm font-medium pt-1"
            >
              ← Back to sign in
            </button>
          </form>
        )}
        <p className="text-center text-blue-100 text-sm mt-4">
          For carers and staff doing visits.{' '}
          <a href={window.location.hostname.endsWith('caremid.co.uk') ? 'https://portal.caremid.co.uk' : 'http://localhost:5173'}
             className="underline font-medium">Manager portal</a>
        </p>
      </div>
    </div>
  );
}
