import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { PermissionKey } from '../types';
import NotificationBell from './NotificationBell';
import OfficeNotes from './OfficeNotes';
import { useState } from 'react';

const navItems: { to: string; label: string; icon: string; exact?: boolean; managerOnly?: boolean; capability?: PermissionKey; platformOnly?: boolean }[] = [
  { to: '/platform', label: 'Platform Admin', icon: '🏢', platformOnly: true },
  { to: '/', label: 'Dashboard', icon: '🏠', exact: true },
  { to: '/schedule', label: 'Schedule', icon: '📅', capability: 'manage_schedule' },
  { to: '/runs', label: 'Runs', icon: '🚐', capability: 'manage_schedule' },
  { to: '/service-users', label: 'Service Users', icon: '🧑‍🦽', capability: 'manage_service_users' },
  { to: '/care-plans', label: 'Care Plans', icon: '📋', capability: 'manage_service_users' },
  { to: '/service-plans', label: 'Service Plans', icon: '🗂️', capability: 'manage_service_users' },
  { to: '/call-logs', label: 'Call Logs', icon: '📝', capability: 'manage_service_users' },
  { to: '/emar', label: 'eMAR', icon: '💊', capability: 'manage_medications' },
  { to: '/supervision', label: 'Supervision', icon: '✅', capability: 'manage_supervision' },
  { to: '/time-off', label: 'Time Off', icon: '🏖️', capability: 'manage_time_off' },
  { to: '/attendance', label: 'Attendance', icon: '⏱️', capability: 'manage_schedule' },
  { to: '/handovers', label: 'Handovers', icon: '🤝', capability: 'manage_schedule' },
  { to: '/announcements', label: 'Announcements', icon: '📣', capability: 'manage_schedule' },
  { to: '/reports', label: 'Reports', icon: '📊', capability: 'view_reports' },
  { to: '/finances', label: 'Finances', icon: '💷', capability: 'manage_billing' },
  { to: '/users', label: 'Staff', icon: '👥', capability: 'manage_staff' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

const LAYOUT_KEY = 'caremid.layout';

export default function Layout() {
  const { user, logout, isManager } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Opt-in new layout. Defaults to the current ("classic") layout, so nothing
  // changes for anyone until they choose to try it — and switching back is
  // instant (this flag lives only in the browser).
  const [layout, setLayout] = useState<string>(() => localStorage.getItem(LAYOUT_KEY) || 'classic');

  function setLayoutMode(mode: string) {
    localStorage.setItem(LAYOUT_KEY, mode);
    setLayout(mode);
    setSidebarOpen(false);
  }

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

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`;

  // ---------------------------------------------------------------------------
  // Option B — "focused command center": a slim icon rail that expands on hover
  // so the content gets maximum width, and a top bar with the current page name.
  // ---------------------------------------------------------------------------
  if (layout === 'b') {
    const pageTitle =
      (navItems.find((i) => i.to === location.pathname)
        || navItems.filter((i) => i.to !== '/').find((i) => location.pathname.startsWith(i.to)))?.label
      || 'Dashboard';

    return (
      <div className="flex h-screen bg-gray-50">
        {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* Slim rail: 64px on desktop, expands to 240px on hover; full drawer on mobile */}
        <aside
          className={`group fixed inset-y-0 left-0 z-30 bg-gray-900 text-white flex flex-col overflow-hidden
            w-60 lg:w-16 lg:hover:w-60 transition-[width] duration-200
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        >
          <div className="h-16 flex items-center gap-3 px-[14px] shrink-0">
            <img src="/icon-192.png" alt="Caremid" className="w-9 h-9 rounded-lg bg-white object-contain shrink-0" />
            <span className="text-lg font-bold text-blue-300 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">Caremid</span>
          </div>

          <nav className="flex-1 overflow-y-auto py-2">
            {visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                title={item.label}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 h-11 px-[18px] text-sm font-medium transition-colors ${
                    isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <span className="text-lg w-6 text-center shrink-0">{item.icon}</span>
                <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-gray-800 p-2 shrink-0 space-y-1">
            <div className="flex items-center gap-3 px-[10px] py-1.5">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold shrink-0">{initials}</div>
              <div className="overflow-hidden opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                <p className="text-sm font-medium text-white truncate">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-gray-400 truncate">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={() => setLayoutMode('classic')}
              title="Switch back to the classic layout"
              className="w-full flex items-center gap-3 h-9 px-[18px] rounded-lg text-sm text-gray-300 hover:bg-gray-800"
            >
              <span className="w-6 text-center shrink-0">↩</span>
              <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">Classic layout</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 h-9 px-[18px] rounded-lg text-sm text-gray-300 hover:bg-gray-800"
            >
              <span className="w-6 text-center shrink-0">⎋</span>
              <span className="whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">Sign out</span>
            </button>
          </div>
        </aside>

        {/* Main, offset by the slim rail so hover-expand overlays instead of shoving content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:ml-16">
          <header className="h-16 bg-white border-b border-gray-200 flex items-center gap-3 px-4 lg:px-6 shrink-0">
            <button className="lg:hidden inline-flex items-center gap-2 min-h-[44px] px-3 py-2 -ml-1 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 active:bg-gray-200" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <span className="text-xl leading-none">☰</span>
              <span className="text-sm">Menu</span>
            </button>
            <div className="min-w-0">
              <p className="text-[11px] leading-none text-gray-400">Caremid</p>
              <h1 className="text-base font-semibold text-gray-900 truncate">{pageTitle}</h1>
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <NotificationBell />
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold" title={`${user?.firstName} ${user?.lastName}`}>{initials}</div>
            </div>
          </header>

          <div className="flex-1 flex min-h-0">
            <main className="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
              <Outlet />
            </main>
            {location.pathname === '/' && isManager && <OfficeNotes />}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Classic layout (default, unchanged) — full-width sidebar.
  // ---------------------------------------------------------------------------
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 text-white flex flex-col transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:static lg:translate-x-0`}>
        <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-700">
          <img src="/icon-192.png" alt="Caremid" className="w-9 h-9 rounded-lg bg-white object-contain shrink-0" />
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
          <button
            onClick={() => setLayoutMode('b')}
            className="w-full btn btn-secondary btn-sm text-blue-300 border-gray-600 hover:bg-gray-800 mb-2"
          >
            ✨ Try new layout
          </button>
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
            className="lg:hidden inline-flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 active:bg-gray-200"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span className="text-xl leading-none">☰</span>
            <span className="text-sm">Menu</span>
          </button>
          <div className="flex-1 lg:flex-none" />
          <div className="flex items-center gap-3">
            <NotificationBell />
          </div>
        </header>

        {/* Page content + office-notes rail (dashboard only, office staff) */}
        <div className="flex-1 flex min-h-0">
          <main className="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
            <Outlet />
          </main>
          {location.pathname === '/' && isManager && <OfficeNotes />}
        </div>
      </div>
    </div>
  );
}
