import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { Notification } from '../types';

// Map the changed API resource (from the server's data:changed payload) to just
// the React Query keys that depend on it, so an unrelated write (e.g. a clock-in)
// no longer forces every open page to refetch its heavy queries (the schedule in
// particular). Only the frequent/heavy resources are listed — anything not here
// falls back to invalidating everything, so correctness is preserved.
const RESOURCE_KEYS: Record<string, string[]> = {
  shifts: ['shifts'],
  'service-users': ['service-users', 'service-user', 'shifts'], // status/site show on shift cards
  sites: ['sites', 'service-users', 'shifts'],
  users: ['users'],
  clock: ['clock-active'],
  notifications: [], // notifications arrive live via the 'notification' event — no refetch needed
};

function resourceSegment(resource?: string): string | null {
  if (!resource) return null;
  const m = resource.replace(/^\/+/, '').match(/^api\/([^/]+)/);
  return m ? m[1] : null;
}

interface SocketContextValue {
  socket: Socket | null;
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Notification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!token) return;

    // Connect the socket straight to the backend in production. The frontend is
    // on Vercel and the backend on Render; Vercel doesn't reliably proxy the
    // WebSocket upgrade, so going through '/' dropped live updates. Talking to
    // the backend host directly restores a real WebSocket. In dev, '/' uses the
    // Vite proxy to the local backend. Override with VITE_SOCKET_URL if needed.
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
      || (import.meta.env.PROD ? 'https://api.caremid.co.uk' : '/');
    const s = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    setSocket(s);

    s.on('notification', (n: Notification) => {
      setNotifications((prev) => [n, ...prev]);
    });

    // Coalesce bursts of change events (e.g. several managers editing at once, or
    // a mutation whose own invalidation overlaps the socket echo) into a single
    // invalidation pass ~300ms later.
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let invalidateAll = false;
    const pendingKeys = new Set<string>();

    const flush = () => {
      flushTimer = null;
      if (invalidateAll) {
        qc.invalidateQueries();
      } else {
        for (const key of pendingKeys) qc.invalidateQueries({ queryKey: [key] });
      }
      invalidateAll = false;
      pendingKeys.clear();
    };
    const scheduleFlush = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 300);
    };

    // Another session in the same company saved a change. Refetch only the
    // queries that depend on the changed resource so unrelated activity (a
    // clock-in, a note) doesn't force heavy pages like the schedule to reload.
    s.on('data:changed', (payload?: { resource?: string }) => {
      const seg = resourceSegment(payload?.resource);
      const mapped = seg != null ? RESOURCE_KEYS[seg] : undefined;
      if (mapped === undefined) {
        invalidateAll = true; // unmapped resource → safe fallback: refetch all
      } else {
        for (const key of mapped) pendingKeys.add(key);
      }
      scheduleFlush();
    });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      s.disconnect();
    };
  }, [token, qc]);

  function addNotification(n: Notification) {
    setNotifications((prev) => [n, ...prev]);
  }

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <SocketContext.Provider value={{ socket, notifications, unreadCount, addNotification, markRead, markAllRead }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
