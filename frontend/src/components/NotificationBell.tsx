import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { notificationsApi } from '../api/notifications';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markRead, markAllRead, addNotification } = useSocket();

  const { data: initial } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
  });

  useEffect(() => {
    if (initial) initial.forEach((n) => addNotification(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleMarkRead(id: string) {
    markRead(id);
    await notificationsApi.markRead(id);
  }

  async function handleMarkAll() {
    markAllRead();
    await notificationsApi.markAllRead();
  }

  const shown = notifications.slice(0, 20);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={handleMarkAll} className="text-xs text-blue-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {shown.length === 0 ? (
              <p className="px-4 py-8 text-center text-gray-400 text-sm">No notifications</p>
            ) : (
              shown.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.read && handleMarkRead(n.id)}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${!n.read ? 'bg-blue-50' : ''}`}
                >
                  <p className="text-sm font-medium text-gray-800">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
