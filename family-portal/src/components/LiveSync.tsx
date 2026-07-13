import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';

// Opens a socket to the backend while logged in. Whenever anyone in the company
// saves a change, the server emits `data:changed` and we refetch, so the portal
// shows live data without a manual refresh.
export default function LiveSync() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem('family_token');
    if (!user || !token) return;

    // Connect straight to the backend in production — Vercel doesn't reliably
    // proxy the WebSocket upgrade to Render, which drops live updates. Dev uses
    // '/' via the Vite proxy. Override with VITE_SOCKET_URL if needed.
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
      || (import.meta.env.PROD ? 'https://api.caremid.co.uk' : '/');
    const s = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    s.on('data:changed', () => { qc.invalidateQueries(); });

    return () => { s.disconnect(); };
  }, [user, qc]);

  return null;
}
