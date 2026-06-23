import type { ReactNode } from 'react';
import BottomNav from './BottomNav';

export default function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="sticky top-0 z-10 bg-blue-600 text-white px-4 pt-[env(safe-area-inset-top)] pb-3">
        <h1 className="text-lg font-semibold pt-2">{title}</h1>
      </header>
      <main className="flex-1 px-4 py-4 pb-24 max-w-md w-full mx-auto">{children}</main>
      <BottomNav />
    </div>
  );
}
