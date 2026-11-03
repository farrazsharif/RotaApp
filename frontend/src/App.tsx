import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PermissionKey } from './types';
import { SocketProvider } from './contexts/SocketContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import SetPassword from './pages/SetPassword';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Roster from './pages/Roster';
import TimeOff from './pages/TimeOff';
import Attendance from './pages/Attendance';
import Reports from './pages/Reports';
import Cqc from './pages/Cqc';
import LateCheckins from './pages/LateCheckins';
import MissedMeds from './pages/MissedMeds';
import Users from './pages/Users';
import StaffDetail from './pages/StaffDetail';
import DbsRegister from './pages/DbsRegister';
import TrainingMatrix from './pages/TrainingMatrix';
import ServiceUsers from './pages/ServiceUsers';
import ClientDocuments from './pages/ClientDocuments';
import ServiceUserDetail from './pages/ServiceUserDetail';
import ServiceUserForm from './pages/ServiceUserForm';
import CallLogs from './pages/CallLogs';
import Emar from './pages/Emar';
import CarePlans from './pages/CarePlans';
import Reviews from './pages/Reviews';
import Supervision from './pages/Supervision';
import ServicePlans from './pages/ServicePlans';
import Handovers from './pages/Handovers';
import Incidents from './pages/Incidents';
import Announcements from './pages/Announcements';
import Runs from './pages/Runs';
import SupportedLiving from './pages/SupportedLiving';
import { usePermissions } from './hooks/usePermissions';
import Finances from './pages/Finances';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import ServicePlanTemplate from './pages/ServicePlanTemplate';
import Platform from './pages/Platform';
import BusyOverlay from './components/BusyOverlay';

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


function PlatformRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.platformAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Every guarded page gates on a capability, never on the base account type.
// A custom role can be built on Employee — the New Role form defaults to it —
// and such a user is not "a manager" however many permissions they are given.
// Guarding on the account type meant their ticked permissions did nothing and
// they were bounced to the dashboard with no explanation.
function CapabilityRoute({ cap, children }: { cap: PermissionKey; children: React.ReactNode }) {
  const { can } = usePermissions();
  if (!can(cap)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Platform owners get the cross-company dashboard as their home; everyone else
// gets the normal company dashboard.
function Home() {
  const { user } = useAuth();
  const { can } = usePermissions();
  if (user?.platformAdmin) return <Navigate to="/platform" replace />;
  // Field supervisors (supervision, but not full scheduling) land on their
  // supervision dashboard; coordinators/admins keep the ops dashboard.
  if (can('manage_supervision') && !can('manage_schedule')) return <Navigate to="/supervision" replace />;
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
        <Route path="roster" element={<CapabilityRoute cap="manage_schedule"><Roster /></CapabilityRoute>} />
        <Route path="service-users" element={<ServiceUsers />} />
        <Route path="documents" element={<CapabilityRoute cap="manage_service_users"><ClientDocuments /></CapabilityRoute>} />
        <Route path="service-users/new" element={<CapabilityRoute cap="manage_service_users"><ServiceUserForm /></CapabilityRoute>} />
        <Route path="service-users/:id" element={<ServiceUserDetail />} />
        <Route path="service-users/:id/edit" element={<CapabilityRoute cap="manage_service_users"><ServiceUserForm /></CapabilityRoute>} />
        <Route path="call-logs" element={<CallLogs />} />
        <Route path="emar" element={<Emar />} />
        <Route path="care-plans" element={<CarePlans />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="supervision" element={<Supervision />} />
        <Route path="service-plans" element={<ServicePlans />} />
        <Route path="time-off" element={<CapabilityRoute cap="manage_time_off"><TimeOff /></CapabilityRoute>} />
        <Route path="attendance" element={<CapabilityRoute cap="manage_schedule"><Attendance /></CapabilityRoute>} />
        <Route path="handovers" element={<CapabilityRoute cap="manage_schedule"><Handovers /></CapabilityRoute>} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="announcements" element={<CapabilityRoute cap="manage_schedule"><Announcements /></CapabilityRoute>} />
        <Route path="runs" element={<CapabilityRoute cap="manage_schedule"><Runs /></CapabilityRoute>} />
        <Route path="supported-living" element={<SupportedLiving />} />
        <Route path="reports" element={<CapabilityRoute cap="view_reports"><Reports /></CapabilityRoute>} />
        <Route path="cqc" element={<CapabilityRoute cap="manage_cqc"><Cqc /></CapabilityRoute>} />
        <Route path="late-checkins" element={<CapabilityRoute cap="manage_schedule"><LateCheckins /></CapabilityRoute>} />
        <Route path="missed-meds" element={<CapabilityRoute cap="manage_medications"><MissedMeds /></CapabilityRoute>} />
        <Route path="finances" element={<Finances />} />
        <Route path="users" element={<CapabilityRoute cap="manage_staff"><Users /></CapabilityRoute>} />
        <Route path="users/:id" element={<CapabilityRoute cap="manage_staff"><StaffDetail /></CapabilityRoute>} />
        <Route path="dbs" element={<CapabilityRoute cap="manage_dbs"><DbsRegister /></CapabilityRoute>} />
        <Route path="training" element={<CapabilityRoute cap="manage_staff"><TrainingMatrix /></CapabilityRoute>} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/billing" element={<Billing />} />
        <Route path="settings/service-plan-template" element={<ServicePlanTemplate />} />
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
        <BusyOverlay />
      </AuthProvider>
    </BrowserRouter>
  );
}
