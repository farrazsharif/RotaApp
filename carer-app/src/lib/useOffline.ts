import { useEffect, useState } from 'react';
import { flushOutbox, pendingCount, subscribeOutbox } from './outbox';

// Is the device online? Drives the offline banner and triggers a sync when the
// signal comes back.
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => { setOnline(true); void flushOutbox(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

// How many actions are still waiting to reach the server.
export function usePendingCount(): number {
  const [n, setN] = useState(() => pendingCount());
  useEffect(() => subscribeOutbox(() => setN(pendingCount())), []);
  return n;
}
