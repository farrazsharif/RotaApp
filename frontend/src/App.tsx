import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import ShiftTrades from './pages/ShiftTrades';
import TimeOff from './pages/TimeOff';
import Attendance from './pages/Attendance';
import Reports from './pages/Reports';
import Users from './pages/Users';
import ServiceUsers from './pages/ServiceUsers';
import ServiceUserDetail from './pages/ServiceUserDetail';
import CallLogs from './pages/CallLogs';
import Emar from './pages/Emar';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
  const { isManager } = useAuth();
  if (!isManager) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <SocketProvider>
              <Layout />
            </SocketProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="service-users" element={<ServiceUsers />} />
        <Route path="service-users/:id" element={<ServiceUserDetail />} />
        <Route path="call-logs" element={<CallLogs />} />
        <Route path="emar" element={<Emar />} />
        <Route path="trades" element={<ManagerRoute><ShiftTrades /></ManagerRoute>} />
        <Route path="time-off" element={<ManagerRoute><TimeOff /></ManagerRoute>} />
        <Route path="attendance" element={<ManagerRoute><Attendance /></ManagerRoute>} />
        <Route path="reports" element={<ManagerRoute><Reports /></ManagerRoute>} />
        <Route path="users" element={<ManagerRoute><Users /></ManagerRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
