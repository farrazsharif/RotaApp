import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, WrongApp } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [wrongApp, setWrongApp] = useState<WrongApp | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setWrongApp(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result) setWrongApp(result); // valid carer/family creds — wrong app
    } catch (err: unknown) {
      const e = err as { code?: string; response?: { data?: { error?: string } } };
      if (e.code === 'ECONNABORTED') {
        setError('The server is taking a while to respond (it may be waking up after being idle). Please try again in a moment.');
      } else {
        setError(e.response?.data?.error || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (wrongApp) {
    const label = wrongApp.app === 'carer' ? 'Carer app' : 'Family portal';
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src="/logo.png" alt="Caremid" className="mx-auto mb-4 w-56 rounded-2xl bg-white p-3 shadow-lg" />
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <h2 className="text-xl font-bold text-gray-800 mb-2">You're in the wrong place</h2>
            <p className="text-gray-600 text-sm mb-6">
              This is the <strong>manager portal</strong>. Your account uses the <strong>{label}</strong> — tap below to go there, no need to sign in again.
            </p>
            <a href={`${wrongApp.url}/login?sso=${encodeURIComponent(wrongApp.token)}`} className="btn-primary btn w-full py-2.5 inline-block">
              Open the {label}
            </a>
            <button onClick={() => { setWrongApp(null); setPassword(''); }} className="mt-4 text-sm text-gray-500 hover:text-gray-700">
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Caremid" className="mx-auto mb-4 w-56 rounded-2xl bg-white p-3 shadow-lg" />
          <p className="text-blue-200">Workforce Scheduling Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Sign in</h2>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className="input"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="input"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary btn w-full py-2.5 mt-2">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            New to Caremid?{' '}
            <Link to="/signup" className="font-medium text-blue-600 hover:text-blue-700">Start a free trial</Link>
          </p>
          <p className="mt-2 text-center text-sm text-gray-500">
            Doing visits?{' '}
            <a href={window.location.hostname.endsWith('caremid.co.uk') ? 'https://carer.caremid.co.uk' : 'http://localhost:5174'}
               className="font-medium text-blue-600 hover:text-blue-700">Open the Carer app</a>
          </p>
        </div>
      </div>
    </div>
  );
}
