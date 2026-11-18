import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <Layout title="Profile">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold mx-auto mb-3">
          {user?.firstName?.[0]}{user?.lastName?.[0]}
        </div>
        <p className="font-semibold text-gray-800 text-lg">{user?.firstName} {user?.lastName}</p>
        <p className="text-sm text-gray-500">{user?.email}</p>
        {user?.phone && <p className="text-sm text-gray-500">{user.phone}</p>}
      </div>

      <button
        onClick={() => navigate('/announcements')}
        className="w-full mt-4 bg-white border border-gray-200 rounded-xl py-3.5 px-4 flex items-center justify-between shadow-sm"
      >
        <span className="flex items-center gap-2 font-semibold text-gray-800">📣 Announcements</span>
        <span className="text-gray-400">›</span>
      </button>

      <button
        onClick={() => navigate('/time-off')}
        className="w-full mt-4 bg-white border border-gray-200 rounded-xl py-3.5 px-4 flex items-center justify-between shadow-sm"
      >
        <span className="flex items-center gap-2 font-semibold text-gray-800">🏖️ Time Off</span>
        <span className="text-gray-400">›</span>
      </button>

      {/* Google Play and the App Store both require the privacy policy to be
          reachable from inside the app, not just from the store listing.
          target="_blank" makes Capacitor open it in the system browser rather
          than navigating the app's own webview away from the app. */}
      <a
        href="https://caremid.co.uk/privacy"
        target="_blank"
        rel="noreferrer"
        className="w-full mt-4 bg-white border border-gray-200 rounded-xl py-3.5 px-4 flex items-center justify-between shadow-sm"
      >
        <span className="flex items-center gap-2 font-semibold text-gray-800">🔒 Privacy Policy</span>
        <span className="text-gray-400">›</span>
      </a>

      <button
        onClick={handleLogout}
        className="w-full mt-4 bg-white border border-red-200 text-red-600 rounded-xl py-3 font-semibold"
      >
        Log Out
      </button>
    </Layout>
  );
}
