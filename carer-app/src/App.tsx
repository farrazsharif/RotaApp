import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Today from './pages/Today';
import Rota from './pages/Rota';
import CallDetail from './pages/CallDetail';
import Profile from './pages/Profile';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
