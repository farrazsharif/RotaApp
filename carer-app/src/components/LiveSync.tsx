import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';

// Opens a socket to the backend while logged in. Whenever anyone in the company
// saves a change (e.g. a manager assigns this carer a shift), the server emits
// `data:changed` and we refetch, so the app shows live data without a refresh.
export default function LiveSync() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem('carer_token');
    if (!user || !token) return;

    const s = io('/', { auth: { token }, transports: ['websocket', 'polling'] });
    s.on('data:changed', () => { qc.invalidateQueries(); });

    return () => { s.disconnect(); };
  }, [user, qc]);

  return null;
}
