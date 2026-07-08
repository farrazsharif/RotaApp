import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { PermissionKey } from '../types';
import NotificationBell from './NotificationBell';
import ClockWidget from './ClockWidget';
import { useState } from 'react';

const navItems: { to: string; label: string; icon: string; exact?: boolean; managerOnly?: boolean; capability?: PermissionKey; platformOnly?: boolean }[] = [
  { to: '/platform', label: 'Platform Admin', icon: '🏢', platformOnly: true },
  { to: '/', label: 'Dashboard', icon: '🏠', exact: true },
  { to: '/schedule', label: 'Schedule', icon: '📅', capability: 'manage_schedule' },
  { to: '/service-users', label: 'Service Users', icon: '🧑‍🦽', capability: 'manage_service_users' },
  { to: '/care-plans', label: 'Care Plans', icon: '📋', capability: 'manage_service_users' },
  { to: '/reviews', label: 'Reviews', icon: '🔍', capability: 'manage_reviews' },
  { to: '/service-plans', label: 'Service Plans', icon: '🗂️', capability: 'manage_service_users' },
  { to: '/call-logs', label: 'Call Logs', icon: '📝', capability: 'manage_service_users' },
  { to: '/emar', label: 'eMAR', icon: '💊', capability: 'manage_medications' },
  { to: '/time-off', label: 'Time Off', icon: '🏖️', capability: 'manage_time_off' },
  { to: '/attendance', label: 'Attendance', icon: '⏱️', capability: 'manage_schedule' },
  { to: '/reports', label: 'Reports', icon: '📊', capability: 'view_reports' },
  { to: '/finances', label: 'Finances', icon: '💷', capability: 'manage_billing' },
  { to: '/users', label: 'Staff', icon: '👥', capability: 'manage_staff' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
  const { user, logout, isManager } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const visibleNav = navItems.filter((item) => {
    if (item.platformOnly && !user?.platformAdmin) return false;
    // Platform owners get a platform-only experience: just Platform Admin +
    // Settings, none of the per-company care screens.
    if (user?.platformAdmin && !item.platformOnly && item.to !== '/settings') return false;
    if (item.managerOnly && !isManager) return false;
    if (item.capability && !can(item.capability)) return false;
    return true;
  });

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 text-white flex flex-col transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:static lg:translate-x-0`}>
        <div className="h-16 flex items-center px-6 border-b border-gray-700">
          <span className="text-xl font-bold text-blue-400">Caremid</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
              {user?.firstName[0]}{user?.lastName[0]}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gray-400 truncate">{user?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full btn btn-secondary btn-sm text-gray-300 border-gray-600 hover:bg-gray-800">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <button
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="flex-1 lg:flex-none" />
          <div className="flex items-center gap-3">
            <ClockWidget />
            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
