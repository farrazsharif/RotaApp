import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth';

export default function SetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const { data: tokenCheck, isLoading: checking } = useQuery({
    queryKey: ['set-password-token', token],
    queryFn: () => authApi.checkSetPasswordToken(token),
    enabled: !!token,
    retry: false,
  });

  const mut = useMutation({
    mutationFn: () => authApi.setPassword({ token, password }),
    onSuccess: () => setDone(true),
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Could not set password. Please try again.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    mut.mutate();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">RotaApp</h1>
          <p className="text-blue-200">Set your password</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {!token ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              This link is missing its token. Please use the link from your email exactly as sent.
            </p>
          ) : checking ? (
            <p className="text-center text-gray-400 py-4">Checking link…</p>
          ) : !tokenCheck?.valid ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              This link is invalid or has expired. Please ask your manager to send a new invite.
            </div>
          ) : done ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                Password set successfully! You can now sign in.
              </p>
              <button className="btn-primary btn w-full py-2.5" onClick={() => navigate('/login')}>Go to Sign In</button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Choose a password</h2>
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    placeholder="At least 6 characters"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="input"
                  />
                </div>
                <button type="submit" disabled={mut.isPending} className="btn-primary btn w-full py-2.5 mt-2">
                  {mut.isPending ? 'Saving…' : 'Set Password'}
                </button>
              </form>
            </>
          )}
          <p className="text-center text-sm text-gray-400 mt-6">
            <Link to="/login" className="text-blue-600 hover:underline">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
