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
        onClick={handleLogout}
        className="w-full mt-4 bg-white border border-red-200 text-red-600 rounded-xl py-3 font-semibold"
      >
        Log Out
      </button>
    </Layout>
  );
}
