import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Layout({ title, children }: { title: string; children: ReactNode }) {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="sticky top-0 z-10 bg-blue-600 text-white px-4 pt-[env(safe-area-inset-top)] pb-3">
        <div className="flex items-center justify-between pt-2">
          <h1 className="text-lg font-semibold">{title}</h1>
          <button onClick={logout} className="text-xs text-blue-100 underline">Sign out</button>
        </div>
      </header>
      <main className="flex-1 px-4 py-4 pb-10 max-w-md w-full mx-auto">{children}</main>
    </div>
  );
}
