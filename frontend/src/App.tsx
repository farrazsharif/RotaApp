import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import SetPassword from './pages/SetPassword';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import TimeOff from './pages/TimeOff';
import Attendance from './pages/Attendance';
import Reports from './pages/Reports';
import Users from './pages/Users';
import StaffDetail from './pages/StaffDetail';
import ServiceUsers from './pages/ServiceUsers';
import ServiceUserDetail from './pages/ServiceUserDetail';
import ServiceUserForm from './pages/ServiceUserForm';
import CallLogs from './pages/CallLogs';
import Emar from './pages/Emar';
import CarePlans from './pages/CarePlans';
import Reviews from './pages/Reviews';
import ServicePlans from './pages/ServicePlans';
import Finances from './pages/Finances';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import Platform from './pages/Platform';

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

function PlatformRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.platformAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Platform owners get the cross-company dashboard as their home; everyone else
// gets the normal company dashboard.
function Home() {
  const { user } = useAuth();
  if (user?.platformAdmin) return <Navigate to="/platform" replace />;
  return <Dashboard />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
      <Route path="/set-password" element={<SetPassword />} />
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
        <Route index element={<Home />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="service-users" element={<ServiceUsers />} />
        <Route path="service-users/new" element={<ManagerRoute><ServiceUserForm /></ManagerRoute>} />
        <Route path="service-users/:id" element={<ServiceUserDetail />} />
        <Route path="service-users/:id/edit" element={<ManagerRoute><ServiceUserForm /></ManagerRoute>} />
        <Route path="call-logs" element={<CallLogs />} />
        <Route path="emar" element={<Emar />} />
        <Route path="care-plans" element={<CarePlans />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="service-plans" element={<ServicePlans />} />
        <Route path="time-off" element={<ManagerRoute><TimeOff /></ManagerRoute>} />
        <Route path="attendance" element={<ManagerRoute><Attendance /></ManagerRoute>} />
        <Route path="reports" element={<ManagerRoute><Reports /></ManagerRoute>} />
        <Route path="finances" element={<Finances />} />
        <Route path="users" element={<ManagerRoute><Users /></ManagerRoute>} />
        <Route path="users/:id" element={<ManagerRoute><StaffDetail /></ManagerRoute>} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/billing" element={<Billing />} />
        <Route path="platform" element={<PlatformRoute><Platform /></PlatformRoute>} />
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
