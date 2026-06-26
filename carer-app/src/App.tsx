import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { usePushSubscription } from './lib/usePushSubscription';
import Login from './pages/Login';
import Today from './pages/Today';
import Rota from './pages/Rota';
import CallDetail from './pages/CallDetail';
import Profile from './pages/Profile';

function PushRegistration() {
  const { user } = useAuth();
  usePushSubscription(!!user);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PushRegistration />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Today /></ProtectedRoute>} />
          <Route path="/rota" element={<ProtectedRoute><Rota /></ProtectedRoute>} />
          <Route path="/call/:id" element={<ProtectedRoute><CallDetail /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
