import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import ServiceUsers from './pages/ServiceUsers';
import ServiceUserDetail from './pages/ServiceUserDetail';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/" element={<ProtectedRoute><ServiceUsers /></ProtectedRoute>} />
          <Route path="/client/:id" element={<ProtectedRoute><ServiceUserDetail /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
