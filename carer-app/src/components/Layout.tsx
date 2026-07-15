import type { ReactNode } from 'react';
import BottomNav from './BottomNav';

export default function Layout({ title, children, onRefresh, refreshing }: {
  title: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="sticky top-0 z-10 bg-blue-600 text-white px-4 pt-[env(safe-area-inset-top)] pb-3">
        <div className="flex items-center justify-between pt-2">
          <h1 className="text-lg font-semibold">{title}</h1>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh"
              className="p-1.5 -mr-1.5 rounded-full active:bg-white/20 disabled:opacity-60"
            >
              <span className={`inline-block text-xl leading-none ${refreshing ? 'animate-spin' : ''}`}>↻</span>
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 px-4 py-4 pb-24 max-w-md w-full mx-auto">{children}</main>
      <BottomNav />
    </div>
  );
}
